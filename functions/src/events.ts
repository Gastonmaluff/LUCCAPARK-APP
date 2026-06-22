import { HttpsError } from 'firebase-functions/v2/https'
import {
  asRecord,
  db,
  executeIdempotent,
  newDocumentId,
  nonNegativeMoney,
  optionalString,
  positiveMoney,
  requiredString,
  serverTimestamp,
  stringValue,
  validCardType,
  validPaymentMethod,
  writeActivity,
  type UserRole,
} from './common'

const EVENT_PAYMENT_ROLES: readonly UserRole[] = ['admin', 'socio', 'encargado_eventos']
const invalidPaymentStates = new Set(['void', 'voided', 'cancelled', 'refunded'])
const concepts = new Set(['deposit', 'partial', 'balance', 'other'])

export const registerEventPaymentSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const eventId = requiredString(input.eventId, 'El evento')
  const amount = positiveMoney(input.amount, 'El monto recibido')
  const paymentMethod = validPaymentMethod(input.paymentMethod)
  const cardType = validCardType(paymentMethod, input.cardType)
  const concept = concepts.has(stringValue(input.concept)) ? stringValue(input.concept) : 'partial'
  const notes = optionalString(input.notes)
  const reference = optionalString(input.reference)

  return executeIdempotent({
    uid,
    roles: EVENT_PAYMENT_ROLES,
    operationType: 'register_event_payment',
    entityId: eventId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { amount, paymentMethod, cardType, concept, notes, reference },
    handler: async (transaction, actor) => {
      const eventRef = db.collection('events').doc(eventId)
      const [eventSnapshot, paymentSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(db.collection('payments').where('eventId', '==', eventId)),
      ])
      if (!eventSnapshot.exists) throw new HttpsError('not-found', 'La reserva seleccionada ya no existe.')
      const event = eventSnapshot.data() ?? {}
      if (event.status === 'cancelled') throw new HttpsError('failed-precondition', 'No se pueden registrar cobros sobre una reserva cancelada.')
      const totalAmount = positiveMoney(event.totalAmount, 'El total contratado')
      const paidAmount = paymentSnapshot.docs.reduce((sum, document) => {
        const payment = document.data()
        if (invalidPaymentStates.has(stringValue(payment.status).toLowerCase())) return sum
        if (payment.source !== 'event_payment' && payment.concepts !== 'event') return sum
        return sum + nonNegativeMoney(payment.eventAmountPaid ?? payment.totalPaid ?? 0, 'Un pago historico del evento')
      }, 0)
      const pendingAmount = totalAmount - paidAmount
      if (pendingAmount <= 0) throw new HttpsError('failed-precondition', 'La reserva ya no tiene saldo pendiente.')
      if (amount > pendingAmount) throw new HttpsError('failed-precondition', 'El monto supera el saldo pendiente real de la reserva.')
      const nextPaid = paidAmount + amount
      const nextPending = totalAmount - nextPaid
      const financialStatus = nextPending === 0 ? 'paid' : concept === 'deposit' ? 'deposit' : 'partial'
      const paymentId = newDocumentId('payments')
      const conceptLabel: Record<string, string> = {
        balance: 'Saldo final', deposit: 'Sena', other: 'Otro cobro', partial: 'Pago parcial',
      }
      transaction.create(db.collection('payments').doc(paymentId), {
        id: paymentId,
        eventId,
        eventName: stringValue(event.title),
        customerName: stringValue(event.customerName),
        source: 'event_payment',
        concepts: 'event',
        status: 'paid',
        eventAmountPaid: amount,
        parkAmountPaid: 0,
        canteenAmountPaid: 0,
        totalPaid: amount,
        paymentMethod,
        cardType,
        description: `${conceptLabel[concept]} - ${stringValue(event.title) || 'Evento'}`,
        notes,
        reference,
        paidAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
        createdByName: actor.name,
        createdByRole: actor.role,
        sourceIntegrity: 'secure_backend',
      })
      transaction.update(eventRef, {
        eventPaidAmount: nextPaid,
        financialStatus,
        pendingAmount: nextPending,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        financialUpdatedByBackend: true,
      })
      writeActivity(transaction, actor, {
        action: 'creation', module: 'Reservas', description: `Registro ${conceptLabel[concept].toLowerCase()} de ${stringValue(event.title) || eventId}`,
        entityId: eventId, entityName: stringValue(event.title),
        metadata: { paymentId, amount, paymentMethod, previousPaid: paidAmount, newPaid: nextPaid, previousBalance: pendingAmount, newBalance: nextPending, concept },
      })
      return { eventId, paymentId, amount, paidAmount: nextPaid, pendingAmount: nextPending, financialStatus }
    },
  })
}

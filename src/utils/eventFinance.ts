import type { LuccaEvent, PaymentRecord } from '../types'
import { parseCurrencyInput } from './money'
import { formatEventTitle } from './textFormat'

const eventPaymentPredicate = (payment: PaymentRecord, eventId: string) =>
  payment.eventId === eventId && (payment.source === 'event_payment' || payment.concepts === 'event')

export const sumEventPayments = (eventId: string, payments: PaymentRecord[] = []) =>
  payments
    .filter((payment) => eventPaymentPredicate(payment, eventId))
    .reduce((sum, payment) => sum + parseCurrencyInput(payment.totalPaid), 0)

export const getEventPaidAmount = (
  event: Pick<LuccaEvent, 'id' | 'depositAmount' | 'eventPaidAmount' | 'pendingAmount' | 'totalAmount'>,
  payments: PaymentRecord[] = [],
) => {
  const paymentTotal = sumEventPayments(event.id, payments)
  const storedPaid = parseCurrencyInput(event.eventPaidAmount)
  const depositAmount = parseCurrencyInput(event.depositAmount)

  if (paymentTotal > 0) return paymentTotal
  if (storedPaid > 0) return storedPaid
  if (depositAmount > 0) return depositAmount
  return 0
}

export const getEventPendingAmount = (
  event: Pick<LuccaEvent, 'id' | 'depositAmount' | 'eventPaidAmount' | 'pendingAmount' | 'totalAmount'>,
  payments: PaymentRecord[] = [],
) => {
  const totalAmount = parseCurrencyInput(event.totalAmount)
  if (totalAmount <= 0) {
    return parseCurrencyInput(event.pendingAmount)
  }
  return Math.max(0, totalAmount - getEventPaidAmount(event, payments))
}

export const getEventFinancialLabel = (
  event: Pick<LuccaEvent, 'id' | 'depositAmount' | 'eventPaidAmount' | 'pendingAmount' | 'totalAmount'>,
  payments: PaymentRecord[] = [],
) => {
  const totalAmount = parseCurrencyInput(event.totalAmount)
  const paidAmount = getEventPaidAmount(event, payments)
  const pendingAmount = getEventPendingAmount(event, payments)
  if (totalAmount <= 0) return 'Sin monto definido'
  if (pendingAmount <= 0) return 'Pagado completo'
  if (paidAmount <= 0) return 'Sin pagos'
  if (paidAmount <= parseCurrencyInput(event.depositAmount)) return 'Seña registrada'
  return 'Pago parcial'
}

export const buildLegacyEventDepositPayment = (event: LuccaEvent, paymentTotal: number): PaymentRecord => {
  const createdAt = event.createdAt ?? (event.date ? new Date(`${event.date}T12:00:00`) : new Date())
  return {
    id: `legacy-event-deposit-${event.id}`,
    accountType: 'event',
    cardType: '',
    childName: event.birthdayChildName || event.title,
    concepts: 'event',
    createdAt,
    createdBy: event.createdBy ?? null,
    createdByName: event.createdByName ?? '',
    customerName: event.customerName,
    description: `Seña registrada - ${formatEventTitle(event.title || event.birthdayChildName || 'Evento')}`,
    eventId: event.id,
    eventName: event.title || event.birthdayChildName,
    paidAt: createdAt,
    paymentMethod: '',
    source: 'event_payment',
    totalPaid: paymentTotal,
    eventAmountPaid: paymentTotal,
  }
}

import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { calculateTrustedOrderTotals } from './canteen'
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
  timestampFromUnknown,
  validCardType,
  validPaymentMethod,
  writeActivity,
  type Actor,
  type UserRole,
} from './common'

const VISIT_ROLES: readonly UserRole[] = ['admin', 'socio', 'recepcion']
const CHECKOUT_ROLES: readonly UserRole[] = ['admin', 'socio', 'recepcion', 'cantina']

const plans = {
  'one-hour': { id: 'one-hour', name: '1 hora', durationMinutes: 60, isUnlimited: false, defaultPrice: 60000 },
  'two-hours': { id: 'two-hours', name: '2 horas', durationMinutes: 120, isUnlimited: false, defaultPrice: 100000 },
  unlimited: { id: 'unlimited', name: 'Libre / sin limite', durationMinutes: null, isUnlimited: true, defaultPrice: null },
} as const

type PlanId = keyof typeof plans

interface VisitCharge {
  charge: number
  paid: number
  pending: number
  legacyPricing: boolean
}

const normalizedDocumentNumber = (value: unknown) => stringValue(value).replace(/\D/g, '')
const lowerSearchKey = (value: string) => value.trim().toLocaleLowerCase('es')

const resolvePlan = (input: Record<string, unknown>, actor: Actor) => {
  const planId = stringValue(input.planId) as PlanId
  const plan = plans[planId]
  if (!plan) throw new HttpsError('invalid-argument', 'El plan de visita no es valido.')
  const customAmount = input.customAmount === true
  if (customAmount && !['admin', 'socio'].includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Solo Administracion puede aplicar un importe especial.')
  }
  if (plan.isUnlimited && !customAmount) {
    throw new HttpsError('failed-precondition', 'El plan libre requiere un importe autorizado por Administracion.')
  }
  const chargeAmount = customAmount
    ? positiveMoney(input.amountCharged, 'El importe especial')
    : plan.defaultPrice ?? 0
  return { plan, customAmount, chargeAmount }
}

const expectedEndAt = (startedAt: Timestamp, durationMinutes: number | null) =>
  durationMinutes === null ? null : Timestamp.fromMillis(startedAt.toMillis() + durationMinutes * 60 * 1000)

const resolveVisitCharge = (visit: DocumentData): VisitCharge => {
  const planId = stringValue(visit.planId) as PlanId
  const plan = plans[planId]
  const secureDocument = visit.sourceIntegrity === 'secure_backend'
  let baseAmount: number
  let legacyPricing = !secureDocument

  if (plan && visit.customAmount !== true) {
    baseAmount = plan.defaultPrice ?? 0
  } else {
    baseAmount = nonNegativeMoney(
      visit.amountCharged ?? visit.defaultAmount ?? visit.parkChargeAmount ?? 0,
      'El importe historico de la visita',
    )
    legacyPricing = true
  }

  const extensions = Array.isArray(visit.timeExtensions) ? visit.timeExtensions : []
  const extensionAmount = extensions.reduce((sum: number, raw: unknown) => {
    const extension = asRecord(raw)
    const minutes = Number(extension.minutes)
    if (minutes === 30) return sum + 30000
    if (minutes === 60) return sum + 60000
    throw new HttpsError('failed-precondition', 'La visita contiene una extension historica invalida y requiere revision.')
  }, 0)
  const trustedCharge = baseAmount + extensionAmount
  const legacyStoredCharge = nonNegativeMoney(visit.parkChargeAmount ?? trustedCharge, 'El cargo historico de parque')
  const charge = secureDocument ? trustedCharge : legacyStoredCharge
  const paid = nonNegativeMoney(
    visit.paidParkAmount ?? (visit.paymentStatus === 'paid' ? charge : 0),
    'El importe historico pagado',
  )
  if (paid > charge) {
    throw new HttpsError('failed-precondition', 'La visita registra un pago mayor a su cargo y requiere revision administrativa.')
  }
  return { charge, paid, pending: charge - paid, legacyPricing }
}

const paymentBase = (actor: Actor, data: Record<string, unknown>) => ({
  ...data,
  status: 'paid',
  paidAt: serverTimestamp(),
  createdAt: serverTimestamp(),
  createdBy: actor.uid,
  createdByName: actor.name,
  createdByRole: actor.role,
  sourceIntegrity: 'secure_backend',
})

const queryCustomer = async (transaction: Transaction, input: Record<string, unknown>) => {
  const explicitId = stringValue(input.customerId)
  if (explicitId) {
    const explicitSnapshot = await transaction.get(db.collection('customers').doc(explicitId))
    if (explicitSnapshot.exists) return explicitSnapshot
  }
  const documentNumber = normalizedDocumentNumber(input.customerDocumentNumberNormalized ?? input.customerDocumentNumber)
  if (documentNumber) {
    const snapshot = await transaction.get(db.collection('customers').where('documentNumberNormalized', '==', documentNumber).limit(2))
    if (snapshot.size > 1) throw new HttpsError('failed-precondition', 'La cedula esta asociada a responsables duplicados y requiere revision.')
    if (!snapshot.empty) return snapshot.docs[0]
  }
  const phone = stringValue(input.customerPhone).replace(/\D/g, '')
  if (phone) {
    const snapshot = await transaction.get(db.collection('customers').where('phone', '==', phone).limit(2))
    if (snapshot.size > 1) throw new HttpsError('failed-precondition', 'El telefono esta asociado a responsables duplicados y requiere revision.')
    if (!snapshot.empty) return snapshot.docs[0]
  }
  return null
}

const queryChild = async (
  transaction: Transaction,
  input: Record<string, unknown>,
  customerId: string,
  childName: string,
) => {
  const explicitId = stringValue(input.childId)
  if (explicitId) {
    const explicitSnapshot = await transaction.get(db.collection('children').doc(explicitId))
    if (explicitSnapshot.exists) return explicitSnapshot
  }
  const snapshot = await transaction.get(db.collection('children').where('mainCustomerId', '==', customerId).limit(50))
  return snapshot.docs.find((document) => lowerSearchKey(stringValue(document.data().name)) === lowerSearchKey(childName)) ?? null
}

export const createVisitSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const provisionalEntity = stringValue(input.groupEntryId) || `${stringValue(input.childId)}:${stringValue(input.childName)}:${stringValue(input.startedAt)}`
  return executeIdempotent({
    uid,
    roles: VISIT_ROLES,
    operationType: 'create_visit',
    entityId: provisionalEntity,
    idempotencyKey: input.idempotencyKey,
    fingerprint: input,
    handler: async (transaction, actor) => {
      const childName = requiredString(input.childName, 'El nombre del nino')
      const customerName = requiredString(input.customerName, 'El responsable')
      const customerPhone = stringValue(input.customerPhone).replace(/\D/g, '')
      const customerDocument = optionalString(input.customerDocumentNumber)
      const documentNormalized = normalizedDocumentNumber(input.customerDocumentNumberNormalized ?? customerDocument)
      if (documentNormalized && documentNormalized.length < 4) throw new HttpsError('invalid-argument', 'La cedula del responsable es demasiado corta.')
      const startedAt = timestampFromUnknown(input.startedAt)
      const now = Timestamp.now()
      if (startedAt.toMillis() > now.toMillis() + 12 * 60 * 60 * 1000 || startedAt.toMillis() < now.toMillis() - 7 * 24 * 60 * 60 * 1000) {
        throw new HttpsError('invalid-argument', 'La hora de ingreso esta fuera del rango operativo permitido.')
      }
      const { plan, customAmount, chargeAmount } = resolvePlan(input, actor)
      const paymentStatus = stringValue(input.paymentStatus)
      if (!['paid', 'payAtExit', 'pending'].includes(paymentStatus)) throw new HttpsError('invalid-argument', 'El estado de pago no es valido.')
      const paymentMethod = paymentStatus === 'paid' ? validPaymentMethod(input.paymentMethod) : ''
      const cardType = paymentStatus === 'paid' ? validCardType(paymentMethod, input.cardType) : ''

      const customerSnapshot = await queryCustomer(transaction, input)
      const customerRef = customerSnapshot?.ref ?? db.collection('customers').doc()
      const childSnapshot = await queryChild(transaction, input, customerRef.id, childName)
      const childRef = childSnapshot?.ref ?? db.collection('children').doc()
      const visitId = newDocumentId('visits')
      const visitRef = db.collection('visits').doc(visitId)
      const activeRef = db.collection('activeVisits').doc(visitId)
      const customerData = customerSnapshot?.data() ?? {}

      const customerPayload = {
        name: customerName,
        phone: customerPhone,
        relation: optionalString(input.customerRelation),
        documentNumber: customerDocument,
        documentNumberNormalized: documentNormalized,
        childrenIds: FieldValue.arrayUnion(childRef.id),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        ...(customerSnapshot ? {} : { createdAt: serverTimestamp(), createdBy: actor.uid, marketingConsent: false }),
      }
      if (customerSnapshot) transaction.set(customerRef, customerPayload, { merge: true })
      else transaction.create(customerRef, customerPayload)

      const childPayload = {
        id: childRef.id,
        name: childName,
        searchName: lowerSearchKey(childName),
        customerId: customerRef.id,
        customerName,
        customerPhone,
        mainCustomerId: customerRef.id,
        mainCustomerName: customerName,
        mainCustomerPhone: customerPhone,
        guardianId: customerRef.id,
        guardianDocumentNumber: customerDocument,
        guardianDocumentNumberNormalized: documentNormalized,
        guardianName: customerName,
        guardianPhone: customerPhone,
        source: 'visit',
        lastSource: 'visit',
        lastVisitAt: startedAt,
        visitCount: FieldValue.increment(1),
        birthDate: optionalString(input.childBirthDate),
        ageRange: optionalString(input.childAgeRange),
        exactAge: input.childExactAge === null || input.childExactAge === undefined ? null : Number(input.childExactAge),
        ageCalculated: input.childAgeCalculated === null || input.childAgeCalculated === undefined ? null : Number(input.childAgeCalculated),
        gender: optionalString(input.childGender),
        notes: optionalString(input.childNotes),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        ...(childSnapshot ? {} : { eventGuestCount: 0, marketingConsent: false, createdAt: serverTimestamp(), createdBy: actor.uid }),
      }
      if (childSnapshot) transaction.set(childRef, childPayload, { merge: true })
      else transaction.create(childRef, childPayload)

      const visitPayload = {
        id: visitId,
        groupEntryId: optionalString(input.groupEntryId),
        childId: childRef.id,
        childName,
        childBirthDate: optionalString(input.childBirthDate),
        childAgeRange: optionalString(input.childAgeRange),
        childExactAge: input.childExactAge === null || input.childExactAge === undefined ? null : Number(input.childExactAge),
        childAgeCalculated: input.childAgeCalculated === null || input.childAgeCalculated === undefined ? null : Number(input.childAgeCalculated),
        childGender: optionalString(input.childGender),
        customerId: customerRef.id,
        customerName,
        customerPhone,
        customerRelation: optionalString(input.customerRelation),
        customerDocumentNumber: customerDocument,
        customerDocumentNumberNormalized: documentNormalized,
        guardianId: customerRef.id,
        guardianDocumentNumber: customerDocument,
        guardianDocumentNumberNormalized: documentNormalized,
        childrenCount: 1,
        planId: plan.id,
        planName: plan.name,
        durationMinutes: plan.durationMinutes,
        isUnlimited: plan.isUnlimited,
        startedAt,
        expectedEndAt: expectedEndAt(startedAt, plan.durationMinutes),
        paymentStatus,
        paymentMethod,
        cardType,
        amountCharged: chargeAmount,
        parkChargeAmount: chargeAmount,
        paidParkAmount: paymentStatus === 'paid' ? chargeAmount : 0,
        extensionChargeAmount: 0,
        parkPaymentStatus: paymentStatus === 'paid' ? 'paid' : 'pending',
        parkPaidAt: paymentStatus === 'paid' ? serverTimestamp() : null,
        parkPaymentMethod: paymentMethod,
        defaultAmount: plan.defaultPrice,
        customAmount,
        notes: optionalString(input.notes),
        timeExtensions: [],
        status: 'active',
        createdAt: now,
        updatedAt: serverTimestamp(),
        createdBy: actor.uid,
        createdByName: actor.name,
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
      }
      transaction.create(visitRef, visitPayload)
      transaction.create(activeRef, visitPayload)

      let paymentId = ''
      if (paymentStatus === 'paid') {
        if (chargeAmount <= 0) throw new HttpsError('failed-precondition', 'No se puede registrar como pagada una visita sin importe.')
        paymentId = newDocumentId('payments')
        transaction.create(db.collection('payments').doc(paymentId), paymentBase(actor, {
          id: paymentId,
          visitId,
          source: 'reception_entry',
          concepts: 'park',
          description: `Entrada ${plan.name} - ${childName}`,
          childName,
          customerName,
          parkAmountPaid: chargeAmount,
          canteenAmountPaid: 0,
          eventAmountPaid: 0,
          totalPaid: chargeAmount,
          paymentMethod,
          cardType,
        }))
      }
      writeActivity(transaction, actor, {
        action: 'create', module: 'Recepcion', description: `Registro ingreso de ${childName}`,
        entityId: visitId, entityName: childName,
        metadata: { amount: chargeAmount, plan: plan.name, responsible: customerName, customerId: customerRef.id, paymentId, reusedCustomer: Boolean(customerSnapshot), previousCustomerName: stringValue(customerData.name) },
      })
      return { visitId, customerId: customerRef.id, childId: childRef.id, paymentId, amount: chargeAmount }
    },
  })
}

const getActiveVisits = async (transaction: Transaction, input: Record<string, unknown>) => {
  const groupEntryId = stringValue(input.groupEntryId)
  if (groupEntryId) {
    const snapshot = await transaction.get(db.collection('activeVisits').where('groupEntryId', '==', groupEntryId))
    const visits = snapshot.docs.filter((document) => document.data().status === 'active')
    if (visits.length === 0) throw new HttpsError('not-found', 'No hay visitas activas para este grupo.')
    return visits
  }
  const visitIds = Array.isArray(input.visitIds) ? input.visitIds.map(stringValue).filter(Boolean) : []
  const visitId = stringValue(input.visitId) || visitIds[0]
  if (!visitId) throw new HttpsError('invalid-argument', 'Indica la visita o grupo a cobrar.')
  const snapshot = await transaction.get(db.collection('activeVisits').doc(visitId))
  if (!snapshot.exists || snapshot.data()?.status !== 'active') throw new HttpsError('not-found', 'La visita ya no esta activa.')
  return [snapshot as QueryDocumentSnapshot]
}

const getRelatedOrders = async (transaction: Transaction, visits: QueryDocumentSnapshot[]) => {
  const groupEntryId = visits.map((document) => stringValue(document.data().groupEntryId)).find(Boolean)
  const snapshots = []
  if (groupEntryId) {
    snapshots.push(await transaction.get(db.collection('canteenOrders').where('groupEntryId', '==', groupEntryId)))
  } else {
    snapshots.push(await transaction.get(db.collection('canteenOrders').where('visitId', '==', visits[0].id)))
    snapshots.push(await transaction.get(db.collection('canteenOrders').where('visitIds', 'array-contains', visits[0].id)))
  }
  const byId = new Map<string, QueryDocumentSnapshot>()
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => byId.set(document.id, document)))
  return [...byId.values()]
}

export const checkoutVisitGroupSecure = async (
  uid: string | null | undefined,
  rawInput: unknown,
  testOptions: { failBeforeWrites?: boolean } = {},
) => {
  const input = asRecord(rawInput)
  const entityId = stringValue(input.groupEntryId) || stringValue(input.visitId) || (Array.isArray(input.visitIds) ? input.visitIds.map(stringValue).filter(Boolean).join(',') : '')
  const finishVisits = input.finishVisits === true || input.finishVisit === true
  const source = stringValue(input.source) === 'canteen' ? 'canteen' : 'reception'

  return executeIdempotent({
    uid,
    roles: CHECKOUT_ROLES,
    operationType: 'checkout_visit_group',
    entityId: requiredString(entityId, 'La visita o grupo'),
    idempotencyKey: input.idempotencyKey,
    fingerprint: { entityId, finishVisits, source, paymentMethod: input.paymentMethod, cardType: input.cardType },
    handler: async (transaction, actor) => {
      if (actor.role === 'cantina' && finishVisits) {
        throw new HttpsError('permission-denied', 'Cantina puede cobrar, pero la salida debe finalizar desde Recepcion.')
      }
      const visits = await getActiveVisits(transaction, input)
      const orders = await getRelatedOrders(transaction, visits)
      const openOrders = orders.filter((document) => {
        const order = document.data()
        return order.status === 'open' && order.paymentStatus !== 'paid'
      })
      const visitCharges = visits.map((document) => ({ document, charge: resolveVisitCharge(document.data()) }))
      const orderTotals = openOrders.map((document) => ({ document, totals: calculateTrustedOrderTotals(document.data()) }))
      const productIds = [...new Set(orderTotals.flatMap(({ totals }) => totals.activeItems.map((item) => item.productId)))]
      const productSnapshots = await Promise.all(productIds.map((productId) => transaction.get(db.collection('canteenProducts').doc(productId))))
      if (productSnapshots.some((snapshot) => !snapshot.exists)) {
        throw new HttpsError('failed-precondition', 'Una cuenta contiene productos historicos inexistentes y requiere revision.')
      }
      const parkAmountPaid = visitCharges.reduce((sum, item) => sum + item.charge.pending, 0)
      const canteenAmountPaid = orderTotals.reduce((sum, item) => sum + item.totals.total, 0)
      const totalPaid = parkAmountPaid + canteenAmountPaid
      const paymentMethod = totalPaid > 0 ? validPaymentMethod(input.paymentMethod) : ''
      const cardType = totalPaid > 0 ? validCardType(paymentMethod, input.cardType) : ''
      if (totalPaid <= 0 && !finishVisits) throw new HttpsError('failed-precondition', 'La operacion no tiene saldo pendiente.')
      if (testOptions.failBeforeWrites) throw new HttpsError('internal', 'Fallo simulado antes de escribir.')

      const now = Timestamp.now()
      visitCharges.forEach(({ document, charge }) => {
        const visit = document.data()
        const payload: Record<string, unknown> = {
          parkChargeAmount: charge.charge,
          paidParkAmount: charge.charge,
          parkPaymentStatus: 'paid',
          paymentStatus: 'paid',
          paymentMethod: charge.pending > 0 ? paymentMethod : stringValue(visit.paymentMethod),
          parkPaymentMethod: charge.pending > 0 ? paymentMethod : stringValue(visit.parkPaymentMethod),
          parkPaidAt: charge.pending > 0 ? serverTimestamp() : visit.parkPaidAt ?? null,
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
          sourceIntegrity: 'secure_backend',
        }
        if (finishVisits) {
          const started = visit.startedAt instanceof Timestamp ? visit.startedAt : timestampFromUnknown(visit.startedAt, now)
          transaction.update(db.collection('visits').doc(document.id), {
            ...payload,
            status: 'finished',
            endedAt: now,
            realDurationMinutes: Math.max(0, Math.round((now.toMillis() - started.toMillis()) / 60000)),
          })
          transaction.delete(document.ref)
        } else if (charge.pending > 0) {
          transaction.update(db.collection('visits').doc(document.id), payload)
          transaction.update(document.ref, payload)
        }
      })

      orderTotals.forEach(({ document, totals }) => transaction.update(document.ref, {
        total: totals.total,
        costTotal: totals.costTotal,
        estimatedProfit: totals.estimatedProfit,
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod,
        cardType,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
      }))

      let paymentId = ''
      if (totalPaid > 0) {
        paymentId = newDocumentId('payments')
        const first = visits[0].data()
        const childNames = visits.map((document) => stringValue(document.data().childName)).filter(Boolean)
        transaction.create(db.collection('payments').doc(paymentId), paymentBase(actor, {
          id: paymentId,
          visitId: visits[0].id,
          visitIds: visits.map((document) => document.id),
          groupEntryId: stringValue(first.groupEntryId),
          source: source === 'canteen' ? 'canteen' : 'reception_exit',
          concepts: parkAmountPaid > 0 && canteenAmountPaid > 0 ? 'both' : parkAmountPaid > 0 ? 'park' : 'canteen',
          canteenOrderIds: openOrders.map((document) => document.id),
          parkAmountPaid,
          canteenAmountPaid,
          eventAmountPaid: 0,
          totalPaid,
          paymentMethod,
          cardType,
          childName: childNames.join(' y '),
          childNames,
          customerName: stringValue(first.customerName),
          description: visits.length > 1 ? `Cobro grupal ${childNames.join(' y ')}` : `Cobro ${childNames[0] || visits[0].id}`,
        }))
      }
      writeActivity(transaction, actor, {
        action: finishVisits ? 'status_change' : 'creation', module: 'Recepcion',
        description: finishVisits ? `Cobro y finalizo ${visits.length} visita(s)` : `Registro cobro de ${visits.length} visita(s)`,
        entityId, entityName: visits.map((document) => stringValue(document.data().childName)).filter(Boolean).join(' y '),
        metadata: { paymentId, visitIds: visits.map((document) => document.id), orderIds: openOrders.map((document) => document.id), parkAmountPaid, canteenAmountPaid, totalPaid, paymentMethod, finishVisits },
      })
      return { paymentId, visitIds: visits.map((document) => document.id), orderIds: openOrders.map((document) => document.id), parkAmountPaid, canteenAmountPaid, totalPaid, finished: finishVisits }
    },
  })
}

export const extendVisitTimeSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const visitId = requiredString(input.visitId, 'La visita')
  const minutes = Number(input.minutes)
  if (minutes !== 30 && minutes !== 60) throw new HttpsError('invalid-argument', 'La extension debe ser de 30 o 60 minutos.')
  const amount = minutes === 30 ? 30000 : 60000
  return executeIdempotent({
    uid,
    roles: VISIT_ROLES,
    operationType: 'extend_visit_time',
    entityId: visitId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { minutes },
    handler: async (transaction, actor) => {
      const activeRef = db.collection('activeVisits').doc(visitId)
      const historicalRef = db.collection('visits').doc(visitId)
      const [activeSnapshot, historicalSnapshot] = await Promise.all([transaction.get(activeRef), transaction.get(historicalRef)])
      if (!activeSnapshot.exists || !historicalSnapshot.exists || activeSnapshot.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'La visita no esta activa y no puede extenderse.')
      }
      const visit = activeSnapshot.data() ?? {}
      if (visit.isUnlimited === true) throw new HttpsError('failed-precondition', 'Una visita libre no necesita extension.')
      const now = Timestamp.now()
      const currentEnd = visit.expectedEndAt instanceof Timestamp ? visit.expectedEndAt : now
      const baseEnd = currentEnd.toMillis() > now.toMillis() ? currentEnd : now
      const nextEnd = Timestamp.fromMillis(baseEnd.toMillis() + minutes * 60000)
      const charge = resolveVisitCharge(visit)
      const extensionId = `extension-${newDocumentId('extensions')}`
      const extension = {
        id: extensionId,
        type: 'time_extension',
        minutes,
        amount,
        previousEndTime: currentEnd,
        newEndTime: nextEnd,
        createdAt: now,
        createdBy: actor.uid,
        createdByName: actor.name,
        sourceIntegrity: 'secure_backend',
      }
      const payload = {
        expectedEndAt: nextEnd,
        durationMinutes: visit.durationMinutes === null ? null : Number(visit.durationMinutes ?? 0) + minutes,
        parkChargeAmount: charge.charge + amount,
        extensionChargeAmount: nonNegativeMoney(visit.extensionChargeAmount ?? 0, 'El cargo de extensiones') + amount,
        paymentStatus: 'payAtExit',
        parkPaymentStatus: 'pending',
        timeExtensions: FieldValue.arrayUnion(extension),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
      }
      transaction.update(activeRef, payload)
      transaction.update(historicalRef, payload)
      writeActivity(transaction, actor, {
        action: 'update', module: 'Recepcion', description: `Extendio tiempo de visita de ${stringValue(visit.childName) || visitId} por ${minutes} minutos`,
        entityId: visitId, entityName: stringValue(visit.childName), metadata: { minutes, amount, previousEndTime: currentEnd, newEndTime: nextEnd, chargeBefore: charge.charge, chargeAfter: charge.charge + amount },
      })
      return { visitId, extensionId, minutes, amount, newEndTimeMillis: nextEnd.toMillis(), parkChargeAmount: charge.charge + amount }
    },
  })
}

export const finishVisitSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const visitId = requiredString(input.visitId, 'La visita')
  return executeIdempotent({
    uid,
    roles: VISIT_ROLES,
    operationType: 'finish_visit',
    entityId: visitId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { visitId },
    handler: async (transaction, actor) => {
      const activeRef = db.collection('activeVisits').doc(visitId)
      const historicalRef = db.collection('visits').doc(visitId)
      const activeSnapshot = await transaction.get(activeRef)
      if (!activeSnapshot.exists || activeSnapshot.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'La visita ya fue finalizada.')
      const visit = activeSnapshot.data() ?? {}
      const orders = await getRelatedOrders(transaction, [activeSnapshot as QueryDocumentSnapshot])
      const charge = resolveVisitCharge(visit)
      const openOrderTotals = orders
        .filter((document) => document.data().status === 'open' && document.data().paymentStatus !== 'paid')
        .map((document) => calculateTrustedOrderTotals(document.data()).total)
      const pendingCanteen = openOrderTotals.reduce((sum, amount) => sum + amount, 0)
      if (charge.pending > 0 || pendingCanteen > 0) {
        throw new HttpsError('failed-precondition', 'La visita tiene saldo pendiente y debe cobrarse antes de finalizar.')
      }
      const now = Timestamp.now()
      const started = visit.startedAt instanceof Timestamp ? visit.startedAt : timestampFromUnknown(visit.startedAt, now)
      transaction.update(historicalRef, {
        status: 'finished', endedAt: now,
        realDurationMinutes: Math.max(0, Math.round((now.toMillis() - started.toMillis()) / 60000)),
        updatedAt: serverTimestamp(), updatedBy: actor.uid, sourceIntegrity: 'secure_backend',
      })
      transaction.delete(activeRef)
      writeActivity(transaction, actor, {
        action: 'status_change', module: 'Recepcion', description: `Finalizo visita de ${stringValue(visit.childName) || visitId}`,
        entityId: visitId, entityName: stringValue(visit.childName), metadata: { pendingPark: charge.pending, pendingCanteen: 0 },
      })
      return { visitId, status: 'finished' }
    },
  })
}

export const chargeVisitSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  return checkoutVisitGroupSecure(uid, {
    visitId: input.visitId,
    visitIds: [input.visitId],
    paymentMethod: input.paymentMethod,
    cardType: input.cardType,
    source: 'reception',
    finishVisits: false,
    idempotencyKey: input.idempotencyKey,
  })
}

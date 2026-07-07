import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { calculateTrustedOrderTotals, orderPaidAmount } from './canteen'
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
  unlimitedPricing?: UnlimitedPricingAudit
}

interface PromotionalAdjustmentAudit {
  type: 'percentage' | 'final_amount'
  originalAmount: number
  percentage: number | null
  discountAmount: number
  finalAmount: number
  reason: string
  adjustedBy: string
  adjustedByName: string
  adjustedByRole: UserRole
  adjustedAt: Timestamp
  sourceIntegrity: 'secure_backend'
}

interface UnlimitedPricingAudit {
  type: 'unlimited_checkout'
  startedAt: Timestamp
  endedAt: Timestamp
  elapsedMinutes: number
  billableHours: number
  hourlyRate: number
  suggestedAmount: number
  finalAmount: number
  difference: number
  reason: string
  adjustedBy: string | null
  adjustedByName: string
  adjustedByRole: UserRole | ''
  adjustedAt: Timestamp | null
  sourceIntegrity: 'secure_backend'
}

const normalizedDocumentNumber = (value: unknown) => stringValue(value).replace(/\D/g, '')
const lowerSearchKey = (value: string) => value.trim().toLocaleLowerCase('es')

const resolvePromotionalAdjustment = (
  input: Record<string, unknown>,
  actor: Actor,
  originalAmount: number,
  now: Timestamp,
): PromotionalAdjustmentAudit | null => {
  const rawAdjustment = input.promotionalAdjustment ?? input.promotionAdjustment
  const legacyCustomAmount = input.customAmount === true
  if (!rawAdjustment && !legacyCustomAmount) return null
  if (!rawAdjustment) {
    throw new HttpsError('invalid-argument', 'Usa el ajuste promocional con motivo para aplicar un importe especial.')
  }

  const adjustment = asRecord(rawAdjustment)
  const reason = requiredString(adjustment.reason, 'El motivo del descuento', 300)
  const type = stringValue(adjustment.type)
  let percentage: number | null = null
  let finalAmount: number

  if (type === 'percentage') {
    percentage = Number(adjustment.percentage)
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) {
      throw new HttpsError('invalid-argument', 'El porcentaje de descuento debe ser mayor a 0 y menor a 100.')
    }
    finalAmount = Math.round(originalAmount * (100 - percentage) / 100)
  } else if (type === 'finalAmount' || type === 'final_amount') {
    finalAmount = positiveMoney(adjustment.finalAmount, 'El monto final promocional')
  } else {
    throw new HttpsError('invalid-argument', 'El tipo de descuento no es valido.')
  }

  if (finalAmount <= 0) {
    throw new HttpsError('invalid-argument', 'El monto final promocional debe ser mayor a cero.')
  }
  if (finalAmount >= originalAmount) {
    throw new HttpsError('invalid-argument', 'El monto promocional debe ser menor al precio normal.')
  }

  return {
    type: type === 'percentage' ? 'percentage' : 'final_amount',
    originalAmount,
    percentage,
    discountAmount: originalAmount - finalAmount,
    finalAmount,
    reason,
    adjustedBy: actor.uid,
    adjustedByName: actor.name,
    adjustedByRole: actor.role,
    adjustedAt: now,
    sourceIntegrity: 'secure_backend',
  }
}

const resolvePlan = (input: Record<string, unknown>, actor: Actor, now: Timestamp) => {
  const planId = stringValue(input.planId) as PlanId
  const plan = plans[planId]
  if (!plan) throw new HttpsError('invalid-argument', 'El plan de visita no es valido.')
  const customAmount = input.customAmount === true
  if (plan.isUnlimited) {
    const hasInitialAmount = input.amountCharged !== null && input.amountCharged !== undefined && Number(input.amountCharged) > 0
    if (customAmount || hasInitialAmount || input.promotionalAdjustment || input.promotionAdjustment) {
      throw new HttpsError('failed-precondition', 'El plan libre se cobra y confirma al finalizar la visita.')
    }
    return { plan, customAmount: false, chargeAmount: null as number | null, promotionalAdjustment: null as PromotionalAdjustmentAudit | null }
  }
  const originalAmount = plan.defaultPrice ?? 0
  const promotionalAdjustment = resolvePromotionalAdjustment(input, actor, originalAmount, now)
  const chargeAmount = promotionalAdjustment?.finalAmount ?? originalAmount
  return { plan, customAmount: Boolean(promotionalAdjustment), chargeAmount, promotionalAdjustment }
}

const expectedEndAt = (startedAt: Timestamp, durationMinutes: number | null) =>
  durationMinutes === null ? null : Timestamp.fromMillis(startedAt.toMillis() + durationMinutes * 60 * 1000)

interface OperationalSettings {
  babyFreeEntryEnabled: boolean
  babyFreeMaxAgeMonths: number | null
}

const readOperationalSettings = async (transaction: Transaction): Promise<OperationalSettings> => {
  const snapshot = await transaction.get(db.collection('settings').doc('visitPricing'))
  const data = snapshot.data() ?? {}
  const rawMonths = data.babyFreeMaxAgeMonths
  const maxAgeMonths = rawMonths === null || rawMonths === undefined || rawMonths === ''
    ? null
    : Number(rawMonths)
  const validMonths = maxAgeMonths !== null && Number.isSafeInteger(maxAgeMonths) && maxAgeMonths > 0 && maxAgeMonths <= 216
    ? maxAgeMonths
    : null
  return {
    babyFreeEntryEnabled: data.babyFreeEntryEnabled === true,
    babyFreeMaxAgeMonths: validMonths,
  }
}

/**
 * Edad en meses completos entre la fecha de nacimiento (YYYY-MM-DD) y la fecha de la visita.
 * Usa fechas reales, nunca "anio actual - anio de nacimiento". Devuelve null si no hay fecha valida.
 */
const ageInMonths = (birthDateIso: string, at: Timestamp): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateIso.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null
  const reference = at.toDate()
  if (birth.getTime() > reference.getTime()) return null
  let months = (reference.getFullYear() - year) * 12 + (reference.getMonth() - (month - 1))
  if (reference.getDate() < day) months -= 1
  return Math.max(0, months)
}

const BABY_OVERRIDE_ROLES = new Set<UserRole>(['admin', 'socio'])

const resolveVisitCharge = (visit: DocumentData): VisitCharge => {
  if (visit.isBaby === true) return { charge: 0, paid: 0, pending: 0, legacyPricing: false }
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

const readUnlimitedHourlyRate = async (transaction: Transaction) => {
  const snapshot = await transaction.get(db.collection('settings').doc('visitPricing'))
  const data = snapshot.data() ?? {}
  return positiveMoney(data.unlimitedHourlyRate, 'La tarifa por hora del plan libre')
}

const billableHoursForUnlimited = (startedAt: Timestamp, endedAt: Timestamp) => {
  const elapsedMinutes = Math.max(0, Math.floor((endedAt.toMillis() - startedAt.toMillis()) / 60000))
  return Math.max(1, Math.floor(elapsedMinutes / 60))
}

const unlimitedAdjustmentForVisit = (input: Record<string, unknown>, visitId: string): Record<string, unknown> => {
  const raw = input.unlimitedAdjustments
  if (Array.isArray(raw)) {
    return asRecord(raw.find((item) => stringValue(asRecord(item).visitId) === visitId))
  }
  return asRecord(asRecord(raw)[visitId])
}

const resolveCheckoutVisitCharge = (
  visitId: string,
  visit: DocumentData,
  input: Record<string, unknown>,
  actor: Actor,
  now: Timestamp,
  unlimitedHourlyRate: number | null,
  finishVisits: boolean,
): VisitCharge => {
  if (visit.isUnlimited !== true) return resolveVisitCharge(visit)

  const storedCharge = nonNegativeMoney(visit.parkChargeAmount ?? visit.amountCharged ?? 0, 'El importe historico de la visita libre')
  const storedPaid = nonNegativeMoney(visit.paidParkAmount ?? 0, 'El importe historico pagado')
  if (storedPaid > 0 || visit.parkPaymentStatus === 'paid' || visit.paymentStatus === 'paid') {
    if (storedPaid > storedCharge) throw new HttpsError('failed-precondition', 'La visita registra un pago mayor a su cargo y requiere revision administrativa.')
    return { charge: storedCharge, paid: storedPaid, pending: Math.max(0, storedCharge - storedPaid), legacyPricing: true }
  }

  if (!finishVisits) {
    throw new HttpsError('failed-precondition', 'El plan libre se cobra al finalizar la visita.')
  }
  if (!unlimitedHourlyRate) {
    throw new HttpsError('failed-precondition', 'Configura la tarifa por hora del plan libre antes de cobrar.')
  }

  const startedAt = visit.startedAt instanceof Timestamp ? visit.startedAt : timestampFromUnknown(visit.startedAt, now)
  const billableHours = billableHoursForUnlimited(startedAt, now)
  const suggestedAmount = billableHours * unlimitedHourlyRate
  const adjustment = unlimitedAdjustmentForVisit(input, visitId)
  const finalAmount = adjustment.finalAmount === undefined || adjustment.finalAmount === null || adjustment.finalAmount === ''
    ? suggestedAmount
    : positiveMoney(adjustment.finalAmount, 'El monto final del plan libre')
  if (finalAmount <= 0) throw new HttpsError('invalid-argument', 'El monto final del plan libre debe ser mayor a cero.')

  const difference = finalAmount - suggestedAmount
  const reason = optionalString(adjustment.reason, 300)
  if (difference !== 0 && !reason) {
    throw new HttpsError('failed-precondition', 'Indica el motivo del ajuste del plan libre.')
  }

  const elapsedMinutes = Math.max(0, Math.floor((now.toMillis() - startedAt.toMillis()) / 60000))
  return {
    charge: finalAmount,
    paid: 0,
    pending: finalAmount,
    legacyPricing: false,
    unlimitedPricing: {
      type: 'unlimited_checkout',
      startedAt,
      endedAt: now,
      elapsedMinutes,
      billableHours,
      hourlyRate: unlimitedHourlyRate,
      suggestedAmount,
      finalAmount,
      difference,
      reason,
      adjustedBy: difference !== 0 ? actor.uid : null,
      adjustedByName: difference !== 0 ? actor.name : '',
      adjustedByRole: difference !== 0 ? actor.role : '',
      adjustedAt: difference !== 0 ? now : null,
      sourceIntegrity: 'secure_backend',
    },
  }
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
      const { plan, customAmount, chargeAmount, promotionalAdjustment } = resolvePlan(input, actor, now)

      // --- Entrada gratuita por bebe (politica operativa separada; afecta solo el cargo del parque) ---
      const operational = await readOperationalSettings(transaction)
      const birthDateIso = optionalString(input.childBirthDate)
      const ageMonthsAtEntry = birthDateIso ? ageInMonths(birthDateIso, startedAt) : null
      const autoEligible = operational.babyFreeEntryEnabled
        && operational.babyFreeMaxAgeMonths !== null
        && ageMonthsAtEntry !== null
        && ageMonthsAtEntry <= operational.babyFreeMaxAgeMonths
      const babyEntryRecord = asRecord(input.babyFreeEntry)
      const babyRequested = input.babyFreeEntry === true || babyEntryRecord.requested === true
      // La gratuidad automatica se aplica por defecto; cobrar un bebe elegible exige un rechazo EXPLICITO.
      const explicitlyDeclined = babyEntryRecord.requested === false
      const overrideReason = optionalString(babyEntryRecord.overrideReason ?? input.babyFreeOverrideReason, 300)

      // Recepcion no puede desactivar accidentalmente una gratuidad automatica: cobrar requiere Admin/Socio + motivo.
      const wantsToChargeEligible = autoEligible && explicitlyDeclined
      if (wantsToChargeEligible && (!BABY_OVERRIDE_ROLES.has(actor.role) || !overrideReason)) {
        throw new HttpsError('permission-denied', 'Esta entrada es gratuita por edad. Solo Admin o Socio pueden cobrarla, indicando un motivo.')
      }
      const applyBaby = autoEligible ? !wantsToChargeEligible : babyRequested
      const babyMode: 'auto' | 'manual' = autoEligible && applyBaby ? 'auto' : 'manual'
      const manualReason = applyBaby && babyMode === 'manual'
        ? requiredString(asRecord(input.babyFreeEntry).reason ?? input.babyFreeReason, 'El motivo de la entrada gratuita por bebe', 300)
        : ''

      if (applyBaby && plan.isUnlimited) {
        throw new HttpsError('failed-precondition', 'La entrada gratuita por bebe no usa el plan libre.')
      }

      const babyFreeEntry = applyBaby ? {
        applied: true,
        mode: babyMode,
        maxAgeMonths: operational.babyFreeMaxAgeMonths,
        ageMonthsAtEntry,
        birthDate: birthDateIso,
        reason: manualReason,
        appliedBy: actor.uid,
        appliedByName: actor.name,
        appliedByRole: actor.role,
        appliedAt: now,
        sourceIntegrity: 'secure_backend' as const,
      } : null

      const babyOverride = wantsToChargeEligible ? {
        chargedEligibleBaby: true,
        ageMonthsAtEntry,
        maxAgeMonths: operational.babyFreeMaxAgeMonths,
        reason: overrideReason,
        authorizedBy: actor.uid,
        authorizedByName: actor.name,
        authorizedByRole: actor.role,
        authorizedAt: now,
        sourceIntegrity: 'secure_backend' as const,
      } : null

      const paymentStatus = applyBaby ? 'paid' : stringValue(input.paymentStatus)
      if (!['paid', 'payAtExit', 'pending'].includes(paymentStatus)) throw new HttpsError('invalid-argument', 'El estado de pago no es valido.')
      if (!applyBaby && plan.isUnlimited && paymentStatus === 'paid') {
        throw new HttpsError('failed-precondition', 'El plan libre se cobra al finalizar la visita.')
      }
      // Un bebe no genera cargo del parque: no requiere metodo de pago aunque quede "pagado" en Gs. 0.
      const createParkPayment = paymentStatus === 'paid' && !applyBaby
      const paymentMethod = createParkPayment ? validPaymentMethod(input.paymentMethod) : ''
      const cardType = createParkPayment ? validCardType(paymentMethod, input.cardType) : ''

      const parkChargeAmount = applyBaby ? 0 : chargeAmount
      const babyPlanName = applyBaby ? 'Bebe - entrada gratuita' : plan.name
      const babyDurationMinutes = applyBaby ? null : plan.durationMinutes

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
        planName: babyPlanName,
        durationMinutes: babyDurationMinutes,
        isUnlimited: applyBaby ? false : plan.isUnlimited,
        startedAt,
        expectedEndAt: applyBaby ? null : expectedEndAt(startedAt, plan.durationMinutes),
        paymentStatus,
        paymentMethod,
        cardType,
        amountCharged: applyBaby ? 0 : chargeAmount,
        parkChargeAmount,
        paidParkAmount: applyBaby ? 0 : (paymentStatus === 'paid' ? chargeAmount ?? 0 : 0),
        extensionChargeAmount: 0,
        parkPaymentStatus: applyBaby ? 'paid' : (paymentStatus === 'paid' ? 'paid' : 'pending'),
        parkPaidAt: applyBaby || paymentStatus === 'paid' ? serverTimestamp() : null,
        parkPaymentMethod: paymentMethod,
        defaultAmount: applyBaby ? 0 : plan.defaultPrice,
        customAmount: applyBaby ? false : customAmount,
        promotionalAdjustment: applyBaby ? null : promotionalAdjustment,
        isBaby: applyBaby,
        babyFreeEntry,
        babyFreeOverride: babyOverride,
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
      if (createParkPayment) {
        if (!chargeAmount || chargeAmount <= 0) throw new HttpsError('failed-precondition', 'No se puede registrar como pagada una visita sin importe.')
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
          originalParkAmount: plan.defaultPrice,
          promotionalAdjustment,
        }))
      }
      writeActivity(transaction, actor, {
        action: 'create',
        module: 'Recepcion',
        description: applyBaby
          ? `Registro ingreso de ${childName} (entrada gratuita por bebe ${babyMode === 'auto' ? 'automatica' : 'manual'})`
          : `Registro ingreso de ${childName}`,
        entityId: visitId,
        entityName: childName,
        metadata: {
          amount: applyBaby ? 0 : chargeAmount,
          plan: babyPlanName,
          responsible: customerName,
          customerId: customerRef.id,
          paymentId,
          promotionalAdjustment: applyBaby ? null : promotionalAdjustment,
          isBaby: applyBaby,
          babyFreeEntry,
          babyFreeOverride: babyOverride,
          reusedCustomer: Boolean(customerSnapshot),
          previousCustomerName: stringValue(customerData.name),
        },
      })
      return { visitId, customerId: customerRef.id, childId: childRef.id, paymentId, amount: applyBaby ? 0 : chargeAmount ?? 0, isBaby: applyBaby, babyMode: applyBaby ? babyMode : '' }
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
    fingerprint: { entityId, finishVisits, source, paymentMethod: input.paymentMethod, cardType: input.cardType, unlimitedAdjustments: input.unlimitedAdjustments },
    handler: async (transaction, actor) => {
      if (actor.role === 'cantina' && finishVisits) {
        throw new HttpsError('permission-denied', 'Cantina puede cobrar, pero la salida debe finalizar desde Recepcion.')
      }
      const visits = await getActiveVisits(transaction, input)
      const orders = await getRelatedOrders(transaction, visits)
      const now = Timestamp.now()
      const needsUnlimitedPricing = visits.some((document) => {
        const visit = document.data()
        const paid = nonNegativeMoney(visit.paidParkAmount ?? 0, 'El importe historico pagado')
        return visit.isUnlimited === true && paid <= 0 && visit.parkPaymentStatus !== 'paid' && visit.paymentStatus !== 'paid'
      })
      const unlimitedHourlyRate = needsUnlimitedPricing ? await readUnlimitedHourlyRate(transaction) : null
      const openOrders = orders.filter((document) => {
        const order = document.data()
        return order.status === 'open' && order.paymentStatus !== 'paid'
      })
      const visitCharges = visits.map((document) => ({
        document,
        charge: resolveCheckoutVisitCharge(document.id, document.data(), input, actor, now, unlimitedHourlyRate, finishVisits),
      }))
      const orderTotals = openOrders.map((document) => {
        const totals = calculateTrustedOrderTotals(document.data())
        const paid = orderPaidAmount(document.data(), totals.total)
        return { document, totals, due: Math.max(0, totals.total - paid) }
      })
      const productIds = [...new Set(orderTotals.flatMap(({ totals }) => totals.activeItems.map((item) => item.productId)))]
      const productSnapshots = await Promise.all(productIds.map((productId) => transaction.get(db.collection('canteenProducts').doc(productId))))
      if (productSnapshots.some((snapshot) => !snapshot.exists)) {
        throw new HttpsError('failed-precondition', 'Una cuenta contiene productos historicos inexistentes y requiere revision.')
      }
      const parkAmountPaid = visitCharges.reduce((sum, item) => sum + item.charge.pending, 0)
      const canteenAmountPaid = orderTotals.reduce((sum, item) => sum + item.due, 0)
      const totalPaid = parkAmountPaid + canteenAmountPaid
      const paymentMethod = totalPaid > 0 ? validPaymentMethod(input.paymentMethod) : ''
      const cardType = totalPaid > 0 ? validCardType(paymentMethod, input.cardType) : ''
      if (totalPaid <= 0 && !finishVisits) throw new HttpsError('failed-precondition', 'La operacion no tiene saldo pendiente.')
      if (testOptions.failBeforeWrites) throw new HttpsError('internal', 'Fallo simulado antes de escribir.')

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
        if (charge.unlimitedPricing) {
          payload.amountCharged = charge.charge
          payload.defaultAmount = null
          payload.customAmount = charge.unlimitedPricing.finalAmount !== charge.unlimitedPricing.suggestedAmount
          payload.unlimitedPricing = charge.unlimitedPricing
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
        paidAmount: totals.total,
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
          unlimitedPricing: visitCharges
            .filter(({ charge }) => Boolean(charge.unlimitedPricing))
            .map(({ document, charge }) => ({ visitId: document.id, childName: stringValue(document.data().childName), ...charge.unlimitedPricing })),
          promotionalAdjustments: visits
            .filter((document) => Boolean(document.data().promotionalAdjustment))
            .map((document) => ({ visitId: document.id, childName: stringValue(document.data().childName), ...asRecord(document.data().promotionalAdjustment) })),
        }))
      }
      writeActivity(transaction, actor, {
        action: finishVisits ? 'status_change' : 'creation', module: 'Recepcion',
        description: finishVisits ? `Cobro y finalizo ${visits.length} visita(s)` : `Registro cobro de ${visits.length} visita(s)`,
        entityId, entityName: visits.map((document) => stringValue(document.data().childName)).filter(Boolean).join(' y '),
        metadata: {
          paymentId,
          visitIds: visits.map((document) => document.id),
          orderIds: openOrders.map((document) => document.id),
          parkAmountPaid,
          canteenAmountPaid,
          totalPaid,
          paymentMethod,
          finishVisits,
          unlimitedPricing: visitCharges
            .filter(({ charge }) => Boolean(charge.unlimitedPricing))
            .map(({ document, charge }) => ({ visitId: document.id, childName: stringValue(document.data().childName), ...charge.unlimitedPricing })),
          promotionalAdjustments: visits
            .filter((document) => Boolean(document.data().promotionalAdjustment))
            .map((document) => ({ visitId: document.id, childName: stringValue(document.data().childName), ...asRecord(document.data().promotionalAdjustment) })),
        },
      })
      return { paymentId, visitIds: visits.map((document) => document.id), orderIds: openOrders.map((document) => document.id), parkAmountPaid, canteenAmountPaid, totalPaid, finished: finishVisits }
    },
  })
}

/**
 * Cargo de parque para un pago parcial. Para una visita libre aun sin tarifar,
 * el parque no puede cobrarse hasta finalizar, por lo que su pendiente es 0.
 */
const resolvePartialParkCharge = (visit: DocumentData): VisitCharge => {
  if (visit.isUnlimited !== true) return resolveVisitCharge(visit)
  const storedCharge = nonNegativeMoney(visit.parkChargeAmount ?? visit.amountCharged ?? 0, 'El importe historico de la visita libre')
  const storedPaid = nonNegativeMoney(visit.paidParkAmount ?? 0, 'El importe historico pagado')
  const alreadyPriced = storedPaid > 0 || storedCharge > 0 || visit.parkPaymentStatus === 'paid' || visit.paymentStatus === 'paid'
  if (!alreadyPriced) return { charge: 0, paid: 0, pending: 0, legacyPricing: true }
  if (storedPaid > storedCharge) throw new HttpsError('failed-precondition', 'La visita registra un pago mayor a su cargo y requiere revision administrativa.')
  return { charge: storedCharge, paid: storedPaid, pending: Math.max(0, storedCharge - storedPaid), legacyPricing: true }
}

const visitStartMillis = (visit: DocumentData, fallback: Timestamp) =>
  (visit.startedAt instanceof Timestamp ? visit.startedAt : timestampFromUnknown(visit.startedAt, fallback)).toMillis()

const orderCreatedMillis = (order: DocumentData) =>
  order.createdAt instanceof Timestamp ? order.createdAt.toMillis() : 0

/**
 * Registra un pago parcial sobre una cuenta abierta (visita o grupo) SIN cerrar la cuenta ni finalizar la visita.
 * Regla de aplicacion determinista: cargos mas antiguos primero (parque primero, luego cantina por antiguedad).
 * target === 'park' aplica exclusivamente al cargo del parque.
 */
export const registerPartialPaymentSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const entityId = stringValue(input.groupEntryId) || stringValue(input.visitId)
    || (Array.isArray(input.visitIds) ? input.visitIds.map(stringValue).filter(Boolean).join(',') : '')
  const target = stringValue(input.target) === 'park' ? 'park' : 'general'

  return executeIdempotent({
    uid,
    roles: CHECKOUT_ROLES,
    operationType: 'register_partial_payment',
    entityId: requiredString(entityId, 'La visita o grupo'),
    idempotencyKey: input.idempotencyKey,
    fingerprint: { entityId, target, amount: input.amount, paymentMethod: input.paymentMethod, cardType: input.cardType, note: optionalString(input.note, 300), clientPaymentId: stringValue(input.clientPaymentId) },
    handler: async (transaction, actor) => {
      const now = Timestamp.now()
      const visits = await getActiveVisits(transaction, input)
      const orders = await getRelatedOrders(transaction, visits)

      const parkCharges = visits
        .map((document) => ({ document, charge: resolvePartialParkCharge(document.data()) }))
        .sort((left, right) => visitStartMillis(left.document.data(), now) - visitStartMillis(right.document.data(), now))

      const openOrders = orders
        .filter((document) => document.data().status === 'open' && document.data().paymentStatus !== 'paid')
        .sort((left, right) => orderCreatedMillis(left.data()) - orderCreatedMillis(right.data()))
      const orderBalances = openOrders.map((document) => {
        const totals = calculateTrustedOrderTotals(document.data())
        const paid = orderPaidAmount(document.data(), totals.total)
        return { document, totals, paid, due: Math.max(0, totals.total - paid) }
      })

      const parkPendingTotal = parkCharges.reduce((sum, item) => sum + item.charge.pending, 0)
      const canteenPendingTotal = orderBalances.reduce((sum, item) => sum + item.due, 0)
      const totalPending = parkPendingTotal + canteenPendingTotal

      const amount = positiveMoney(input.amount, 'El monto a pagar')
      const maxAllowed = target === 'park' ? parkPendingTotal : totalPending
      if (maxAllowed <= 0) {
        throw new HttpsError('failed-precondition', target === 'park'
          ? 'No hay saldo pendiente del parque para cobrar.'
          : 'La cuenta no tiene saldo pendiente.')
      }
      if (amount > maxAllowed) {
        throw new HttpsError('invalid-argument', 'El monto a pagar supera el saldo pendiente.')
      }

      const paymentMethod = validPaymentMethod(input.paymentMethod)
      const cardType = validCardType(paymentMethod, input.cardType)
      const note = optionalString(input.note, 300)

      let remaining = amount
      let parkApplied = 0
      const parkUpdates: { document: QueryDocumentSnapshot; charge: VisitCharge; newPaid: number; applied: number }[] = []
      for (const { document, charge } of parkCharges) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, charge.pending)
        if (applied <= 0) continue
        parkUpdates.push({ document, charge, newPaid: charge.paid + applied, applied })
        parkApplied += applied
        remaining -= applied
      }

      let canteenApplied = 0
      const orderUpdates: { document: QueryDocumentSnapshot; totals: ReturnType<typeof calculateTrustedOrderTotals>; newPaid: number; applied: number }[] = []
      if (target === 'general') {
        for (const balance of orderBalances) {
          if (remaining <= 0) break
          const applied = Math.min(remaining, balance.due)
          if (applied <= 0) continue
          orderUpdates.push({ document: balance.document, totals: balance.totals, newPaid: balance.paid + applied, applied })
          canteenApplied += applied
          remaining -= applied
        }
      }

      if (remaining > 0) {
        // Salvaguarda: la asignacion no pudo distribuir todo el monto (no deberia ocurrir por la validacion previa).
        throw new HttpsError('failed-precondition', 'No se pudo aplicar el monto al saldo pendiente.')
      }

      const appliedConcepts = parkApplied > 0 && canteenApplied > 0 ? 'both' : parkApplied > 0 ? 'park' : 'canteen'

      parkUpdates.forEach(({ document, charge, newPaid }) => {
        const fullyPaid = newPaid >= charge.charge
        const payload: Record<string, unknown> = {
          parkChargeAmount: charge.charge,
          paidParkAmount: newPaid,
          parkPaymentStatus: fullyPaid ? 'paid' : 'partial',
          paymentStatus: fullyPaid ? 'paid' : 'payAtExit',
          parkPaymentMethod: paymentMethod,
          parkPaidAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
          sourceIntegrity: 'secure_backend',
        }
        transaction.update(db.collection('visits').doc(document.id), payload)
        transaction.update(document.ref, payload)
      })

      orderUpdates.forEach(({ document, totals, newPaid }) => {
        // La cuenta permanece ABIERTA aunque el saldo llegue a cero: pueden agregarse nuevos consumos.
        transaction.update(document.ref, {
          total: totals.total,
          paidAmount: newPaid,
          // paymentStatus se mantiene 'pending' (la cuenta sigue abierta); el saldo real es total - paidAmount.
          paymentStatus: 'pending',
          lastPartialPaymentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
          sourceIntegrity: 'secure_backend',
        })
      })

      const first = visits[0].data()
      const childNames = visits.map((document) => stringValue(document.data().childName)).filter(Boolean)
      const paymentId = newDocumentId('payments')
      transaction.create(db.collection('payments').doc(paymentId), paymentBase(actor, {
        id: paymentId,
        visitId: visits[0].id,
        visitIds: visits.map((document) => document.id),
        groupEntryId: stringValue(first.groupEntryId),
        source: 'reception_partial',
        concepts: appliedConcepts,
        canteenOrderIds: orderUpdates.map(({ document }) => document.id),
        parkAmountPaid: parkApplied,
        canteenAmountPaid: canteenApplied,
        eventAmountPaid: 0,
        totalPaid: amount,
        paymentMethod,
        cardType,
        childName: childNames.join(' y '),
        childNames,
        customerName: stringValue(first.customerName),
        description: `Pago parcial ${childNames.join(' y ') || visits[0].id}`,
        note,
        target,
        balanceBefore: totalPending,
        balanceAfter: totalPending - amount,
        appliedConcepts,
      }))

      writeActivity(transaction, actor, {
        action: 'creation',
        module: 'Recepcion',
        description: `Registro pago parcial de Gs. ${amount.toLocaleString('es-PY')} sobre ${visits.length} visita(s)`,
        entityId,
        entityName: childNames.join(' y '),
        metadata: {
          paymentId,
          target,
          amount,
          parkApplied,
          canteenApplied,
          balanceBefore: totalPending,
          balanceAfter: totalPending - amount,
          paymentMethod,
          visitIds: visits.map((document) => document.id),
          orderIds: orderUpdates.map(({ document }) => document.id),
        },
      })

      return {
        paymentId,
        target,
        amountPaid: amount,
        parkAmountPaid: parkApplied,
        canteenAmountPaid: canteenApplied,
        balanceBefore: totalPending,
        balanceAfter: totalPending - amount,
        visitIds: visits.map((document) => document.id),
        orderIds: orderUpdates.map(({ document }) => document.id),
      }
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
      if (visit.isUnlimited === true && visit.parkPaymentStatus !== 'paid' && visit.paymentStatus !== 'paid') {
        throw new HttpsError('failed-precondition', 'La visita libre debe cobrarse al finalizar.')
      }
      const orders = await getRelatedOrders(transaction, [activeSnapshot as QueryDocumentSnapshot])
      const charge = resolveVisitCharge(visit)
      const openOrderTotals = orders
        .filter((document) => document.data().status === 'open' && document.data().paymentStatus !== 'paid')
        .map((document) => {
          const totals = calculateTrustedOrderTotals(document.data())
          return Math.max(0, totals.total - orderPaidAmount(document.data(), totals.total))
        })
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

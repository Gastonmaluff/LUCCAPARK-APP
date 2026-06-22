import {
  Timestamp,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth } from '../config/firebase'
import { getTimePlanById } from '../config/timePlans'
import { ensureReceptionSession } from './authSession'
import { logActivity } from './activityLogService'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'
import { chargeLocalVisit, createLocalNormalVisit, extendLocalVisitTime, finishLocalVisit } from './localVisitStore'
import { getVisitStorageMode } from './visitStorageMode'
import type { ActiveVisit, ChargeVisitInput, ChildProfile, CreateVisitInput } from '../types'
import { getExpectedEndAt, getRealDurationMinutes } from '../utils/visitTime'
import { formatPersonName, lowerSearchKey, normalizeWhitespace, phoneDigits } from '../utils/textFormat'

const currentUserId = () => auth.currentUser?.uid ?? null

const timestampOrNull = (date: Date | null) => (date ? Timestamp.fromDate(date) : null)

const optionalText = (value?: string) => {
  const normalized = normalizeWhitespace(value ?? '')
  return normalized.length > 0 ? normalized : undefined
}

const lowerKey = (value: string) => lowerSearchKey(value)

export const normalizeDocumentNumber = (value?: string) => String(value ?? '').replace(/\D/g, '')

const findCustomerByPhone = async (phone?: string) => {
  if (!phone) {
    return null
  }

  const snapshot = await getDocs(
    query(getCollectionRef('customers'), where('phone', '==', phone), limit(1)),
  )

  return snapshot.docs[0] ?? null
}

const findCustomerByDocument = async (documentNumberNormalized?: string) => {
  if (!documentNumberNormalized) {
    return null
  }

  const snapshot = await getDocs(
    query(getCollectionRef('customers'), where('documentNumberNormalized', '==', documentNumberNormalized), limit(1)),
  )

  return snapshot.docs[0] ?? null
}

const getExistingCustomer = async (input: CreateVisitInput, customerPhone?: string) => {
  if (input.customerId) {
    const customerSnapshot = await getDoc(getDocumentRef('customers', input.customerId))
    if (customerSnapshot.exists()) {
      return customerSnapshot
    }
  }

  const documentNumberNormalized =
    input.customerDocumentNumberNormalized || normalizeDocumentNumber(input.customerDocumentNumber)

  return (await findCustomerByDocument(documentNumberNormalized)) ?? (await findCustomerByPhone(customerPhone))
}

const findChildByNameAndPhone = async (childName: string, phone?: string) => {
  if (!phone) {
    return null
  }

  const snapshot = await getDocs(
    query(getCollectionRef('children'), where('customerPhone', '==', phone), limit(25)),
  )
  const normalizedChildName = lowerKey(childName)

  return snapshot.docs.find((docSnapshot) => {
    const data = docSnapshot.data()
    return lowerKey(String(data.name ?? '')) === normalizedChildName
  }) ?? null
}

const mapChildProfile = (id: string, data: Record<string, unknown>): ChildProfile => ({
  id,
  name: String(data.name ?? ''),
  birthDate: String(data.birthDate ?? ''),
  gender: String(data.gender ?? ''),
  ageRange: String(data.ageRange ?? ''),
  mainCustomerId: String(data.mainCustomerId ?? ''),
  mainCustomerName: String(data.mainCustomerName ?? ''),
  mainCustomerPhone: String(data.mainCustomerPhone ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  guardianId: String(data.guardianId ?? ''),
  guardianDocumentNumber: String(data.guardianDocumentNumber ?? ''),
  guardianDocumentNumberNormalized: String(data.guardianDocumentNumberNormalized ?? ''),
  guardianName: String(data.guardianName ?? ''),
  guardianPhone: String(data.guardianPhone ?? ''),
  notes: String(data.notes ?? ''),
  visitCount: Number(data.visitCount ?? 0),
  eventGuestCount: Number(data.eventGuestCount ?? 0),
  eventReservationCount: Number(data.eventReservationCount ?? 0),
  lastVisitAt: data.lastVisitAt instanceof Timestamp ? data.lastVisitAt.toDate() : null,
  firstReservationAt: data.firstReservationAt instanceof Timestamp ? data.firstReservationAt.toDate() : null,
  lastReservationAt: data.lastReservationAt instanceof Timestamp ? data.lastReservationAt.toDate() : null,
  lastInteractionAt: data.lastInteractionAt instanceof Timestamp ? data.lastInteractionAt.toDate() : null,
  lastSource: (data.lastSource as ChildProfile['lastSource']) ?? '',
  marketingConsent: Boolean(data.marketingConsent),
  marketingConsentAt: data.marketingConsentAt instanceof Timestamp ? data.marketingConsentAt.toDate() : null,
  createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
})

const getChildrenForCustomer = async (customerId: string) => {
  const snapshots = await Promise.all([
    getDocs(query(getCollectionRef('children'), where('mainCustomerId', '==', customerId), limit(50))),
    getDocs(query(getCollectionRef('children'), where('customerId', '==', customerId), limit(50))),
  ])
  const children = new Map<string, ChildProfile>()
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnapshot) => {
      children.set(docSnapshot.id, mapChildProfile(docSnapshot.id, docSnapshot.data()))
    })
  })
  return Array.from(children.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export const findResponsibleByDocument = async (documentNumber: string) => {
  await ensureReceptionSession()
  const normalizedDocument = normalizeDocumentNumber(documentNumber)
  if (normalizedDocument.length < 4) {
    return null
  }

  const customerSnapshot = await findCustomerByDocument(normalizedDocument)
  if (!customerSnapshot) {
    return null
  }

  const data = customerSnapshot.data()
  const children = await getChildrenForCustomer(customerSnapshot.id)

  return {
    id: customerSnapshot.id,
    name: String(data.name ?? ''),
    phone: String(data.phone ?? ''),
    relation: String(data.relation ?? ''),
    documentNumber: String(data.documentNumber ?? documentNumber),
    documentNumberNormalized: String(data.documentNumberNormalized ?? normalizedDocument),
    children,
  }
}

export const createNormalVisit = async (input: CreateVisitInput) => {
  const storageMode = await getVisitStorageMode()

  if (storageMode === 'local') {
    return createLocalNormalVisit(input)
  }

  await ensureReceptionSession()

  const childName = formatPersonName(input.childName)
  const customerName = formatPersonName(input.customerName)
  const customerPhone = optionalText(phoneDigits(input.customerPhone ?? ''))
  const customerDocumentNumber = optionalText(input.customerDocumentNumber)
  const customerDocumentNumberNormalized =
    input.customerDocumentNumberNormalized || normalizeDocumentNumber(customerDocumentNumber)
  const plan = getTimePlanById(input.planId)
  const startedAt = input.startedAt
  const expectedEndAt = getExpectedEndAt(startedAt, plan.durationMinutes, plan.isUnlimited)
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid

  const existingCustomer = await getExistingCustomer(input, customerPhone)
  const customerRef = existingCustomer
    ? getDocumentRef('customers', existingCustomer.id)
    : doc(getCollectionRef('customers'))

  await setDoc(
    customerRef,
    {
      name: customerName,
      phone: customerPhone ?? '',
      relation: optionalText(input.customerRelation) ?? '',
      documentNumber: customerDocumentNumber ?? '',
      documentNumberNormalized: customerDocumentNumberNormalized ?? '',
      updatedAt: serverTimestamp(),
      ...(existingCustomer ? {} : { marketingConsent: false, createdAt: serverTimestamp() }),
    },
    { merge: true },
  )

  const existingChild = input.childId ? await getDoc(getDocumentRef('children', input.childId)) : await findChildByNameAndPhone(childName, customerPhone)
  const childRef = existingChild?.exists() ? getDocumentRef('children', existingChild.id) : doc(getCollectionRef('children'))
  const childBirthDate = optionalText(input.childBirthDate)
  const childAgeRange = optionalText(input.childAgeRange)
  const childGender = optionalText(input.childGender)
  const childNotes = optionalText(input.childNotes)

  await setDoc(childRef, {
    id: childRef.id,
    name: childName,
    searchName: lowerKey(childName),
    customerId: customerRef.id,
    customerName,
    customerPhone: customerPhone ?? '',
    mainCustomerId: customerRef.id,
    mainCustomerName: customerName,
    mainCustomerPhone: customerPhone ?? '',
    guardianId: customerRef.id,
    guardianDocumentNumber: customerDocumentNumber ?? '',
    guardianDocumentNumberNormalized: customerDocumentNumberNormalized ?? '',
    guardianName: customerName,
    guardianPhone: customerPhone ?? '',
    source: 'visit',
    lastSource: 'visit',
    lastVisitAt: Timestamp.fromDate(startedAt),
    visitCount: increment(1),
    ...(childBirthDate ? { birthDate: childBirthDate } : {}),
    ...(childAgeRange ? { ageRange: childAgeRange } : {}),
    ...(input.childExactAge !== undefined && input.childExactAge !== null ? { exactAge: input.childExactAge } : {}),
    ...(input.childAgeCalculated !== undefined && input.childAgeCalculated !== null ? { ageCalculated: input.childAgeCalculated } : {}),
    ...(childGender ? { gender: childGender } : {}),
    ...(childNotes ? { notes: childNotes } : {}),
    ...(existingChild?.exists() ? {} : { eventGuestCount: 0, marketingConsent: false, createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  await setDoc(customerRef, {
    childrenIds: arrayUnion(childRef.id),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const visitRef = doc(getCollectionRef('visits'))
  const activeVisitRef = getDocumentRef('activeVisits', visitRef.id)
  const amountCharged = input.amountCharged ?? null

  const visitPayload = {
    id: visitRef.id,
    ...(input.groupEntryId ? { groupEntryId: input.groupEntryId } : {}),
    childId: childRef.id,
    childName,
    childBirthDate: optionalText(input.childBirthDate) ?? '',
    childAgeRange: optionalText(input.childAgeRange) ?? '',
    childExactAge: input.childExactAge ?? null,
    childAgeCalculated: input.childAgeCalculated ?? null,
    childGender: optionalText(input.childGender) ?? '',
    customerId: customerRef.id,
    customerName,
    customerPhone: customerPhone ?? '',
    customerRelation: optionalText(input.customerRelation) ?? '',
    customerDocumentNumber: customerDocumentNumber ?? '',
    customerDocumentNumberNormalized: customerDocumentNumberNormalized ?? '',
    guardianId: customerRef.id,
    guardianDocumentNumber: customerDocumentNumber ?? '',
    guardianDocumentNumberNormalized: customerDocumentNumberNormalized ?? '',
    childrenCount: input.childrenCount,
    planId: plan.id,
    planName: plan.name,
    durationMinutes: plan.durationMinutes,
    isUnlimited: plan.isUnlimited,
    startedAt: Timestamp.fromDate(startedAt),
    expectedEndAt: timestampOrNull(expectedEndAt),
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod ?? '',
    cardType: input.cardType ?? '',
    amountCharged,
    parkChargeAmount: amountCharged ?? input.defaultAmount ?? plan.defaultPrice ?? null,
    paidParkAmount: input.paymentStatus === 'paid' ? amountCharged ?? input.defaultAmount ?? plan.defaultPrice ?? null : 0,
    extensionChargeAmount: 0,
    parkPaymentStatus: input.paymentStatus === 'paid' ? 'paid' : 'pending',
    parkPaidAt: input.paymentStatus === 'paid' ? Timestamp.fromDate(startedAt) : null,
    parkPaymentMethod: input.paymentStatus === 'paid' ? input.paymentMethod ?? '' : '',
    defaultAmount: input.defaultAmount ?? plan.defaultPrice ?? null,
    customAmount: Boolean(input.customAmount),
    notes: optionalText(input.notes) ?? '',
    timeExtensions: [],
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    createdByName: userAudit.name,
    updatedBy: userId,
  }

  const batch = writeBatch(activeVisitRef.firestore)
  batch.set(visitRef, visitPayload)
  batch.set(activeVisitRef, visitPayload)
  if (input.paymentStatus === 'paid' && amountCharged && input.paymentMethod) {
    const paymentRef = doc(getCollectionRef('payments'))
    batch.set(paymentRef, {
      id: paymentRef.id,
      visitId: visitRef.id,
      source: 'reception_entry',
      concepts: 'park',
      status: 'paid',
      description: `Entrada ${plan.name} - ${childName}`,
      childName,
      customerName,
      parkAmountPaid: amountCharged,
      canteenAmountPaid: 0,
      totalPaid: amountCharged,
      paymentMethod: input.paymentMethod,
      cardType: input.cardType ?? '',
      paidAt: Timestamp.fromDate(startedAt),
      createdAt: serverTimestamp(),
      createdBy: userId,
      createdByName: userAudit.name,
    })
  }
  await batch.commit()

  void logActivity({
    action: 'create',
    description: `Registró ingreso de ${childName}`,
    entityId: visitRef.id,
    entityName: childName,
    metadata: {
      amount: amountCharged ?? input.defaultAmount ?? plan.defaultPrice ?? null,
      plan: plan.name,
      responsible: customerName,
      phone: customerPhone ?? '',
      documentNumber: customerDocumentNumber ?? '',
    },
    module: 'Recepción',
  })

  return visitRef.id
}

export const chargeVisit = async (visit: ActiveVisit, input: ChargeVisitInput) => {
  const storageMode = await getVisitStorageMode()

  if (storageMode === 'local') {
    return chargeLocalVisit(visit, input)
  }

  await ensureReceptionSession()

  const payload = {
    paymentStatus: 'paid',
    paymentMethod: input.paymentMethod,
    amountCharged: input.amountCharged ?? visit.amountCharged ?? null,
    paidParkAmount: input.amountCharged ?? visit.amountCharged ?? visit.parkChargeAmount ?? null,
    parkPaymentStatus: 'paid',
    parkPaidAt: Timestamp.fromDate(new Date()),
    parkPaymentMethod: input.paymentMethod,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  }

  await Promise.all([
    updateDoc(getDocumentRef('activeVisits', visit.id), payload),
    updateDoc(getDocumentRef('visits', visit.id), payload),
  ])
}

export const extendVisitTime = async (visit: ActiveVisit, input: { minutes: 30 | 60; amount: number }) => {
  const storageMode = await getVisitStorageMode()

  if (storageMode === 'local') {
    return extendLocalVisitTime(visit, input)
  }

  await ensureReceptionSession()

  const now = new Date()
  const baseEndTime = visit.expectedEndAt && visit.expectedEndAt.getTime() > now.getTime() ? visit.expectedEndAt : now
  const newEndTime = new Date(baseEndTime.getTime() + input.minutes * 60 * 1000)
  const userAudit = await getCurrentUserAudit()
  const currentParkCharge = Number(visit.parkChargeAmount ?? visit.amountCharged ?? visit.defaultAmount ?? 0)
  const nextParkCharge = currentParkCharge + input.amount
  const extensionRecord = {
    id: `extension-${Date.now()}`,
    type: 'time_extension' as const,
    minutes: input.minutes,
    amount: input.amount,
    previousEndTime: timestampOrNull(visit.expectedEndAt),
    newEndTime: Timestamp.fromDate(newEndTime),
    createdAt: Timestamp.fromDate(now),
    createdBy: userAudit.uid,
    createdByName: userAudit.name,
  }
  const payload = {
    expectedEndAt: Timestamp.fromDate(newEndTime),
    durationMinutes: visit.durationMinutes === null ? null : Number(visit.durationMinutes ?? 0) + input.minutes,
    parkChargeAmount: nextParkCharge,
    extensionChargeAmount: Number(visit.extensionChargeAmount ?? 0) + input.amount,
    paymentStatus: 'payAtExit' as const,
    parkPaymentStatus: 'pending' as const,
    timeExtensions: arrayUnion(extensionRecord),
    updatedAt: serverTimestamp(),
    updatedBy: userAudit.uid,
  }

  await Promise.all([
    updateDoc(getDocumentRef('activeVisits', visit.id), payload),
    updateDoc(getDocumentRef('visits', visit.id), payload),
  ])

  void logActivity({
    action: 'update',
    description: `Extendió tiempo de visita de ${visit.childName} por ${input.minutes} minutos`,
    entityId: visit.id,
    entityName: visit.childName,
    metadata: {
      amount: input.amount,
      minutes: input.minutes,
      previousEndTime: visit.expectedEndAt?.toISOString() ?? '',
      newEndTime: newEndTime.toISOString(),
    },
    module: 'Recepción',
  })
}

export const finishVisit = async (visit: ActiveVisit) => {
  const storageMode = await getVisitStorageMode()

  if (storageMode === 'local') {
    return finishLocalVisit(visit)
  }

  await ensureReceptionSession()

  const endedAt = new Date()
  const payload = {
    status: 'finished',
    endedAt: Timestamp.fromDate(endedAt),
    realDurationMinutes: getRealDurationMinutes(visit.startedAt, endedAt),
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
    paymentStatus: visit.paymentStatus,
    paymentMethod: visit.paymentMethod ?? '',
    amountCharged: visit.amountCharged ?? null,
  }

  const batch = writeBatch(getDocumentRef('visits', visit.id).firestore)
  batch.update(getDocumentRef('visits', visit.id), payload)
  batch.delete(getDocumentRef('activeVisits', visit.id))
  await batch.commit()
}

export const removeActiveVisitCopy = async (visitId: string) => {
  await deleteDoc(getDocumentRef('activeVisits', visitId))
}

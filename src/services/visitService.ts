import {
  Timestamp,
  deleteDoc,
  doc,
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
import { chargeLocalVisit, createLocalNormalVisit, finishLocalVisit } from './localVisitStore'
import { getVisitStorageMode } from './visitStorageMode'
import type { ActiveVisit, ChargeVisitInput, CreateVisitInput } from '../types'
import { getExpectedEndAt, getRealDurationMinutes } from '../utils/visitTime'
import { formatPersonName, lowerSearchKey, normalizeWhitespace, phoneDigits } from '../utils/textFormat'

const currentUserId = () => auth.currentUser?.uid ?? null

const timestampOrNull = (date: Date | null) => (date ? Timestamp.fromDate(date) : null)

const optionalText = (value?: string) => {
  const normalized = normalizeWhitespace(value ?? '')
  return normalized.length > 0 ? normalized : undefined
}

const lowerKey = (value: string) => lowerSearchKey(value)

const findCustomerByPhone = async (phone?: string) => {
  if (!phone) {
    return null
  }

  const snapshot = await getDocs(
    query(getCollectionRef('customers'), where('phone', '==', phone), limit(1)),
  )

  return snapshot.docs[0] ?? null
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

export const createNormalVisit = async (input: CreateVisitInput) => {
  const storageMode = await getVisitStorageMode()

  if (storageMode === 'local') {
    return createLocalNormalVisit(input)
  }

  await ensureReceptionSession()

  const childName = formatPersonName(input.childName)
  const customerName = formatPersonName(input.customerName)
  const customerPhone = optionalText(phoneDigits(input.customerPhone ?? ''))
  const plan = getTimePlanById(input.planId)
  const startedAt = input.startedAt
  const expectedEndAt = getExpectedEndAt(startedAt, plan.durationMinutes, plan.isUnlimited)
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid

  const existingCustomer = await findCustomerByPhone(customerPhone)
  const customerRef = existingCustomer
    ? getDocumentRef('customers', existingCustomer.id)
    : doc(getCollectionRef('customers'))

  await setDoc(
    customerRef,
    {
      name: customerName,
      phone: customerPhone ?? '',
      relation: optionalText(input.customerRelation) ?? '',
      updatedAt: serverTimestamp(),
      ...(existingCustomer ? {} : { marketingConsent: false, createdAt: serverTimestamp() }),
    },
    { merge: true },
  )

  const existingChild = await findChildByNameAndPhone(childName, customerPhone)
  const childRef = existingChild ? getDocumentRef('children', existingChild.id) : doc(getCollectionRef('children'))
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
    ...(existingChild ? {} : { eventGuestCount: 0, marketingConsent: false, createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const visitRef = doc(getCollectionRef('visits'))
  const activeVisitRef = getDocumentRef('activeVisits', visitRef.id)
  const amountCharged = input.amountCharged ?? null

  const visitPayload = {
    id: visitRef.id,
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
    parkPaymentStatus: input.paymentStatus === 'paid' ? 'paid' : 'pending',
    parkPaidAt: input.paymentStatus === 'paid' ? Timestamp.fromDate(startedAt) : null,
    parkPaymentMethod: input.paymentStatus === 'paid' ? input.paymentMethod ?? '' : '',
    defaultAmount: input.defaultAmount ?? plan.defaultPrice ?? null,
    customAmount: Boolean(input.customAmount),
    notes: optionalText(input.notes) ?? '',
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
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  }

  await Promise.all([
    updateDoc(getDocumentRef('activeVisits', visit.id), payload),
    updateDoc(getDocumentRef('visits', visit.id), payload),
  ])
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

import { Timestamp, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { ensureReceptionSession } from './authSession'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { chargeLocalVisit, createLocalNormalVisit, extendLocalVisitTime, finishLocalVisit } from './localVisitStore'
import { callSecureFunction } from './secureFunctions'
import { getVisitStorageMode } from './visitStorageMode'
import type { ActiveVisit, ChargeVisitInput, ChildProfile, CreateVisitInput } from '../types'
import { lowerSearchKey } from '../utils/textFormat'

export const normalizeDocumentNumber = (value?: string) => String(value ?? '').replace(/\D/g, '')

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

const findCustomerByDocument = async (documentNumberNormalized: string) => {
  const snapshot = await getDocs(
    query(getCollectionRef('customers'), where('documentNumberNormalized', '==', documentNumberNormalized), limit(2)),
  )
  if (snapshot.size > 1) throw new Error('La cedula esta asociada a responsables duplicados. Solicita revision administrativa.')
  return snapshot.docs[0] ?? null
}

const getChildrenForCustomer = async (customerId: string) => {
  const snapshots = await Promise.all([
    getDocs(query(getCollectionRef('children'), where('mainCustomerId', '==', customerId), limit(50))),
    getDocs(query(getCollectionRef('children'), where('customerId', '==', customerId), limit(50))),
  ])
  const children = new Map<string, ChildProfile>()
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    children.set(document.id, mapChildProfile(document.id, document.data()))
  }))
  return Array.from(children.values()).sort((left, right) => left.name.localeCompare(right.name, 'es'))
}

export const findResponsibleByDocument = async (documentNumber: string) => {
  await ensureReceptionSession()
  const normalizedDocument = normalizeDocumentNumber(documentNumber)
  if (normalizedDocument.length < 4) return null

  const customerSnapshot = await findCustomerByDocument(normalizedDocument)
  if (!customerSnapshot) return null
  const data = customerSnapshot.data()
  return {
    id: customerSnapshot.id,
    name: String(data.name ?? ''),
    phone: String(data.phone ?? ''),
    relation: String(data.relation ?? ''),
    documentNumber: String(data.documentNumber ?? documentNumber),
    documentNumberNormalized: String(data.documentNumberNormalized ?? normalizedDocument),
    children: await getChildrenForCustomer(customerSnapshot.id),
  }
}

export const createNormalVisit = async (input: CreateVisitInput) => {
  const storageMode = await getVisitStorageMode()
  if (storageMode === 'local') return createLocalNormalVisit(input)

  const result = await callSecureFunction<{ visitId: string }>(
    'createVisitSecure',
    { ...input, startedAt: input.startedAt.toISOString() },
    `create-visit:${input.groupEntryId || 'single'}:${input.childId || lowerSearchKey(input.childName)}:${input.startedAt.toISOString()}`,
  )
  return result.visitId
}

export const chargeVisit = async (visit: ActiveVisit, input: ChargeVisitInput) => {
  const storageMode = await getVisitStorageMode()
  if (storageMode === 'local') return chargeLocalVisit(visit, input)

  await callSecureFunction(
    'chargeVisitSecure',
    { visitId: visit.id, paymentMethod: input.paymentMethod },
    `charge-visit:${visit.id}:${input.paymentMethod}`,
  )
}

export const extendVisitTime = async (visit: ActiveVisit, input: { minutes: 30 | 60; amount: number }) => {
  if (visit.isUnlimited) {
    throw new Error('El plan libre no se puede extender.')
  }

  const storageMode = await getVisitStorageMode()
  if (storageMode === 'local') return extendLocalVisitTime(visit, input)

  await callSecureFunction(
    'extendVisitTimeSecure',
    { visitId: visit.id, minutes: input.minutes },
    `extend-visit:${visit.id}:${input.minutes}`,
  )
}

export const finishVisit = async (visit: ActiveVisit) => {
  const storageMode = await getVisitStorageMode()
  if (storageMode === 'local') return finishLocalVisit(visit)

  await callSecureFunction(
    'finishVisitSecure',
    { visitId: visit.id },
    `finish-visit:${visit.id}`,
  )
}

export const removeActiveVisitCopy = async (visitId: string) => {
  const snapshot = await getDoc(getDocumentRef('activeVisits', visitId))
  if (!snapshot.exists()) return
  await callSecureFunction(
    'finishVisitSecure',
    { visitId },
    `finish-visit:${visitId}`,
  )
}

import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import type { CanteenOrder, ChildProfile, CustomerProfile, EventGuest, LuccaEvent, PaymentStatus } from '../types'

export interface ClientVisitHistoryItem {
  id: string
  childId: string
  childName: string
  childGender?: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  customerRelation?: string
  customerDocumentNumber?: string
  customerDocumentNumberNormalized?: string
  startedAt?: Date | null
  endedAt?: Date | null
  createdAt?: Date | null
  status?: string
  paymentStatus?: PaymentStatus
  planName?: string
  realDurationMinutes?: number | null
  childrenCount?: number
  amountCharged?: number | null
  defaultAmount?: number | null
}

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

const mapCustomer = (id: string, data: Record<string, unknown>): CustomerProfile => ({
  id,
  name: String(data.name ?? ''),
  phone: String(data.phone ?? ''),
  relation: String(data.relation ?? ''),
  documentNumber: String(data.documentNumber ?? ''),
  documentNumberNormalized: String(data.documentNumberNormalized ?? ''),
  childrenIds: Array.isArray(data.childrenIds) ? data.childrenIds.map(String) : [],
  email: String(data.email ?? ''),
  notes: String(data.notes ?? ''),
  marketingConsent: Boolean(data.marketingConsent),
  marketingConsentAt: dateFromTimestamp(data.marketingConsentAt),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapChild = (id: string, data: Record<string, unknown>): ChildProfile => ({
  id,
  name: String(data.name ?? ''),
  birthDate: String(data.birthDate ?? ''),
  gender: String(data.gender ?? ''),
  ageRange: String(data.ageRange ?? ''),
  mainCustomerId: String(data.mainCustomerId ?? data.customerId ?? ''),
  mainCustomerName: String(data.mainCustomerName ?? data.customerName ?? ''),
  mainCustomerPhone: String(data.mainCustomerPhone ?? data.customerPhone ?? ''),
  guardianId: String(data.guardianId ?? data.mainCustomerId ?? data.customerId ?? ''),
  guardianDocumentNumber: String(data.guardianDocumentNumber ?? ''),
  guardianDocumentNumberNormalized: String(data.guardianDocumentNumberNormalized ?? ''),
  guardianName: String(data.guardianName ?? data.mainCustomerName ?? data.customerName ?? ''),
  guardianPhone: String(data.guardianPhone ?? data.mainCustomerPhone ?? data.customerPhone ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  notes: String(data.notes ?? ''),
  visitCount: Number(data.visitCount ?? 0),
  eventGuestCount: Number(data.eventGuestCount ?? 0),
  eventReservationCount: Number(data.eventReservationCount ?? 0),
  lastVisitAt: dateFromTimestamp(data.lastVisitAt),
  firstReservationAt: dateFromTimestamp(data.firstReservationAt),
  lastReservationAt: dateFromTimestamp(data.lastReservationAt),
  lastInteractionAt: dateFromTimestamp(data.lastInteractionAt),
  lastSource: (data.lastSource as ChildProfile['lastSource']) ?? '',
  marketingConsent: Boolean(data.marketingConsent),
  marketingConsentAt: dateFromTimestamp(data.marketingConsentAt),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapEvent = (id: string, data: Record<string, unknown>): LuccaEvent => ({
  id,
  title: String(data.title ?? ''),
  birthdayChildName: String(data.birthdayChildName ?? ''),
  childId: data.childId ? String(data.childId) : null,
  childBirthDate: data.childBirthDate ? String(data.childBirthDate) : null,
  customerName: String(data.customerName ?? ''),
  customerId: data.customerId ? String(data.customerId) : null,
  customerPhone: String(data.customerPhone ?? ''),
  date: String(data.date ?? ''),
  startTime: String(data.startTime ?? ''),
  endTime: String(data.endTime ?? ''),
  contractedChildrenCount: Number(data.contractedChildrenCount ?? 0),
  registeredGuestsCount: Number(data.registeredGuestsCount ?? 0),
  status: (data.status as LuccaEvent['status']) ?? 'reserved',
  eventType: (data.eventType as LuccaEvent['eventType']) ?? 'birthday',
  totalAmount: data.totalAmount === null || data.totalAmount === undefined ? null : Number(data.totalAmount),
  depositAmount: data.depositAmount === null || data.depositAmount === undefined ? null : Number(data.depositAmount),
  pendingAmount: data.pendingAmount === null || data.pendingAmount === undefined ? null : Number(data.pendingAmount),
  eventPaidAmount: data.eventPaidAmount === null || data.eventPaidAmount === undefined ? null : Number(data.eventPaidAmount),
  financialStatus: (data.financialStatus as LuccaEvent['financialStatus']) ?? undefined,
  notes: String(data.notes ?? ''),
  tvModeEnabled: Boolean(data.tvModeEnabled),
  tvDisplayEnabled: Boolean(data.tvDisplayEnabled),
  tvImageUrl: String(data.tvImageUrl ?? ''),
  tvImageUpdatedAt: dateFromTimestamp(data.tvImageUpdatedAt),
  tvTitle: String(data.tvTitle ?? ''),
  tvMessage: String(data.tvMessage ?? ''),
  tvBannerImageUrl: String(data.tvBannerImageUrl ?? ''),
  showGuestCounterOnTv: data.showGuestCounterOnTv !== false,
  showEventNameOnTv: data.showEventNameOnTv !== false,
  hideSensitiveInfoOnTv: Boolean(data.hideSensitiveInfoOnTv),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

const mapVisit = (id: string, data: Record<string, unknown>): ClientVisitHistoryItem => ({
  id,
  childId: String(data.childId ?? ''),
  childName: String(data.childName ?? ''),
  childGender: String(data.childGender ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  customerRelation: String(data.customerRelation ?? ''),
  customerDocumentNumber: String(data.customerDocumentNumber ?? data.guardianDocumentNumber ?? ''),
  customerDocumentNumberNormalized: String(data.customerDocumentNumberNormalized ?? data.guardianDocumentNumberNormalized ?? ''),
  startedAt: dateFromTimestamp(data.startedAt),
  endedAt: dateFromTimestamp(data.endedAt),
  createdAt: dateFromTimestamp(data.createdAt),
  status: String(data.status ?? ''),
  paymentStatus: (data.paymentStatus as PaymentStatus) ?? 'pending',
  planName: String(data.planName ?? ''),
  childrenCount: Number(data.childrenCount ?? 1),
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? null : Number(data.amountCharged),
  defaultAmount: data.defaultAmount === null || data.defaultAmount === undefined ? null : Number(data.defaultAmount),
  realDurationMinutes:
    data.realDurationMinutes === null || data.realDurationMinutes === undefined ? null : Number(data.realDurationMinutes),
})

const mapGuest = (id: string, data: Record<string, unknown>): EventGuest => ({
  id,
  eventId: String(data.eventId ?? ''),
  childId: String(data.childId ?? ''),
  customerId: String(data.customerId ?? ''),
  childName: String(data.childName ?? ''),
  childBirthDate: String(data.childBirthDate ?? ''),
  childAgeRange: String(data.childAgeRange ?? ''),
  childGender: String(data.childGender ?? ''),
  responsibleName: String(data.responsibleName ?? ''),
  responsiblePhone: String(data.responsiblePhone ?? ''),
  notes: String(data.notes ?? ''),
  checkedInAt: dateFromTimestamp(data.checkedInAt) ?? new Date(),
  guestNumber: Number(data.guestNumber ?? 0),
  isExtra: Boolean(data.isExtra),
  source: 'event',
  eventName: String(data.eventName ?? ''),
  eventDate: String(data.eventDate ?? ''),
  birthdayChildName: String(data.birthdayChildName ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
})

const mapOrder = (id: string, data: Record<string, unknown>): CanteenOrder => ({
  id,
  type: (data.type as CanteenOrder['type']) ?? 'free',
  visitId: String(data.visitId ?? ''),
  eventId: String(data.eventId ?? ''),
  childId: String(data.childId ?? ''),
  childName: String(data.childName ?? ''),
  customerId: String(data.customerId ?? ''),
  accountName: String(data.accountName ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  items: Array.isArray(data.items) ? (data.items as CanteenOrder['items']) : [],
  total: Number(data.total ?? 0),
  costTotal: data.costTotal === null || data.costTotal === undefined ? undefined : Number(data.costTotal),
  estimatedProfit:
    data.estimatedProfit === null || data.estimatedProfit === undefined ? undefined : Number(data.estimatedProfit),
  status: (data.status as CanteenOrder['status']) ?? 'open',
  paymentStatus: (data.paymentStatus as CanteenOrder['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as CanteenOrder['paymentMethod']) ?? '',
  cardType: (data.cardType as CanteenOrder['cardType']) ?? '',
  notes: String(data.notes ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  paidAt: dateFromTimestamp(data.paidAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

export function useClientsData() {
  const [children, setChildren] = useState<ChildProfile[]>([])
  const [customers, setCustomers] = useState<CustomerProfile[]>([])
  const [visits, setVisits] = useState<ClientVisitHistoryItem[]>([])
  const [eventGuests, setEventGuests] = useState<EventGuest[]>([])
  const [events, setEvents] = useState<LuccaEvent[]>([])
  const [canteenOrders, setCanteenOrders] = useState<CanteenOrder[]>([])
  const [loadingKeys, setLoadingKeys] = useState(new Set(['children', 'customers', 'visits', 'eventGuests', 'events', 'canteenOrders']))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const unsubscribers: Array<() => void> = []

    const markLoaded = (key: string) => {
      setLoadingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }

    ensureReceptionSession()
      .then(() => {
        if (!isMounted) {
          return
        }

        const handleSnapshotError = (snapshotError: Error) => {
          setError(snapshotError.message)
          setLoadingKeys(new Set())
        }

        unsubscribers.push(
          onSnapshot(getCollectionRef('children'), (snapshot) => {
            setChildren(snapshot.docs.map((docSnapshot) => mapChild(docSnapshot.id, docSnapshot.data())))
            markLoaded('children')
          }, handleSnapshotError),
          onSnapshot(getCollectionRef('customers'), (snapshot) => {
            setCustomers(snapshot.docs.map((docSnapshot) => mapCustomer(docSnapshot.id, docSnapshot.data())))
            markLoaded('customers')
          }, handleSnapshotError),
          onSnapshot(getCollectionRef('visits'), (snapshot) => {
            setVisits(snapshot.docs.map((docSnapshot) => mapVisit(docSnapshot.id, docSnapshot.data())))
            markLoaded('visits')
          }, handleSnapshotError),
          onSnapshot(getCollectionRef('eventGuests'), (snapshot) => {
            setEventGuests(snapshot.docs.map((docSnapshot) => mapGuest(docSnapshot.id, docSnapshot.data())))
            markLoaded('eventGuests')
          }, handleSnapshotError),
          onSnapshot(getCollectionRef('events'), (snapshot) => {
            setEvents(snapshot.docs.map((docSnapshot) => mapEvent(docSnapshot.id, docSnapshot.data())))
            markLoaded('events')
          }, handleSnapshotError),
          onSnapshot(getCollectionRef('canteenOrders'), (snapshot) => {
            setCanteenOrders(snapshot.docs.map((docSnapshot) => mapOrder(docSnapshot.id, docSnapshot.data())))
            markLoaded('canteenOrders')
          }, handleSnapshotError),
        )
      })
      .catch((sessionError) => {
        setError(sessionError instanceof Error ? sessionError.message : 'No se pudo iniciar sesion.')
        setLoadingKeys(new Set())
      })

    return () => {
      isMounted = false
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  const sortedChildren = useMemo(
    () =>
      [...children].sort((a, b) => {
        const lastA = a.lastVisitAt?.getTime() ?? a.updatedAt?.getTime() ?? 0
        const lastB = b.lastVisitAt?.getTime() ?? b.updatedAt?.getTime() ?? 0
        return lastB - lastA
      }),
    [children],
  )

  return {
    children: sortedChildren,
    customers,
    visits,
    eventGuests,
    events,
    canteenOrders,
    isLoading: loadingKeys.size > 0,
    error,
  }
}

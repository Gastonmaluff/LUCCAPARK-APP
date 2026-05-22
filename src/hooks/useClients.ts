import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import type { CanteenOrder, ChildProfile, CustomerProfile, EventGuest, PaymentStatus } from '../types'

export interface ClientVisitHistoryItem {
  id: string
  childId: string
  childName: string
  customerId?: string
  customerName?: string
  startedAt?: Date | null
  endedAt?: Date | null
  createdAt?: Date | null
  status?: string
  paymentStatus?: PaymentStatus
  planName?: string
  realDurationMinutes?: number | null
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
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  notes: String(data.notes ?? ''),
  visitCount: Number(data.visitCount ?? 0),
  eventGuestCount: Number(data.eventGuestCount ?? 0),
  lastVisitAt: dateFromTimestamp(data.lastVisitAt),
  lastSource: (data.lastSource as ChildProfile['lastSource']) ?? '',
  marketingConsent: Boolean(data.marketingConsent),
  marketingConsentAt: dateFromTimestamp(data.marketingConsentAt),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapVisit = (id: string, data: Record<string, unknown>): ClientVisitHistoryItem => ({
  id,
  childId: String(data.childId ?? ''),
  childName: String(data.childName ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  startedAt: dateFromTimestamp(data.startedAt),
  endedAt: dateFromTimestamp(data.endedAt),
  createdAt: dateFromTimestamp(data.createdAt),
  status: String(data.status ?? ''),
  paymentStatus: (data.paymentStatus as PaymentStatus) ?? 'pending',
  planName: String(data.planName ?? ''),
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
  status: (data.status as CanteenOrder['status']) ?? 'open',
  paymentStatus: (data.paymentStatus as CanteenOrder['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as CanteenOrder['paymentMethod']) ?? '',
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
  const [canteenOrders, setCanteenOrders] = useState<CanteenOrder[]>([])
  const [loadingKeys, setLoadingKeys] = useState(new Set(['children', 'customers', 'visits', 'eventGuests', 'canteenOrders']))
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
    canteenOrders,
    isLoading: loadingKeys.size > 0,
    error,
  }
}

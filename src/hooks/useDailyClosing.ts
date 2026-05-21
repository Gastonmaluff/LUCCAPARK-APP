import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import { getLocalDateKey, isSameLocalDate } from '../utils/date'
import type { CanteenOrder, DailyClosing, EventGuest, LuccaEvent, PaymentMethod } from '../types'

interface FinanceVisit {
  id: string
  status: string
  paymentStatus: string
  paymentMethod: PaymentMethod
  amountCharged: number
  createdAt: Date | null
  endedAt?: Date | null
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

const emptyPaymentSummary = (): Record<Exclude<PaymentMethod, ''>, number> => ({
  cash: 0,
  transfer: 0,
  card: 0,
  qr: 0,
  other: 0,
})

const mapVisit = (id: string, data: Record<string, unknown>) => ({
  id,
  status: String(data.status ?? ''),
  paymentStatus: String(data.paymentStatus ?? ''),
  paymentMethod: String(data.paymentMethod ?? '') as PaymentMethod,
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? 0 : Number(data.amountCharged),
  createdAt: dateFromTimestamp(data.createdAt),
  endedAt: dateFromTimestamp(data.endedAt),
}) as FinanceVisit

const mapOrder = (id: string, data: Record<string, unknown>) => ({
  id,
  total: Number(data.total ?? 0),
  status: String(data.status ?? 'open'),
  paymentStatus: String(data.paymentStatus ?? 'pending'),
  paymentMethod: String(data.paymentMethod ?? '') as PaymentMethod,
  createdAt: dateFromTimestamp(data.createdAt),
  paidAt: dateFromTimestamp(data.paidAt),
}) as CanteenOrder

const mapEvent = (id: string, data: Record<string, unknown>) => ({
  id,
  date: String(data.date ?? ''),
  status: String(data.status ?? ''),
}) as LuccaEvent

const mapGuest = (id: string, data: Record<string, unknown>) => ({
  id,
  eventDate: String(data.eventDate ?? ''),
  checkedInAt: dateFromTimestamp(data.checkedInAt) ?? new Date(),
}) as EventGuest

const mapClosing = (id: string, data: Record<string, unknown>) => ({
  id,
  date: String(data.date ?? id),
  totals: data.totals as DailyClosing['totals'],
  paymentMethodsSummary: data.paymentMethodsSummary as DailyClosing['paymentMethodsSummary'],
  visitsSummary: data.visitsSummary as DailyClosing['visitsSummary'],
  canteenSummary: data.canteenSummary as DailyClosing['canteenSummary'],
  eventsSummary: data.eventsSummary as DailyClosing['eventsSummary'],
  openAccountsCount: Number(data.openAccountsCount ?? 0),
  pendingAmount: Number(data.pendingAmount ?? 0),
  notes: String(data.notes ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
}) as DailyClosing

function useCollectionData<T>(collectionName: Parameters<typeof getCollectionRef>[0], mapper: (id: string, data: Record<string, unknown>) => T) {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    ensureReceptionSession()
      .then(() => {
        if (!isMounted) {
          return
        }

        unsubscribe = onSnapshot(
          getCollectionRef(collectionName),
          (snapshot) => {
            setItems(snapshot.docs.map((docSnapshot) => mapper(docSnapshot.id, docSnapshot.data())))
            setIsLoading(false)
            setError(null)
          },
          (snapshotError) => {
            setError(snapshotError.message)
            setIsLoading(false)
          },
        )
      })
      .catch((sessionError) => {
        setError(sessionError instanceof Error ? sessionError.message : 'No se pudo iniciar sesion.')
        setIsLoading(false)
      })

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [collectionName, mapper])

  return { items, isLoading, error }
}

export function useDailyClosingData(dateKey = getLocalDateKey()) {
  const visitsResult = useCollectionData('visits', mapVisit)
  const activeVisitsResult = useCollectionData('activeVisits', mapVisit)
  const canteenResult = useCollectionData('canteenOrders', mapOrder)
  const eventsResult = useCollectionData('events', mapEvent)
  const guestsResult = useCollectionData('eventGuests', mapGuest)
  const closingsResult = useCollectionData('dailyClosings', mapClosing)

  const data = useMemo(() => {
    const visitsToday = visitsResult.items.filter((visit) => isSameLocalDate(visit.createdAt, dateKey))
    const activeVisitsToday = activeVisitsResult.items.filter((visit) => isSameLocalDate(visit.createdAt, dateKey))
    const finishedVisitsToday = visitsToday.filter((visit) => visit.status === 'finished')
    const paidVisitsToday = visitsToday.filter((visit) => visit.paymentStatus === 'paid')
    const pendingVisitsToday = [...visitsToday, ...activeVisitsToday].filter((visit) => visit.paymentStatus !== 'paid')
    const paidCanteenToday = canteenResult.items.filter((order) => order.status === 'paid' && isSameLocalDate(order.paidAt, dateKey))
    const openCanteen = canteenResult.items.filter((order) => order.status === 'open')
    const cancelledCanteenToday = canteenResult.items.filter((order) => order.status === 'cancelled' && isSameLocalDate(order.createdAt, dateKey))
    const eventsToday = eventsResult.items.filter((event) => event.date === dateKey)
    const activeEventsToday = eventsToday.filter((event) => event.status === 'active')
    const guestsToday = guestsResult.items.filter((guest) => guest.eventDate === dateKey || isSameLocalDate(guest.checkedInAt, dateKey))
    const paymentMethodsSummary = emptyPaymentSummary()

    paidVisitsToday.forEach((visit) => {
      const method = visit.paymentMethod || 'other'
      if (method) {
        paymentMethodsSummary[method as Exclude<PaymentMethod, ''>] += visit.amountCharged ?? 0
      }
    })

    paidCanteenToday.forEach((order) => {
      const method = order.paymentMethod || 'other'
      if (method) {
        paymentMethodsSummary[method as Exclude<PaymentMethod, ''>] += order.total
      }
    })

    const visitsCollected = paidVisitsToday.reduce((sum, visit) => sum + (visit.amountCharged ?? 0), 0)
    const canteenCollected = paidCanteenToday.reduce((sum, order) => sum + order.total, 0)
    const pendingAmount =
      openCanteen.reduce((sum, order) => sum + order.total, 0) +
      pendingVisitsToday.reduce((sum, visit) => sum + (visit.amountCharged ?? 0), 0)

    const closing: Omit<DailyClosing, 'id' | 'createdAt' | 'createdBy'> = {
      date: dateKey,
      totals: {
        totalCollected: visitsCollected + canteenCollected,
        visitsCollected,
        canteenCollected,
        eventsCollected: 0,
      },
      paymentMethodsSummary,
      visitsSummary: {
        registered: visitsToday.length,
        finished: finishedVisitsToday.length,
        active: activeVisitsToday.length,
        pendingPayment: pendingVisitsToday.length,
      },
      canteenSummary: {
        paidOrders: paidCanteenToday.length,
        openOrders: openCanteen.length,
        cancelledOrders: cancelledCanteenToday.length,
        paidTotal: canteenCollected,
      },
      eventsSummary: {
        activeEvents: activeEventsToday.length,
        eventsToday: eventsToday.length,
        guestsRegistered: guestsToday.length,
      },
      openAccountsCount: openCanteen.length,
      pendingAmount,
      notes: '',
    }

    return {
      closing,
      existingClosing: closingsResult.items.find((closingItem) => closingItem.date === dateKey) ?? null,
      paidCanteenToday,
      openCanteen,
    }
  }, [
    activeVisitsResult.items,
    canteenResult.items,
    closingsResult.items,
    dateKey,
    eventsResult.items,
    guestsResult.items,
    visitsResult.items,
  ])

  return {
    ...data,
    isLoading:
      visitsResult.isLoading ||
      activeVisitsResult.isLoading ||
      canteenResult.isLoading ||
      eventsResult.isLoading ||
      guestsResult.isLoading ||
      closingsResult.isLoading,
    error:
      visitsResult.error ||
      activeVisitsResult.error ||
      canteenResult.error ||
      eventsResult.error ||
      guestsResult.error ||
      closingsResult.error,
  }
}

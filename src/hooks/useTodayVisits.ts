import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import { getLocalDateKey } from '../utils/date'
import type { PaymentMethod, PaymentStatus, TimePlan } from '../types'

export interface TodayVisitRecord {
  id: string
  childName: string
  customerName: string
  startedAt: Date
  expectedEndAt: Date | null
  endedAt: Date | null
  planName: string
  planId: TimePlan['id']
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  amountCharged?: number | null
  status: 'active' | 'finished' | string
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

const mapVisit = (id: string, data: Record<string, unknown>): TodayVisitRecord => ({
  id,
  childName: String(data.childName ?? ''),
  customerName: String(data.customerName ?? ''),
  startedAt: dateFromTimestamp(data.startedAt) ?? dateFromTimestamp(data.createdAt) ?? new Date(),
  expectedEndAt: dateFromTimestamp(data.expectedEndAt),
  endedAt: dateFromTimestamp(data.endedAt),
  planName: String(data.planName ?? ''),
  planId: (data.planId as TimePlan['id']) ?? 'one-hour',
  paymentStatus: (data.paymentStatus as PaymentStatus) ?? 'pending',
  paymentMethod: (data.paymentMethod as PaymentMethod) ?? '',
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? null : Number(data.amountCharged),
  status: String(data.status ?? 'active'),
})

export function useTodayVisits(dateKey = getLocalDateKey()) {
  const [visits, setVisits] = useState<TodayVisitRecord[]>([])
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
          getCollectionRef('visits'),
          (snapshot) => {
            setVisits(snapshot.docs.map((docSnapshot) => mapVisit(docSnapshot.id, docSnapshot.data())))
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
  }, [])

  const todayVisits = useMemo(
    () =>
      visits
        .filter((visit) => getLocalDateKey(visit.startedAt) === dateKey)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    [dateKey, visits],
  )

  return { visits: todayVisits, isLoading, error }
}

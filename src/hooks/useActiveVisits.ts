import { Timestamp, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { getCollectionRef } from '../services/firestoreCollections'
import { subscribeLocalActiveVisits } from '../services/localVisitStore'
import { getVisitStorageMode, type VisitStorageMode } from '../services/visitStorageMode'
import { ensureReceptionSession } from '../services/authSession'
import type { ActiveVisit } from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

const mapVisit = (id: string, data: Record<string, unknown>): ActiveVisit => ({
  id,
  childId: String(data.childId ?? ''),
  childName: String(data.childName ?? ''),
  childBirthDate: String(data.childBirthDate ?? ''),
  childAgeRange: String(data.childAgeRange ?? ''),
  childExactAge: data.childExactAge === null || data.childExactAge === undefined ? null : Number(data.childExactAge),
  childAgeCalculated: data.childAgeCalculated === null || data.childAgeCalculated === undefined ? null : Number(data.childAgeCalculated),
  childGender: String(data.childGender ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  customerRelation: String(data.customerRelation ?? ''),
  childrenCount: Number(data.childrenCount ?? 1),
  planId: (data.planId as ActiveVisit['planId']) ?? 'one-hour',
  planName: String(data.planName ?? '1 hora'),
  durationMinutes: data.durationMinutes === null ? null : Number(data.durationMinutes ?? 60),
  isUnlimited: Boolean(data.isUnlimited),
  startedAt: dateFromTimestamp(data.startedAt) ?? new Date(),
  expectedEndAt: dateFromTimestamp(data.expectedEndAt),
  paymentStatus: (data.paymentStatus as ActiveVisit['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as ActiveVisit['paymentMethod']) ?? '',
  cardType: (data.cardType as ActiveVisit['cardType']) ?? '',
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? null : Number(data.amountCharged),
  defaultAmount: data.defaultAmount === null || data.defaultAmount === undefined ? null : Number(data.defaultAmount),
  customAmount: Boolean(data.customAmount),
  notes: String(data.notes ?? ''),
  status: 'active',
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

export function useActiveVisits() {
  const [visits, setVisits] = useState<ActiveVisit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storageMode, setStorageMode] = useState<VisitStorageMode | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    getVisitStorageMode().then(async (mode) => {
      if (!isMounted) {
        return
      }

      setStorageMode(mode)

      if (mode === 'local') {
        unsubscribe = subscribeLocalActiveVisits((nextVisits) => {
          setVisits(nextVisits)
          setIsLoading(false)
          setError(null)
        })
        return
      }

      await ensureReceptionSession()

      const activeQuery = query(getCollectionRef('activeVisits'), where('status', '==', 'active'))
      unsubscribe = onSnapshot(
        activeQuery,
        (snapshot) => {
          const nextVisits = snapshot.docs
            .map((docSnapshot) => mapVisit(docSnapshot.id, docSnapshot.data()))
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

          setVisits(nextVisits)
          setIsLoading(false)
          setError(null)
        },
        (snapshotError) => {
          setError(snapshotError.message)
          setIsLoading(false)
        },
      )
    })

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [])

  return { visits, isLoading, error, storageMode }
}

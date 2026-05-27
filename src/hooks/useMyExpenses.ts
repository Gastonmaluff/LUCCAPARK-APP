import { Timestamp, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import type { ExpenseRecord, PaymentMethod } from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const mapExpense = (id: string, data: Record<string, unknown>): ExpenseRecord => ({
  id,
  date: String(data.date ?? ''),
  spentAt: dateFromTimestamp(data.spentAt) ?? dateFromTimestamp(data.createdAt),
  category: (data.category as ExpenseRecord['category']) ?? 'other',
  description: String(data.description ?? ''),
  amount: Number(data.amount ?? 0),
  paymentMethod: (data.paymentMethod as Exclude<PaymentMethod, ''>) ?? 'cash',
  cardType: (data.cardType as ExpenseRecord['cardType']) ?? '',
  type: (data.type as ExpenseRecord['type']) ?? 'general',
  eventId: String(data.eventId ?? ''),
  eventName: String(data.eventName ?? ''),
  receiptUrl: String(data.receiptUrl ?? ''),
  notes: String(data.notes ?? ''),
  status: (data.status as ExpenseRecord['status']) ?? 'active',
  createdAt: dateFromTimestamp(data.createdAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
  createdByRole: String(data.createdByRole ?? ''),
  updatedAt: dateFromTimestamp(data.updatedAt),
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

export function useMyExpenses(uid?: string | null) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(uid))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setExpenses([])
      setIsLoading(false)
      return undefined
    }

    let unsubscribe: (() => void) | undefined
    let mounted = true
    ensureReceptionSession().then(() => {
      if (!mounted) return
      unsubscribe = onSnapshot(
        query(getCollectionRef('expenses'), where('createdBy', '==', uid)),
        (snapshot) => {
          setExpenses(snapshot.docs.map((item) => mapExpense(item.id, item.data())).filter((expense) => expense.status !== 'void').sort((a, b) => (b.spentAt?.getTime() ?? 0) - (a.spentAt?.getTime() ?? 0)))
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
      mounted = false
      unsubscribe?.()
    }
  }, [uid])

  return { error, expenses, isLoading }
}

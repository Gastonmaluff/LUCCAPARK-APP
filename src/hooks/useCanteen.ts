import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import { isSameLocalDate } from '../utils/date'
import type { CanteenCategory, CanteenOrder, CanteenOrderStatus, CanteenProduct, PaymentMethod } from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

const mapProduct = (id: string, data: Record<string, unknown>): CanteenProduct => ({
  id,
  name: String(data.name ?? ''),
  category: (data.category as CanteenCategory) ?? 'Otros',
  price: Number(data.price ?? 0),
  stock: data.stock === null || data.stock === undefined ? null : Number(data.stock),
  minStock: data.minStock === null || data.minStock === undefined ? null : Number(data.minStock),
  isActive: data.isActive !== false,
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapOrder = (id: string, data: Record<string, unknown>): CanteenOrder => ({
  id,
  type: (data.type as CanteenOrder['type']) ?? 'free',
  visitId: String(data.visitId ?? ''),
  eventId: String(data.eventId ?? ''),
  accountName: String(data.accountName ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  items: Array.isArray(data.items) ? (data.items as CanteenOrder['items']) : [],
  total: Number(data.total ?? 0),
  status: (data.status as CanteenOrderStatus) ?? 'open',
  paymentStatus: (data.paymentStatus as CanteenOrder['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as PaymentMethod) ?? '',
  notes: String(data.notes ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  paidAt: dateFromTimestamp(data.paidAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

export function useCanteenProducts() {
  const [products, setProducts] = useState<CanteenProduct[]>([])
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
          getCollectionRef('canteenProducts'),
          (snapshot) => {
            const nextProducts = snapshot.docs
              .map((docSnapshot) => mapProduct(docSnapshot.id, docSnapshot.data()))
              .sort((a, b) => a.name.localeCompare(b.name))
            setProducts(nextProducts)
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

  return { products, isLoading, error }
}

export function useCanteenOrders() {
  const [orders, setOrders] = useState<CanteenOrder[]>([])
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
          getCollectionRef('canteenOrders'),
          (snapshot) => {
            const nextOrders = snapshot.docs
              .map((docSnapshot) => mapOrder(docSnapshot.id, docSnapshot.data()))
              .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
            setOrders(nextOrders)
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

  return { orders, isLoading, error }
}

export function useOpenCanteenOrders() {
  const result = useCanteenOrders()
  const openOrders = useMemo(() => result.orders.filter((order) => order.status === 'open'), [result.orders])

  return { ...result, orders: openOrders }
}

export function usePaidCanteenOrdersForDate(dateKey: string) {
  const result = useCanteenOrders()
  const paidOrders = useMemo(
    () => result.orders.filter((order) => order.status === 'paid' && isSameLocalDate(order.paidAt ?? order.updatedAt, dateKey)),
    [dateKey, result.orders],
  )

  return { ...result, orders: paidOrders }
}

import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import { isSameLocalDate } from '../utils/date'
import type {
  CanteenCategory,
  CanteenCategoryRecord,
  CanteenInventoryMovement,
  CanteenOrder,
  CanteenOrderStatus,
  CanteenProduct,
  CanteenVoidRequest,
  PaymentMethod,
  ProductImageFit,
} from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

const mapProductImageFit = (value: unknown): ProductImageFit | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const fit = value as Partial<ProductImageFit>
  return {
    scale: Number.isFinite(Number(fit.scale)) ? Number(fit.scale) : 1,
    x: Number.isFinite(Number(fit.x)) ? Number(fit.x) : 0,
    y: Number.isFinite(Number(fit.y)) ? Number(fit.y) : 0,
  }
}

const mapProduct = (id: string, data: Record<string, unknown>): CanteenProduct => ({
  id,
  name: String(data.name ?? ''),
  category: (data.category as CanteenCategory) ?? 'Sin categoría',
  categoryNormalized: data.categoryNormalized ? String(data.categoryNormalized) : undefined,
  price: Number(data.salePrice ?? data.price ?? 0),
  salePrice: Number(data.salePrice ?? data.price ?? 0),
  unitCost: data.unitCost === null || data.unitCost === undefined ? null : Number(data.unitCost),
  stock: data.stock === null || data.stock === undefined ? null : Number(data.stock),
  minStock: data.minStock === null || data.minStock === undefined ? null : Number(data.minStock),
  imageUrl: String(data.imageUrl ?? ''),
  imageFit: mapProductImageFit(data.imageFit),
  isActive: data.isActive !== false,
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapCategory = (id: string, data: Record<string, unknown>): CanteenCategoryRecord => ({
  id,
  name: String(data.name ?? ''),
  normalizedName: String(data.normalizedName ?? id),
  isActive: data.isActive !== false,
  sortOrder: Number(data.sortOrder ?? 999),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapInventoryMovement = (id: string, data: Record<string, unknown>): CanteenInventoryMovement => ({
  id,
  type: String(data.type ?? ''),
  productId: String(data.productId ?? ''),
  productName: String(data.productName ?? ''),
  quantity: Number(data.quantity ?? 0),
  delta: Number(data.delta ?? 0),
  stockBefore: data.stockBefore === null || data.stockBefore === undefined ? null : Number(data.stockBefore),
  stockAfter: data.stockAfter === null || data.stockAfter === undefined ? null : Number(data.stockAfter),
  reason: String(data.reason ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  createdBy: data.createdBy ? String(data.createdBy) : undefined,
  createdByName: data.createdByName ? String(data.createdByName) : undefined,
  source: data.source ? String(data.source) : undefined,
})

const mapOrder = (id: string, data: Record<string, unknown>): CanteenOrder => ({
  id,
  type: (data.type as CanteenOrder['type']) ?? 'free',
  visitId: String(data.visitId ?? ''),
  visitIds: Array.isArray(data.visitIds) ? data.visitIds.map(String) : [],
  groupEntryId: String(data.groupEntryId ?? ''),
  eventId: String(data.eventId ?? ''),
  childId: String(data.childId ?? ''),
  childIds: Array.isArray(data.childIds) ? data.childIds.map(String) : [],
  childName: String(data.childName ?? ''),
  childNames: Array.isArray(data.childNames) ? data.childNames.map(String) : [],
  customerId: String(data.customerId ?? ''),
  guardianId: String(data.guardianId ?? ''),
  accountName: String(data.accountName ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  items: Array.isArray(data.items)
    ? (data.items as CanteenOrder['items']).map((item) => ({ ...item, lineItemId: item.lineItemId || item.productId, status: item.status || 'active' }))
    : [],
  total: Number(data.total ?? 0),
  costTotal: data.costTotal === null || data.costTotal === undefined ? undefined : Number(data.costTotal),
  estimatedProfit:
    data.estimatedProfit === null || data.estimatedProfit === undefined ? undefined : Number(data.estimatedProfit),
  status: (data.status as CanteenOrderStatus) ?? 'open',
  paymentStatus: (data.paymentStatus as CanteenOrder['paymentStatus']) ?? 'pending',
  paidAmount: data.paidAmount === null || data.paidAmount === undefined ? undefined : Number(data.paidAmount),
  lastPartialPaymentAt: dateFromTimestamp(data.lastPartialPaymentAt),
  paymentMethod: (data.paymentMethod as PaymentMethod) ?? '',
  cardType: (data.cardType as CanteenOrder['cardType']) ?? '',
  notes: String(data.notes ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  paidAt: dateFromTimestamp(data.paidAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
  pendingVoidRequestId: String(data.pendingVoidRequestId ?? ''),
  voidRequestStatus: data.voidRequestStatus === 'pending' ? 'pending' : '',
  closedAt: dateFromTimestamp(data.closedAt),
  closedBy: data.closedBy ? String(data.closedBy) : null,
  closedReason: String(data.closedReason ?? ''),
  refundedAt: dateFromTimestamp(data.refundedAt),
  refundedBy: data.refundedBy ? String(data.refundedBy) : null,
})

const mapVoidRequest = (id: string, data: Record<string, unknown>): CanteenVoidRequest => ({
  id,
  accountId: String(data.accountId ?? ''),
  scope: data.scope === 'line' ? 'line' : 'account',
  lineItemId: data.lineItemId ? String(data.lineItemId) : undefined,
  amount: Number(data.amount ?? 0),
  items: Array.isArray(data.items) ? (data.items as CanteenVoidRequest['items']) : [],
  reason: String(data.reason ?? ''),
  notes: String(data.notes ?? ''),
  status: data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending',
  requestedByUid: String(data.requestedByUid ?? ''),
  requestedByName: String(data.requestedByName ?? ''),
  requestedAt: dateFromTimestamp(data.requestedAt),
  reviewedByUid: data.reviewedByUid ? String(data.reviewedByUid) : undefined,
  reviewedByName: data.reviewedByName ? String(data.reviewedByName) : undefined,
  reviewedAt: dateFromTimestamp(data.reviewedAt),
  reviewNotes: String(data.reviewNotes ?? ''),
  productsDelivered: data.productsDelivered === true,
  deliveredDisposition: data.deliveredDisposition as CanteenVoidRequest['deliveredDisposition'],
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

export function useCanteenCategories() {
  const [categories, setCategories] = useState<CanteenCategoryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      getCollectionRef('canteenCategories'),
      (snapshot) => {
        setCategories(snapshot.docs.map((docSnapshot) => mapCategory(docSnapshot.id, docSnapshot.data())).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')))
        setIsLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setIsLoading(false)
      },
    )
    return unsubscribe
  }, [])

  return { categories, isLoading, error }
}

export function useCanteenInventoryMovements() {
  const [movements, setMovements] = useState<CanteenInventoryMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      getCollectionRef('canteenInventoryMovements'),
      (snapshot) => {
        setMovements(snapshot.docs.map((docSnapshot) => mapInventoryMovement(docSnapshot.id, docSnapshot.data())).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
        setIsLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setIsLoading(false)
      },
    )
    return unsubscribe
  }, [])

  return { movements, isLoading, error }
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

export function useCanteenVoidRequests() {
  const [requests, setRequests] = useState<CanteenVoidRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      getCollectionRef('canteenVoidRequests'),
      (snapshot) => {
        setRequests(snapshot.docs.map((item) => mapVoidRequest(item.id, item.data())).sort((a, b) => (b.requestedAt?.getTime() ?? 0) - (a.requestedAt?.getTime() ?? 0)))
        setIsLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setIsLoading(false)
      },
    )
    return unsubscribe
  }, [])

  return { requests, isLoading, error }
}

export function usePaidCanteenOrdersForDate(dateKey: string) {
  const result = useCanteenOrders()
  const paidOrders = useMemo(
    () => result.orders.filter((order) => order.status === 'paid' && isSameLocalDate(order.paidAt ?? order.updatedAt, dateKey)),
    [dateKey, result.orders],
  )

  return { ...result, orders: paidOrders }
}

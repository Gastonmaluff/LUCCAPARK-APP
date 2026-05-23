import {
  Timestamp,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth } from '../config/firebase'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import type {
  CanteenOrder,
  CanteenOrderItem,
  CreateCanteenOrderInput,
  PaymentMethod,
  UpsertCanteenProductInput,
} from '../types'

const currentUserId = () => auth.currentUser?.uid ?? null

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ')

const totalFromItems = (items: CanteenOrderItem[]) =>
  items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

const costFromItems = (items: CanteenOrderItem[]) =>
  items.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0)

const normalizeItems = (items: CanteenOrderItem[]) =>
  items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    subtotal: Number(item.unitPrice) * Number(item.quantity),
    costSubtotal: Number(item.unitCost ?? 0) * Number(item.quantity),
  }))

const applyStockDelta = (batch: ReturnType<typeof writeBatch>, items: CanteenOrderItem[], direction: -1 | 1) => {
  items.forEach((item) => {
    batch.update(getDocumentRef('canteenProducts', item.productId), {
      stock: increment(direction * item.quantity),
      updatedAt: serverTimestamp(),
    })
  })
}

export const upsertCanteenProduct = async (input: UpsertCanteenProductInput) => {
  await ensureReceptionSession()

  const productRef = input.id ? getDocumentRef('canteenProducts', input.id) : doc(getCollectionRef('canteenProducts'))

  await setDoc(
    productRef,
    {
      id: productRef.id,
      name: normalizeText(input.name),
      category: input.category,
      price: Number(input.price),
      salePrice: Number(input.price),
      unitCost: input.unitCost === undefined || input.unitCost === null || Number.isNaN(Number(input.unitCost)) ? null : Number(input.unitCost),
      stock: input.stock === undefined || input.stock === null || Number.isNaN(Number(input.stock)) ? null : Number(input.stock),
      minStock:
        input.minStock === undefined || input.minStock === null || Number.isNaN(Number(input.minStock))
          ? null
          : Number(input.minStock),
      isActive: input.isActive,
      imageUrl: normalizeText(input.imageUrl ?? ''),
      updatedAt: serverTimestamp(),
      ...(input.id ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )

  return productRef.id
}

export const uploadCanteenProductImage = async (file: File) => {
  await ensureReceptionSession()
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const storageRef = ref(storage, `canteen-products/${Date.now()}-${safeName}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export const setCanteenProductActive = async (productId: string, isActive: boolean) => {
  await ensureReceptionSession()

  await updateDoc(getDocumentRef('canteenProducts', productId), {
    isActive,
    updatedAt: serverTimestamp(),
  })
}

export const createCanteenOrder = async (input: CreateCanteenOrderInput) => {
  await ensureReceptionSession()

  const items = normalizeItems(input.items)
  const orderRef = doc(getCollectionRef('canteenOrders'))
  const now = new Date()
  const paymentStatus = input.chargeNow ? 'paid' : 'pending'
  const status = input.chargeNow ? 'paid' : 'open'
  const total = totalFromItems(items)
  const costTotal = costFromItems(items)

  const batch = writeBatch(orderRef.firestore)
  batch.set(orderRef, {
    id: orderRef.id,
    type: input.type,
    visitId: input.visitId ?? '',
    eventId: input.eventId ?? '',
    childId: input.childId ?? '',
    childName: normalizeText(input.childName ?? ''),
    customerId: input.customerId ?? '',
    accountName: normalizeText(input.accountName),
    customerName: normalizeText(input.customerName ?? ''),
    customerPhone: normalizeText(input.customerPhone ?? ''),
    items,
    total,
    costTotal,
    estimatedProfit: total - costTotal,
    status,
    paymentStatus,
    paymentMethod: input.chargeNow ? input.paymentMethod ?? 'cash' : '',
    notes: normalizeText(input.notes ?? ''),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    paidAt: input.chargeNow ? Timestamp.fromDate(now) : null,
    createdBy: currentUserId(),
    updatedBy: currentUserId(),
  })
  applyStockDelta(batch, items, -1)
  await batch.commit()

  return orderRef.id
}

export const addItemsToCanteenOrder = async (order: CanteenOrder, newItems: CanteenOrderItem[]) => {
  await ensureReceptionSession()

  const normalizedNewItems = normalizeItems(newItems)
  const mergedItems = [...order.items]

  normalizedNewItems.forEach((newItem) => {
    const existing = mergedItems.find((item) => item.productId === newItem.productId)

    if (existing) {
      existing.quantity += newItem.quantity
      existing.subtotal = existing.quantity * existing.unitPrice
      return
    }

    mergedItems.push(newItem)
  })

  const batch = writeBatch(getDocumentRef('canteenOrders', order.id).firestore)
  batch.update(getDocumentRef('canteenOrders', order.id), {
    items: mergedItems,
    total: totalFromItems(mergedItems),
    costTotal: costFromItems(mergedItems),
    estimatedProfit: totalFromItems(mergedItems) - costFromItems(mergedItems),
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })
  applyStockDelta(batch, normalizedNewItems, -1)
  await batch.commit()
}

export const updateCanteenOrderItems = async (order: CanteenOrder, items: CanteenOrderItem[]) => {
  await ensureReceptionSession()

  const normalizedItems = normalizeItems(items)
  const productIds = new Set([...order.items.map((item) => item.productId), ...normalizedItems.map((item) => item.productId)])
  const batch = writeBatch(getDocumentRef('canteenOrders', order.id).firestore)

  batch.update(getDocumentRef('canteenOrders', order.id), {
    items: normalizedItems,
    total: totalFromItems(normalizedItems),
    costTotal: costFromItems(normalizedItems),
    estimatedProfit: totalFromItems(normalizedItems) - costFromItems(normalizedItems),
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })

  productIds.forEach((productId) => {
    const previousQuantity = order.items.find((item) => item.productId === productId)?.quantity ?? 0
    const nextQuantity = normalizedItems.find((item) => item.productId === productId)?.quantity ?? 0
    const stockDelta = previousQuantity - nextQuantity
    if (stockDelta !== 0) {
      batch.update(getDocumentRef('canteenProducts', productId), {
        stock: increment(stockDelta),
        updatedAt: serverTimestamp(),
      })
    }
  })

  await batch.commit()
}

export const chargeCanteenOrder = async (order: CanteenOrder, paymentMethod: Exclude<PaymentMethod, ''>) => {
  await ensureReceptionSession()

  await updateDoc(getDocumentRef('canteenOrders', order.id), {
    status: 'paid',
    paymentStatus: 'paid',
    paymentMethod,
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })
}

export const cancelCanteenOrder = async (order: CanteenOrder) => {
  await ensureReceptionSession()

  await runTransaction(getDocumentRef('canteenOrders', order.id).firestore, async (transaction) => {
    const orderRef = getDocumentRef('canteenOrders', order.id)
    const snapshot = await transaction.get(orderRef)

    if (!snapshot.exists()) {
      throw new Error('La cuenta ya no existe.')
    }

    if (snapshot.data().status === 'cancelled') {
      return
    }

    transaction.update(orderRef, {
      status: 'cancelled',
      paymentStatus: 'pending',
      updatedAt: serverTimestamp(),
      updatedBy: currentUserId(),
    })

    order.items.forEach((item) => {
      transaction.update(getDocumentRef('canteenProducts', item.productId), {
        stock: increment(item.quantity),
        updatedAt: serverTimestamp(),
      })
    })
  })
}

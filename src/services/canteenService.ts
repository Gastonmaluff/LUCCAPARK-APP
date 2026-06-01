import {
  Timestamp,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth } from '../config/firebase'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { firebaseConfig, storage } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { logActivity } from './activityLogService'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'
import { formatGuarani } from '../utils/money'
import { formatPersonName, normalizeWhitespace, phoneDigits } from '../utils/textFormat'
import type {
  CanteenOrder,
  CanteenOrderItem,
  CreateCanteenOrderInput,
  PaymentMethod,
  UpsertCanteenProductInput,
} from '../types'

const currentUserId = () => auth.currentUser?.uid ?? null

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
  const previousSnapshot = input.id ? await getDoc(productRef).catch(() => null) : null
  const previousPrice = previousSnapshot?.exists() ? Number(previousSnapshot.data().price ?? previousSnapshot.data().salePrice ?? 0) : null
  const nextPrice = Number(input.price)
  const productName = normalizeWhitespace(input.name)

  await setDoc(
    productRef,
    {
      id: productRef.id,
      name: productName,
      category: input.category,
      price: nextPrice,
      salePrice: nextPrice,
      unitCost: input.unitCost === undefined || input.unitCost === null || Number.isNaN(Number(input.unitCost)) ? null : Number(input.unitCost),
      stock: input.stock === undefined || input.stock === null || Number.isNaN(Number(input.stock)) ? null : Number(input.stock),
      minStock:
        input.minStock === undefined || input.minStock === null || Number.isNaN(Number(input.minStock))
          ? null
          : Number(input.minStock),
      isActive: input.isActive,
      imageFit: input.imageFit
        ? {
            scale: Number(input.imageFit.scale) || 1,
            x: Number(input.imageFit.x) || 0,
            y: Number(input.imageFit.y) || 0,
          }
        : { scale: 1, x: 0, y: 0 },
      imageUrl: normalizeWhitespace(input.imageUrl ?? ''),
      updatedAt: serverTimestamp(),
      ...(input.id ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )

  if (input.id) {
    const priceChanged = previousPrice !== null && previousPrice !== nextPrice
    void logActivity({
      action: 'update',
      description: priceChanged
        ? `Cambió precio de ${productName} de ${formatGuarani(previousPrice)} a ${formatGuarani(nextPrice)}`
        : `Actualizó producto ${productName}`,
      entityId: productRef.id,
      entityName: productName,
      metadata: { newPrice: nextPrice, previousPrice },
      module: 'Cantina',
    })
  }

  return productRef.id
}

const maxProductImageSize = 5 * 1024 * 1024
const allowedProductImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export const uploadCanteenProductImage = async (file: File, productId = 'new') => {
  await ensureReceptionSession()

  const user = auth.currentUser
  if (!user) {
    throw new Error('Necesitas iniciar sesion como administrador para subir imagenes.')
  }

  if (!allowedProductImageTypes.has(file.type)) {
    throw new Error('Selecciona una imagen PNG, JPG o WEBP.')
  }

  if (file.size > maxProductImageSize) {
    throw new Error('La imagen supera el limite de 5 MB.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const storagePath = `canteen-products/${safeProductId}/${Date.now()}-${safeName}`
  const storageRef = ref(storage, storagePath)

  try {
    console.info('[Cantina Storage] Upload start', {
      bucket: firebaseConfig.storageBucket,
      contentType: file.type,
      path: storagePath,
      size: file.size,
      uid: user.uid,
    })
    await uploadBytes(storageRef, file, { contentType: file.type })
  } catch (error) {
    console.error('[Cantina Storage] uploadBytes failed', {
      bucket: firebaseConfig.storageBucket,
      error,
      path: storagePath,
      uid: user.uid,
    })
    const message = error instanceof Error ? error.message : ''
    if (message.includes('storage/unauthorized')) {
      throw new Error('No tenes permiso para subir esta imagen. Verifica las reglas de Firebase Storage.')
    }
    throw error
  }

  try {
    return await getDownloadURL(storageRef)
  } catch (error) {
    console.error('[Cantina Storage] getDownloadURL failed', {
      bucket: firebaseConfig.storageBucket,
      error,
      path: storagePath,
      uid: user.uid,
    })
    const message = error instanceof Error ? error.message : ''
    if (message.includes('storage/unauthorized')) {
      throw new Error('La imagen subio, pero no se pudo obtener la URL. Verifica las reglas de lectura de Firebase Storage.')
    }
    throw error
  }
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
  const userAudit = await getCurrentUserAudit()

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
    childName: formatPersonName(input.childName ?? ''),
    customerId: input.customerId ?? '',
    accountName: formatPersonName(input.accountName),
    customerName: formatPersonName(input.customerName ?? ''),
    customerPhone: phoneDigits(input.customerPhone ?? ''),
    items,
    total,
    costTotal,
    estimatedProfit: total - costTotal,
    status,
    paymentStatus,
    paymentMethod: input.chargeNow ? input.paymentMethod ?? 'cash' : '',
    notes: normalizeWhitespace(input.notes ?? ''),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    paidAt: input.chargeNow ? Timestamp.fromDate(now) : null,
    createdBy: userAudit.uid,
    createdByName: userAudit.name,
    updatedBy: userAudit.uid,
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

export const chargeCanteenOrder = async (
  order: CanteenOrder,
  paymentMethod: Exclude<PaymentMethod, ''>,
  cardType: 'debit' | 'credit' | '' = '',
) => {
  await ensureReceptionSession()

  const now = new Date()
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid
  const batch = writeBatch(getDocumentRef('canteenOrders', order.id).firestore)
  const paymentRef = doc(getCollectionRef('payments'))

  batch.update(getDocumentRef('canteenOrders', order.id), {
    status: 'paid',
    paymentStatus: 'paid',
    paymentMethod,
    cardType,
    paidAt: Timestamp.fromDate(now),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })

  batch.set(paymentRef, {
    id: paymentRef.id,
    source: 'canteen',
    concepts: 'canteen',
    status: 'paid',
    totalPaid: order.total,
    canteenAmountPaid: order.total,
    parkAmountPaid: 0,
    canteenOrderId: order.id,
    canteenOrderIds: [order.id],
    visitId: order.visitId ?? '',
    eventId: order.eventId ?? '',
    accountType: order.type,
    paymentMethod,
    cardType,
    childName: order.childName ?? order.accountName,
    customerName: order.customerName ?? '',
    description: `Cantina - ${order.accountName}`,
    paidAt: Timestamp.fromDate(now),
    createdAt: serverTimestamp(),
    createdBy: userId,
    createdByName: userAudit.name,
  })

  await batch.commit()
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

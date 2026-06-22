import {
  Timestamp,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
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
  CanteenLineStatus,
  CanteenVoidRequest,
  CreateCanteenOrderInput,
  PaymentMethod,
  UpsertCanteenProductInput,
} from '../types'

const currentUserId = () => auth.currentUser?.uid ?? null

const isAdminRole = (role: string) => role === 'admin'

const requireAuthenticatedAudit = async () => {
  await ensureReceptionSession()
  const audit = await getCurrentUserAudit()
  if (!audit.uid) throw new Error('Necesitás iniciar sesión para continuar.')
  return audit
}

const requireAdminAudit = async () => {
  const audit = await requireAuthenticatedAudit()
  if (!isAdminRole(audit.role)) throw new Error('Esta acción requiere autorización del dueño o administrador.')
  return audit
}

const totalFromItems = (items: CanteenOrderItem[]) =>
  items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

const costFromItems = (items: CanteenOrderItem[]) =>
  items.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0)

const normalizeItems = (items: CanteenOrderItem[]) =>
  items.map((item) => ({
    ...item,
    lineItemId: item.lineItemId || item.productId,
    quantity: Number(item.quantity),
    subtotal: Number(item.unitPrice) * Number(item.quantity),
    costSubtotal: Number(item.unitCost ?? 0) * Number(item.quantity),
    status: item.status || 'active',
  }))

const activeItems = (items: CanteenOrderItem[]) => items.filter((item) => !['voided', 'courtesy', 'waste'].includes(item.status || 'active'))

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
    visitIds: input.visitIds ?? (input.visitId ? [input.visitId] : []),
    groupEntryId: input.groupEntryId ?? '',
    eventId: input.eventId ?? '',
    childId: input.childId ?? '',
    childIds: input.childIds ?? (input.childId ? [input.childId] : []),
    childName: formatPersonName(input.childName ?? ''),
    childNames: (input.childNames ?? (input.childName ? [input.childName] : [])).map(formatPersonName),
    customerId: input.customerId ?? '',
    guardianId: input.guardianId ?? input.customerId ?? '',
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
  const audit = await requireAuthenticatedAudit()
  const normalizedNewItems = normalizeItems(newItems)
  await runTransaction(getDocumentRef('canteenOrders', order.id).firestore, async (transaction) => {
    const orderRef = getDocumentRef('canteenOrders', order.id)
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists()) throw new Error('La cuenta ya no existe.')
    const data = snapshot.data()
    if (data.status !== 'open' || data.voidRequestStatus === 'pending') throw new Error('La cuenta no admite nuevos consumos en este estado.')
    const mergedItems = normalizeItems(Array.isArray(data.items) ? (data.items as CanteenOrderItem[]) : [])

    normalizedNewItems.forEach((newItem) => {
      const existing = mergedItems.find((item) => item.productId === newItem.productId && (item.status || 'active') === 'active')
      if (existing) {
        existing.quantity += newItem.quantity
        existing.subtotal = existing.quantity * existing.unitPrice
        existing.costSubtotal = existing.quantity * Number(existing.unitCost ?? 0)
      } else {
        mergedItems.push(newItem)
      }
    })

    transaction.update(orderRef, {
      items: mergedItems,
      total: totalFromItems(activeItems(mergedItems)),
      costTotal: costFromItems(activeItems(mergedItems)),
      estimatedProfit: totalFromItems(activeItems(mergedItems)) - costFromItems(activeItems(mergedItems)),
      updatedAt: serverTimestamp(),
      updatedBy: audit.uid,
    })
    normalizedNewItems.forEach((item) => transaction.update(getDocumentRef('canteenProducts', item.productId), {
      stock: increment(-item.quantity),
      updatedAt: serverTimestamp(),
    }))
  })
}

export const updateCanteenOrderItems = async (order: CanteenOrder, items: CanteenOrderItem[]) => {
  await requireAdminAudit()

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
    visitIds: order.visitIds ?? (order.visitId ? [order.visitId] : []),
    groupEntryId: order.groupEntryId ?? '',
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

export const closeEmptyCanteenOrder = async (order: CanteenOrder, reason = '') => {
  const audit = await requireAuthenticatedAudit()
  await runTransaction(getDocumentRef('canteenOrders', order.id).firestore, async (transaction) => {
    const orderRef = getDocumentRef('canteenOrders', order.id)
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists()) throw new Error('La cuenta ya no existe.')
    const data = snapshot.data()
    if (data.status !== 'open' || Number(data.total ?? 0) !== 0 || (data.items ?? []).length > 0) {
      throw new Error('Solo se puede cerrar una cuenta vacía y sin pagos.')
    }
    transaction.update(orderRef, {
      status: 'closed_empty',
      closedAt: serverTimestamp(),
      closedBy: audit.uid,
      closedReason: normalizeWhitespace(reason),
      updatedAt: serverTimestamp(),
      updatedBy: audit.uid,
    })
  })
  void logActivity({ action: 'status_change', module: 'Cantina', description: `Cerró cuenta vacía ${order.accountName}`, entityId: order.id, entityName: order.accountName, metadata: { reason } })
}

export const cancelCanteenOrder = closeEmptyCanteenOrder

export const requestCanteenVoid = async (input: {
  order: CanteenOrder
  scope: 'line' | 'account'
  lineItemId?: string
  reason: string
  notes?: string
}) => {
  const audit = await requireAuthenticatedAudit()
  const requestId = `${input.order.id}-${input.scope}-${input.lineItemId || 'all'}`
  const requestRef = getDocumentRef('canteenVoidRequests', requestId)
  const orderRef = getDocumentRef('canteenOrders', input.order.id)
  let createdRequest: CanteenVoidRequest | null = null

  await runTransaction(orderRef.firestore, async (transaction) => {
    const [orderSnapshot, requestSnapshot] = await Promise.all([transaction.get(orderRef), transaction.get(requestRef)])
    if (!orderSnapshot.exists()) throw new Error('La cuenta ya no existe.')
    if (requestSnapshot.exists() && requestSnapshot.data().status === 'pending') throw new Error('Ya existe una solicitud pendiente para este consumo.')
    const data = orderSnapshot.data()
    if (data.status !== 'open') throw new Error('Solo se pueden solicitar anulaciones sobre cuentas abiertas.')
    const items = normalizeItems((data.items ?? []) as CanteenOrderItem[])
    const affectedItems = input.scope === 'line' ? items.filter((item) => item.lineItemId === input.lineItemId) : activeItems(items)
    if (!affectedItems.length) throw new Error('No se encontró el consumo solicitado.')
    const amount = totalFromItems(affectedItems)
    createdRequest = {
      id: requestId, accountId: input.order.id, scope: input.scope, lineItemId: input.lineItemId, amount, items: affectedItems, reason: normalizeWhitespace(input.reason), notes: normalizeWhitespace(input.notes ?? ''), requestedByUid: audit.uid, requestedByName: audit.name, requestedAt: new Date(), status: 'pending',
    }

    transaction.set(requestRef, {
      id: requestId,
      accountId: input.order.id,
      scope: input.scope,
      lineItemId: input.lineItemId ?? '',
      amount,
      items: affectedItems,
      reason: normalizeWhitespace(input.reason),
      notes: normalizeWhitespace(input.notes ?? ''),
      requestedByUid: audit.uid,
      requestedByName: audit.name,
      requestedAt: serverTimestamp(),
      status: 'pending',
    })
    transaction.update(orderRef, {
      pendingVoidRequestId: requestId,
      voidRequestStatus: 'pending',
      updatedAt: serverTimestamp(),
      updatedBy: audit.uid,
    })
  })
  void logActivity({ action: 'cancellation', module: 'Cantina', description: `Solicitó anulación de ${input.order.accountName}`, entityId: input.order.id, entityName: input.order.accountName, metadata: { reason: input.reason, scope: input.scope, lineItemId: input.lineItemId ?? '', requestedBy: audit.uid } })
  return createdRequest
}

export const reviewCanteenVoidRequest = async (request: CanteenVoidRequest, input: {
  decision: 'approved' | 'rejected'
  productsDelivered?: boolean
  deliveredDisposition?: 'courtesy' | 'waste' | 'unpaid_consumption'
  reviewNotes?: string
}) => {
  const audit = await requireAdminAudit()
  const requestRef = getDocumentRef('canteenVoidRequests', request.id)
  const orderRef = getDocumentRef('canteenOrders', request.accountId)

  await runTransaction(orderRef.firestore, async (transaction) => {
    const [requestSnapshot, orderSnapshot] = await Promise.all([transaction.get(requestRef), transaction.get(orderRef)])
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== 'pending') throw new Error('La solicitud ya fue procesada.')
    if (!orderSnapshot.exists()) throw new Error('La cuenta ya no existe.')
    const orderData = orderSnapshot.data()

    if (input.decision === 'rejected') {
      transaction.update(requestRef, { status: 'rejected', reviewedByUid: audit.uid, reviewedByName: audit.name, reviewedAt: serverTimestamp(), reviewNotes: normalizeWhitespace(input.reviewNotes ?? '') })
      transaction.update(orderRef, { pendingVoidRequestId: '', voidRequestStatus: '', updatedAt: serverTimestamp(), updatedBy: audit.uid })
      return
    }

    const items = normalizeItems((orderData.items ?? []) as CanteenOrderItem[])
    const affectedIds = new Set(request.items.map((item) => item.lineItemId || item.productId))
    const finalStatus: CanteenLineStatus = input.productsDelivered ? (input.deliveredDisposition === 'waste' ? 'waste' : 'courtesy') : 'voided'
    const nextItems = items.map((item) => affectedIds.has(item.lineItemId || item.productId) ? { ...item, status: finalStatus, voidedAt: new Date(), voidedBy: audit.uid, voidReason: request.reason } : item)
    const remainingItems = activeItems(nextItems)

    affectedIds.forEach((lineItemId) => {
      const item = items.find((candidate) => (candidate.lineItemId || candidate.productId) === lineItemId)
      if (!item) return
      if (!input.productsDelivered) transaction.update(getDocumentRef('canteenProducts', item.productId), { stock: increment(item.quantity), updatedAt: serverTimestamp() })
      const movementRef = doc(getCollectionRef('canteenInventoryMovements'))
      transaction.set(movementRef, {
        id: movementRef.id,
        type: input.productsDelivered ? input.deliveredDisposition || 'unpaid_consumption' : 'void_return',
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        accountId: request.accountId,
        requestId: request.id,
        reason: request.reason,
        createdAt: serverTimestamp(),
        createdBy: audit.uid,
        createdByName: audit.name,
      })
    })

    transaction.update(orderRef, {
      items: nextItems,
      total: totalFromItems(remainingItems),
      costTotal: costFromItems(remainingItems),
      estimatedProfit: totalFromItems(remainingItems) - costFromItems(remainingItems),
      status: request.scope === 'account' || remainingItems.length === 0 ? 'voided' : 'open',
      pendingVoidRequestId: '',
      voidRequestStatus: '',
      voidedAt: serverTimestamp(),
      voidedBy: audit.uid,
      updatedAt: serverTimestamp(),
      updatedBy: audit.uid,
    })
    transaction.update(requestRef, {
      status: 'approved', productsDelivered: input.productsDelivered === true, deliveredDisposition: input.deliveredDisposition ?? '', reviewedByUid: audit.uid, reviewedByName: audit.name, reviewedAt: serverTimestamp(), reviewNotes: normalizeWhitespace(input.reviewNotes ?? ''),
    })
  })
  void logActivity({ action: input.decision === 'approved' ? 'approval' : 'cancellation', module: 'Cantina', description: `${input.decision === 'approved' ? 'Aprobó' : 'Rechazó'} anulación de cuenta ${request.accountId}`, entityId: request.accountId, metadata: { requestId: request.id, productsDelivered: input.productsDelivered ?? null, disposition: input.deliveredDisposition ?? '', reason: request.reason } })
}

export const refundCanteenOrder = async (order: CanteenOrder, input: { reason: string; paymentMethod: string; reference?: string }) => {
  const audit = await requireAdminAudit()
  const paymentQuery = query(getCollectionRef('payments'), where('canteenOrderIds', 'array-contains', order.id))
  const payments = await getDocs(paymentQuery)
  const originalPayment = payments.docs.find((item) => Number(item.data().canteenAmountPaid ?? 0) > 0 && item.data().status !== 'refunded')
  if (!originalPayment) throw new Error('No se encontró el pago original de esta cuenta.')

  await runTransaction(getDocumentRef('canteenOrders', order.id).firestore, async (transaction) => {
    const orderRef = getDocumentRef('canteenOrders', order.id)
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists() || snapshot.data().status !== 'paid') throw new Error('La cuenta no admite reembolso.')
    const refundRef = doc(getCollectionRef('payments'))
    transaction.set(refundRef, {
      id: refundRef.id, source: 'canteen_refund', concepts: 'canteen', status: 'paid', totalPaid: -order.total, canteenAmountPaid: -order.total, parkAmountPaid: 0, canteenOrderId: order.id, canteenOrderIds: [order.id], originalPaymentId: originalPayment.id, paymentMethod: input.paymentMethod, refundReference: normalizeWhitespace(input.reference ?? ''), description: `Reembolso Cantina - ${order.accountName}`, refundReason: normalizeWhitespace(input.reason), paidAt: Timestamp.now(), createdAt: serverTimestamp(), createdBy: audit.uid, createdByName: audit.name,
    })
    transaction.update(orderRef, { status: 'refunded', paymentStatus: 'paid', refundedAt: serverTimestamp(), refundedBy: audit.uid, refundReason: normalizeWhitespace(input.reason), refundPaymentId: refundRef.id, updatedAt: serverTimestamp(), updatedBy: audit.uid })
  })
  void logActivity({ action: 'cancellation', module: 'Cantina', description: `Registró reembolso de ${order.accountName}`, entityId: order.id, entityName: order.accountName, metadata: { amount: order.total, reason: input.reason, method: input.paymentMethod, originalPaymentId: originalPayment.id } })
}

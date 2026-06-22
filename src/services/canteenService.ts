import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, firebaseConfig, storage } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { callSecureFunction } from './secureFunctions'
import { normalizeWhitespace } from '../utils/textFormat'
import type {
  CanteenOrder,
  CanteenOrderItem,
  CanteenVoidRequest,
  CreateCanteenOrderInput,
  PaymentMethod,
  UpsertCanteenProductInput,
} from '../types'

const itemReferences = (items: CanteenOrderItem[]) =>
  items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }))

const operationScope = (prefix: string, values: unknown[]) =>
  `${prefix}:${values.map((value) => String(value ?? '')).join(':')}`

export const upsertCanteenProduct = async (input: UpsertCanteenProductInput) => {
  const result = await callSecureFunction<{ productId: string }>(
    'upsertCanteenProductSecure',
    { ...input },
    operationScope('product', [input.id || 'new', input.name, input.price, input.stock]),
  )
  return result.productId
}

const maxProductImageSize = 5 * 1024 * 1024
const allowedProductImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export const uploadCanteenProductImage = async (file: File, productId = 'new') => {
  await ensureReceptionSession()
  const user = auth.currentUser
  if (!user) throw new Error('Necesitas iniciar sesion como administrador para subir imagenes.')
  if (!allowedProductImageTypes.has(file.type)) throw new Error('Selecciona una imagen PNG, JPG o WEBP.')
  if (file.size > maxProductImageSize) throw new Error('La imagen supera el limite de 5 MB.')

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const storagePath = `canteen-products/${safeProductId}/${Date.now()}-${safeName}`
  const storageRef = ref(storage, storagePath)
  try {
    await uploadBytes(storageRef, file, { contentType: file.type })
    return await getDownloadURL(storageRef)
  } catch (error) {
    console.error('[Cantina Storage] No se pudo guardar la imagen.', {
      bucket: firebaseConfig.storageBucket,
      path: storagePath,
      uid: user.uid,
      error,
    })
    const message = error instanceof Error ? error.message : ''
    if (message.includes('storage/unauthorized')) throw new Error('No tenes permiso para guardar la imagen del producto.')
    throw error
  }
}

export const setCanteenProductActive = async (productId: string, isActive: boolean) => {
  await callSecureFunction(
    'setCanteenProductActiveSecure',
    { productId, isActive },
    operationScope('product-active', [productId, isActive]),
  )
}

export const createCanteenOrder = async (input: CreateCanteenOrderInput) => {
  const result = await callSecureFunction<{ orderId: string }>(
    'createCanteenOrderSecure',
    {
      type: input.type,
      visitId: input.visitId ?? '',
      visitIds: input.visitIds ?? [],
      groupEntryId: input.groupEntryId ?? '',
      eventId: input.eventId ?? '',
      accountName: input.accountName,
      notes: input.notes ?? '',
      items: itemReferences(input.items),
      chargeNow: input.chargeNow,
      paymentMethod: input.paymentMethod ?? '',
    },
    operationScope('create-order', [input.type, input.groupEntryId, input.visitId, input.eventId, input.accountName, ...input.items.map((item) => `${item.productId}-${item.quantity}`)]),
  )
  return result.orderId
}

export const addItemsToCanteenOrder = async (order: CanteenOrder, newItems: CanteenOrderItem[]) => {
  await callSecureFunction(
    'confirmCanteenConsumption',
    { orderId: order.id, items: itemReferences(newItems) },
    operationScope('add-items', [order.id, ...newItems.map((item) => `${item.productId}-${item.quantity}`)]),
  )
}

export const updateCanteenOrderItems = async (order: CanteenOrder, items: CanteenOrderItem[]) => {
  void order
  void items
  throw new Error('Los consumos confirmados deben corregirse mediante una anulacion auditada.')
}

export const chargeCanteenOrder = async (
  order: CanteenOrder,
  paymentMethod: Exclude<PaymentMethod, ''>,
  cardType: 'debit' | 'credit' | '' = '',
) => {
  await callSecureFunction(
    'chargeCanteenOrder',
    { orderId: order.id, paymentMethod, cardType },
    operationScope('charge-order', [order.id, paymentMethod, cardType]),
  )
}

export const closeEmptyCanteenOrder = async (order: CanteenOrder, reason = '') => {
  await callSecureFunction(
    'closeEmptyCanteenOrderSecure',
    { orderId: order.id, reason: normalizeWhitespace(reason) },
    operationScope('close-empty-order', [order.id, reason]),
  )
}

export const cancelCanteenOrder = closeEmptyCanteenOrder

export const requestCanteenVoid = async (input: {
  order: CanteenOrder
  scope: 'line' | 'account'
  lineItemId?: string
  reason: string
  notes?: string
}) => {
  const result = await callSecureFunction<{ requestId: string; amount: number; status: 'pending' }>(
    'requestCanteenVoidSecure',
    {
      orderId: input.order.id,
      scope: input.scope,
      lineItemId: input.lineItemId ?? '',
      reason: input.reason,
      notes: input.notes ?? '',
    },
    operationScope('void-request', [input.order.id, input.scope, input.lineItemId, input.reason]),
  )
  return {
    id: result.requestId,
    accountId: input.order.id,
    scope: input.scope,
    lineItemId: input.lineItemId,
    amount: result.amount,
    items: [],
    reason: input.reason,
    notes: input.notes,
    requestedByUid: auth.currentUser?.uid ?? '',
    requestedByName: '',
    status: result.status,
  } satisfies CanteenVoidRequest
}

export const reviewCanteenVoidRequest = async (request: CanteenVoidRequest, input: {
  decision: 'approved' | 'rejected'
  productsDelivered?: boolean
  deliveredDisposition?: 'courtesy' | 'waste' | 'unpaid_consumption'
  reviewNotes?: string
}) => {
  await callSecureFunction(
    'reviewCanteenVoidSecure',
    { requestId: request.id, ...input },
    operationScope('void-review', [request.id, input.decision, input.productsDelivered, input.deliveredDisposition, input.reviewNotes]),
  )
}

export const refundCanteenOrder = async (
  order: CanteenOrder,
  input: { reason: string; paymentMethod: string; reference?: string },
) => {
  await callSecureFunction(
    'refundCanteenOrderSecure',
    { orderId: order.id, ...input },
    operationScope('refund-order', [order.id, input.reason, input.paymentMethod, input.reference]),
  )
}

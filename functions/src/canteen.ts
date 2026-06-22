import { randomUUID } from 'node:crypto'
import { Timestamp, type DocumentData, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  asRecord,
  asRecordArray,
  db,
  executeIdempotent,
  newDocumentId,
  nonNegativeMoney,
  optionalString,
  positiveMoney,
  positiveQuantity,
  requiredString,
  serverTimestamp,
  stringValue,
  validCardType,
  validPaymentMethod,
  writeActivity,
  type Actor,
  type UserRole,
} from './common'

const CANTEEN_ROLES: readonly UserRole[] = ['admin', 'socio', 'recepcion', 'cantina']
const INVENTORY_ROLES: readonly UserRole[] = ['admin', 'socio']
const ADMIN_ROLES: readonly UserRole[] = ['admin']
const categories = new Set(['Bebidas', 'Snacks', 'Comidas', 'Combos', 'Helados', 'Otros'])
const inactiveLineStates = new Set(['voided', 'courtesy', 'waste'])

interface ProductQuantity {
  productId: string
  quantity: number
}

interface TrustedLine {
  lineItemId: string
  productId: string
  productName: string
  category: string
  unitPrice: number
  unitCost: number
  quantity: number
  subtotal: number
  costSubtotal: number
  status: string
  pricingSource?: string
  confirmedAt?: unknown
  confirmedBy?: string
  [key: string]: unknown
}

interface OrderTotals {
  total: number
  costTotal: number
  estimatedProfit: number
  activeItems: TrustedLine[]
}

const parseProductQuantities = (value: unknown): ProductQuantity[] => {
  const aggregated = new Map<string, number>()
  for (const item of asRecordArray(value)) {
    const productId = requiredString(item.productId, 'El producto')
    const quantity = positiveQuantity(item.quantity)
    aggregated.set(productId, (aggregated.get(productId) ?? 0) + quantity)
  }
  return [...aggregated.entries()].map(([productId, quantity]) => ({ productId, quantity }))
}

const normalizeTrustedLine = (value: unknown, index: number): TrustedLine => {
  const item = asRecord(value)
  const productId = requiredString(item.productId, 'El producto de la linea')
  const quantity = positiveQuantity(item.quantity)
  const unitPrice = positiveMoney(item.unitPrice, 'El precio historico')
  const unitCost = nonNegativeMoney(item.unitCost ?? 0, 'El costo historico')
  const status = stringValue(item.status) || 'active'
  return {
    ...item,
    lineItemId: stringValue(item.lineItemId) || `${productId}-legacy-${index}`,
    productId,
    productName: requiredString(item.productName, 'El nombre historico del producto'),
    category: stringValue(item.category) || 'Otros',
    unitPrice,
    unitCost,
    quantity,
    subtotal: unitPrice * quantity,
    costSubtotal: unitCost * quantity,
    status,
  }
}

export const calculateTrustedOrderTotals = (data: DocumentData): OrderTotals => {
  const lines = Array.isArray(data.items) ? data.items.map(normalizeTrustedLine) : []
  const activeItems = lines.filter((line) => !inactiveLineStates.has(line.status))
  const total = activeItems.reduce((sum, line) => sum + line.subtotal, 0)
  const costTotal = activeItems.reduce((sum, line) => sum + line.costSubtotal, 0)
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(costTotal) || costTotal < 0) {
    throw new HttpsError('failed-precondition', 'La cuenta contiene importes historicos invalidos y requiere revision administrativa.')
  }
  return { total, costTotal, estimatedProfit: total - costTotal, activeItems }
}

const getProductSnapshots = async (
  transaction: Transaction,
  items: ProductQuantity[],
) => {
  const snapshots = await Promise.all(items.map((item) => transaction.get(db.collection('canteenProducts').doc(item.productId))))
  return items.map((item, index) => {
    const snapshot = snapshots[index]
    if (!snapshot.exists) throw new HttpsError('not-found', 'Uno de los productos ya no existe.')
    const data = snapshot.data() ?? {}
    if (data.isActive === false) throw new HttpsError('failed-precondition', `${stringValue(data.name) || 'El producto'} esta inactivo.`)
    const unitPrice = positiveMoney(data.price ?? data.salePrice, `El precio de ${stringValue(data.name) || 'producto'}`)
    const unitCost = nonNegativeMoney(data.unitCost ?? 0, `El costo de ${stringValue(data.name) || 'producto'}`)
    const stock = data.stock === null || data.stock === undefined ? null : nonNegativeMoney(data.stock, `El stock de ${stringValue(data.name) || 'producto'}`)
    if (stock !== null && stock < item.quantity) {
      throw new HttpsError('failed-precondition', `Stock insuficiente para ${stringValue(data.name) || 'el producto'}.`)
    }
    return {
      ref: snapshot.ref,
      productId: snapshot.id,
      productName: requiredString(data.name, 'El nombre del producto'),
      category: categories.has(stringValue(data.category)) ? stringValue(data.category) : 'Otros',
      unitPrice,
      unitCost,
      stock,
      quantity: item.quantity,
    }
  })
}

const createLines = (products: Awaited<ReturnType<typeof getProductSnapshots>>, actor: Actor): TrustedLine[] =>
  products.map((product) => ({
    lineItemId: `line-${randomUUID()}`,
    productId: product.productId,
    productName: product.productName,
    category: product.category,
    unitPrice: product.unitPrice,
    unitCost: product.unitCost,
    quantity: product.quantity,
    subtotal: product.unitPrice * product.quantity,
    costSubtotal: product.unitCost * product.quantity,
    status: 'active',
    pricingSource: 'server_catalog',
    confirmedAt: Timestamp.now(),
    confirmedBy: actor.uid,
  }))

const writeSaleStock = (
  transaction: Transaction,
  products: Awaited<ReturnType<typeof getProductSnapshots>>,
  actor: Actor,
  orderId: string,
) => {
  for (const product of products) {
    const stockAfter = product.stock === null ? null : product.stock - product.quantity
    if (product.stock !== null) {
      transaction.update(product.ref, {
        stock: stockAfter,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      })
    }
    const movementRef = db.collection('canteenInventoryMovements').doc()
    transaction.create(movementRef, {
      id: movementRef.id,
      type: 'sale',
      productId: product.productId,
      productName: product.productName,
      quantity: product.quantity,
      delta: -product.quantity,
      stockBefore: product.stock,
      stockAfter,
      inventoryTracked: product.stock !== null,
      accountId: orderId,
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
      createdByName: actor.name,
      source: 'secure_backend',
    })
  }
}

const buildPayment = (
  actor: Actor,
  orderId: string,
  order: DocumentData,
  total: number,
  paymentMethod: string,
  cardType: string,
) => ({
  id: newDocumentId('payments'),
  source: 'canteen',
  concepts: 'canteen',
  status: 'paid',
  totalPaid: total,
  canteenAmountPaid: total,
  parkAmountPaid: 0,
  eventAmountPaid: 0,
  canteenOrderId: orderId,
  canteenOrderIds: [orderId],
  visitId: stringValue(order.visitId),
  visitIds: Array.isArray(order.visitIds) ? order.visitIds.map(stringValue).filter(Boolean) : [],
  groupEntryId: stringValue(order.groupEntryId),
  eventId: stringValue(order.eventId),
  accountType: stringValue(order.type),
  paymentMethod,
  cardType,
  childName: stringValue(order.childName) || stringValue(order.accountName),
  customerName: stringValue(order.customerName),
  description: `Cantina - ${stringValue(order.accountName) || 'Cuenta'}`,
  paidAt: serverTimestamp(),
  createdAt: serverTimestamp(),
  createdBy: actor.uid,
  createdByName: actor.name,
  createdByRole: actor.role,
  sourceIntegrity: 'secure_backend',
})

const paymentRefFor = (payment: ReturnType<typeof buildPayment>) => db.collection('payments').doc(payment.id)

const resolveVisitIdentity = async (transaction: Transaction, input: Record<string, unknown>) => {
  const groupEntryId = stringValue(input.groupEntryId)
  if (groupEntryId) {
    const groupSnapshot = await transaction.get(db.collection('activeVisits').where('groupEntryId', '==', groupEntryId))
    const visits = groupSnapshot.docs.filter((snapshot) => snapshot.data().status === 'active')
    if (visits.length === 0) throw new HttpsError('not-found', 'No se encontraron visitas activas para este grupo.')
    const first = visits[0].data()
    return {
      visitId: visits[0].id,
      visitIds: visits.map((snapshot) => snapshot.id),
      groupEntryId,
      childId: stringValue(first.childId),
      childIds: visits.map((snapshot) => stringValue(snapshot.data().childId)).filter(Boolean),
      childName: visits.map((snapshot) => stringValue(snapshot.data().childName)).filter(Boolean).join(' y '),
      childNames: visits.map((snapshot) => stringValue(snapshot.data().childName)).filter(Boolean),
      customerId: stringValue(first.customerId),
      guardianId: stringValue(first.guardianId) || stringValue(first.customerId),
      accountName: `${stringValue(first.customerName) || 'Responsable'} - ${visits.map((snapshot) => stringValue(snapshot.data().childName)).filter(Boolean).join(' y ')}`,
      customerName: stringValue(first.customerName),
      customerPhone: stringValue(first.customerPhone),
    }
  }

  const visitId = requiredString(input.visitId, 'La visita')
  const visitSnapshot = await transaction.get(db.collection('activeVisits').doc(visitId))
  if (!visitSnapshot.exists || visitSnapshot.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'La visita ya no esta activa.')
  }
  const visit = visitSnapshot.data() ?? {}
  return {
    visitId,
    visitIds: [visitId],
    groupEntryId: '',
    childId: stringValue(visit.childId),
    childIds: [stringValue(visit.childId)].filter(Boolean),
    childName: stringValue(visit.childName),
    childNames: [stringValue(visit.childName)].filter(Boolean),
    customerId: stringValue(visit.customerId),
    guardianId: stringValue(visit.guardianId) || stringValue(visit.customerId),
    accountName: stringValue(visit.childName),
    customerName: stringValue(visit.customerName),
    customerPhone: stringValue(visit.customerPhone),
  }
}

const findExistingOpenOrder = async (
  transaction: Transaction,
  type: string,
  identity: Record<string, unknown>,
) => {
  let query
  if (type === 'visit' && stringValue(identity.groupEntryId)) {
    query = db.collection('canteenOrders').where('groupEntryId', '==', identity.groupEntryId)
  } else if (type === 'visit') {
    query = db.collection('canteenOrders').where('visitId', '==', identity.visitId)
  } else if (type === 'event') {
    query = db.collection('canteenOrders').where('eventId', '==', identity.eventId)
  } else {
    return null
  }
  const snapshot = await transaction.get(query)
  return snapshot.docs.find((document) => document.data().status === 'open') ?? null
}

export const createCanteenOrderSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const type = stringValue(input.type)
  if (!['visit', 'event', 'free'].includes(type)) throw new HttpsError('invalid-argument', 'El tipo de cuenta no es valido.')
  const products = parseProductQuantities(input.items)
  const chargeNow = input.chargeNow === true
  const paymentMethod = chargeNow ? validPaymentMethod(input.paymentMethod) : ''
  const cardType = chargeNow ? validCardType(paymentMethod, input.cardType) : ''
  if (chargeNow && products.length === 0) throw new HttpsError('failed-precondition', 'No se puede cobrar una cuenta vacia.')
  const orderId = newDocumentId('canteenOrders')

  return executeIdempotent({
    uid,
    roles: CANTEEN_ROLES,
    operationType: 'create_canteen_order',
    entityId: type === 'visit' ? stringValue(input.groupEntryId) || stringValue(input.visitId) || orderId : stringValue(input.eventId) || orderId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { type, relation: { groupEntryId: input.groupEntryId, visitId: input.visitId, eventId: input.eventId }, products, chargeNow, paymentMethod, cardType },
    handler: async (transaction, actor) => {
      let identity: Record<string, unknown>
      if (type === 'visit') {
        identity = await resolveVisitIdentity(transaction, input)
      } else if (type === 'event') {
        const eventId = requiredString(input.eventId, 'El evento')
        const eventSnapshot = await transaction.get(db.collection('events').doc(eventId))
        if (!eventSnapshot.exists || eventSnapshot.data()?.status === 'cancelled') throw new HttpsError('not-found', 'El evento no esta disponible.')
        const event = eventSnapshot.data() ?? {}
        identity = {
          eventId,
          accountName: stringValue(event.title) || 'Evento',
          customerName: stringValue(event.customerName),
          customerPhone: stringValue(event.customerPhone),
        }
      } else {
        const accountName = requiredString(input.accountName, 'El nombre de la cuenta')
        identity = { accountName, customerName: accountName, customerPhone: '' }
      }

      const existingOrder = await findExistingOpenOrder(transaction, type, identity)
      const targetRef = existingOrder?.ref ?? db.collection('canteenOrders').doc(orderId)
      const existingData = existingOrder?.data() ?? null
      if (existingData?.voidRequestStatus === 'pending') throw new HttpsError('failed-precondition', 'La cuenta tiene una anulacion pendiente.')
      const existingLines = existingData ? (Array.isArray(existingData.items) ? existingData.items.map(normalizeTrustedLine) : []) : []
      const productSnapshots = await getProductSnapshots(transaction, products)
      const newLines = createLines(productSnapshots, actor)
      const allLines = [...existingLines, ...newLines]
      const totals = calculateTrustedOrderTotals({ items: allLines })

      const orderData: Record<string, unknown> = {
        ...(existingData ?? {}),
        id: targetRef.id,
        type,
        ...identity,
        items: allLines,
        total: totals.total,
        costTotal: totals.costTotal,
        estimatedProfit: totals.estimatedProfit,
        status: chargeNow ? 'paid' : 'open',
        paymentStatus: chargeNow ? 'paid' : 'pending',
        paymentMethod,
        cardType,
        notes: optionalString(input.notes),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedByName: actor.name,
        sourceIntegrity: 'secure_backend',
        ...(existingData ? {} : {
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
          createdByName: actor.name,
        }),
        ...(chargeNow ? { paidAt: serverTimestamp() } : {}),
      }
      if (existingData) transaction.update(targetRef, orderData)
      else transaction.create(targetRef, orderData)
      writeSaleStock(transaction, productSnapshots, actor, targetRef.id)

      let paymentId = ''
      if (chargeNow) {
        const payment = buildPayment(actor, targetRef.id, orderData, totals.total, paymentMethod, cardType)
        paymentId = payment.id
        transaction.create(paymentRefFor(payment), payment)
      }
      writeActivity(transaction, actor, {
        action: chargeNow ? 'creation' : 'create',
        module: 'Cantina',
        description: chargeNow ? `Creo y cobro la cuenta ${stringValue(orderData.accountName)}` : `Abrio la cuenta ${stringValue(orderData.accountName)}`,
        entityId: targetRef.id,
        entityName: stringValue(orderData.accountName),
        metadata: { total: totals.total, productCount: newLines.length, paymentId },
      })
      return { orderId: targetRef.id, paymentId, total: totals.total, reusedOpenOrder: Boolean(existingOrder) }
    },
  })
}

export const confirmCanteenConsumptionSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const orderId = requiredString(input.orderId, 'La cuenta')
  const products = parseProductQuantities(input.items)
  if (products.length === 0) throw new HttpsError('invalid-argument', 'Agrega al menos un producto.')

  return executeIdempotent({
    uid,
    roles: CANTEEN_ROLES,
    operationType: 'confirm_canteen_consumption',
    entityId: orderId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { products },
    handler: async (transaction, actor) => {
      const orderRef = db.collection('canteenOrders').doc(orderId)
      const orderSnapshot = await transaction.get(orderRef)
      if (!orderSnapshot.exists) throw new HttpsError('not-found', 'La cuenta ya no existe.')
      const order = orderSnapshot.data() ?? {}
      if (order.status !== 'open' || order.voidRequestStatus === 'pending') {
        throw new HttpsError('failed-precondition', 'La cuenta no admite nuevos consumos en este estado.')
      }
      const productSnapshots = await getProductSnapshots(transaction, products)
      const currentLines = Array.isArray(order.items) ? order.items.map(normalizeTrustedLine) : []
      const newLines = createLines(productSnapshots, actor)
      const lines = [...currentLines, ...newLines]
      const totals = calculateTrustedOrderTotals({ items: lines })
      transaction.update(orderRef, {
        items: lines,
        total: totals.total,
        costTotal: totals.costTotal,
        estimatedProfit: totals.estimatedProfit,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
      })
      writeSaleStock(transaction, productSnapshots, actor, orderId)
      writeActivity(transaction, actor, {
        action: 'update',
        module: 'Cantina',
        description: `Confirmo consumos en ${stringValue(order.accountName) || orderId}`,
        entityId: orderId,
        entityName: stringValue(order.accountName),
        metadata: { total: totals.total, products: products.map((item) => ({ ...item })) },
      })
      return { orderId, total: totals.total, addedLines: newLines.length }
    },
  })
}

export const chargeCanteenOrderSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const orderId = requiredString(input.orderId, 'La cuenta')
  const paymentMethod = validPaymentMethod(input.paymentMethod)
  const cardType = validCardType(paymentMethod, input.cardType)

  return executeIdempotent({
    uid,
    roles: CANTEEN_ROLES,
    operationType: 'charge_canteen_order',
    entityId: orderId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { paymentMethod, cardType, reference: optionalString(input.reference) },
    handler: async (transaction, actor) => {
      const orderRef = db.collection('canteenOrders').doc(orderId)
      const orderSnapshot = await transaction.get(orderRef)
      if (!orderSnapshot.exists) throw new HttpsError('not-found', 'La cuenta no existe.')
      const order = orderSnapshot.data() ?? {}
      if (order.status !== 'open' || order.paymentStatus === 'paid') {
        throw new HttpsError('failed-precondition', 'La cuenta ya fue cobrada o no esta abierta.')
      }
      const totals = calculateTrustedOrderTotals(order)
      if (totals.total <= 0) throw new HttpsError('failed-precondition', 'No se puede cobrar una cuenta vacia.')
      const productRefs = [...new Set(totals.activeItems.map((item) => item.productId))].map((productId) => db.collection('canteenProducts').doc(productId))
      const productSnapshots = await Promise.all(productRefs.map((ref) => transaction.get(ref)))
      if (productSnapshots.some((snapshot) => !snapshot.exists)) {
        throw new HttpsError('failed-precondition', 'La cuenta contiene un producto historico inexistente y requiere revision.')
      }
      const payment = buildPayment(actor, orderId, order, totals.total, paymentMethod, cardType)
      transaction.create(paymentRefFor(payment), payment)
      transaction.update(orderRef, {
        total: totals.total,
        costTotal: totals.costTotal,
        estimatedProfit: totals.estimatedProfit,
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod,
        cardType,
        paidAt: serverTimestamp(),
        paymentId: payment.id,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
      })
      writeActivity(transaction, actor, {
        action: 'status_change',
        module: 'Cantina',
        description: `Cobro la cuenta ${stringValue(order.accountName) || orderId}`,
        entityId: orderId,
        entityName: stringValue(order.accountName),
        metadata: { amount: totals.total, paymentId: payment.id, paymentMethod },
      })
      return { orderId, paymentId: payment.id, total: totals.total }
    },
  })
}

export const closeEmptyCanteenOrderSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const orderId = requiredString(input.orderId, 'La cuenta')
  const reason = optionalString(input.reason)
  return executeIdempotent({
    uid,
    roles: CANTEEN_ROLES,
    operationType: 'close_empty_canteen_order',
    entityId: orderId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { reason },
    handler: async (transaction, actor) => {
      const orderRef = db.collection('canteenOrders').doc(orderId)
      const [orderSnapshot, paymentSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(db.collection('payments').where('canteenOrderIds', 'array-contains', orderId)),
      ])
      if (!orderSnapshot.exists) throw new HttpsError('not-found', 'La cuenta no existe.')
      const order = orderSnapshot.data() ?? {}
      const totals = calculateTrustedOrderTotals(order)
      if (order.status !== 'open' || totals.activeItems.length > 0 || totals.total !== 0 || !paymentSnapshot.empty) {
        throw new HttpsError('failed-precondition', 'Solo se puede cerrar una cuenta vacia y sin pagos.')
      }
      transaction.update(orderRef, {
        status: 'closed_empty',
        closedAt: serverTimestamp(),
        closedBy: actor.uid,
        closedReason: reason,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      })
      writeActivity(transaction, actor, {
        action: 'status_change', module: 'Cantina', description: `Cerro cuenta vacia ${stringValue(order.accountName) || orderId}`,
        entityId: orderId, entityName: stringValue(order.accountName), metadata: { reason },
      })
      return { orderId, status: 'closed_empty' }
    },
  })
}

export const requestCanteenVoidSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const orderId = requiredString(input.orderId, 'La cuenta')
  const scope = stringValue(input.scope)
  if (!['line', 'account'].includes(scope)) throw new HttpsError('invalid-argument', 'El alcance de anulacion no es valido.')
  const lineItemId = scope === 'line' ? requiredString(input.lineItemId, 'La linea') : ''
  const reason = requiredString(input.reason, 'El motivo')
  const notes = optionalString(input.notes)
  const requestId = `${orderId}-${scope}-${lineItemId || 'all'}`

  return executeIdempotent({
    uid,
    roles: CANTEEN_ROLES,
    operationType: 'request_canteen_void',
    entityId: requestId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { orderId, scope, lineItemId, reason, notes },
    handler: async (transaction, actor) => {
      const orderRef = db.collection('canteenOrders').doc(orderId)
      const requestRef = db.collection('canteenVoidRequests').doc(requestId)
      const [orderSnapshot, requestSnapshot] = await Promise.all([transaction.get(orderRef), transaction.get(requestRef)])
      if (!orderSnapshot.exists) throw new HttpsError('not-found', 'La cuenta no existe.')
      if (requestSnapshot.exists && requestSnapshot.data()?.status === 'pending') {
        throw new HttpsError('already-exists', 'Ya existe una solicitud pendiente para este consumo.')
      }
      const order = orderSnapshot.data() ?? {}
      if (order.status !== 'open') throw new HttpsError('failed-precondition', 'Solo se pueden solicitar anulaciones sobre cuentas abiertas.')
      const totals = calculateTrustedOrderTotals(order)
      const affectedItems = scope === 'line' ? totals.activeItems.filter((item) => item.lineItemId === lineItemId) : totals.activeItems
      if (affectedItems.length === 0) throw new HttpsError('not-found', 'No se encontro el consumo solicitado.')
      const amount = affectedItems.reduce((sum, item) => sum + item.subtotal, 0)
      transaction.set(requestRef, {
        id: requestId,
        accountId: orderId,
        scope,
        lineItemId,
        amount,
        items: affectedItems,
        reason,
        notes,
        requestedByUid: actor.uid,
        requestedByName: actor.name,
        requestedAt: serverTimestamp(),
        status: 'pending',
        sourceIntegrity: 'secure_backend',
      })
      transaction.update(orderRef, {
        pendingVoidRequestId: requestId,
        voidRequestStatus: 'pending',
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      })
      writeActivity(transaction, actor, {
        action: 'cancellation', module: 'Cantina', description: `Solicito anulacion de ${stringValue(order.accountName) || orderId}`,
        entityId: orderId, entityName: stringValue(order.accountName), metadata: { requestId, scope, lineItemId, reason, amount },
      })
      return { requestId, orderId, amount, status: 'pending' }
    },
  })
}

export const reviewCanteenVoidSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const requestId = requiredString(input.requestId, 'La solicitud')
  const decision = stringValue(input.decision)
  if (!['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'La decision no es valida.')
  const productsDelivered = input.productsDelivered === true
  const disposition = stringValue(input.deliveredDisposition) || 'unpaid_consumption'
  if (productsDelivered && !['courtesy', 'waste', 'unpaid_consumption'].includes(disposition)) {
    throw new HttpsError('invalid-argument', 'El destino de los productos no es valido.')
  }
  const reviewNotes = optionalString(input.reviewNotes)

  return executeIdempotent({
    uid,
    roles: ADMIN_ROLES,
    operationType: 'review_canteen_void',
    entityId: requestId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { decision, productsDelivered, disposition, reviewNotes },
    handler: async (transaction, actor) => {
      const requestRef = db.collection('canteenVoidRequests').doc(requestId)
      const requestSnapshot = await transaction.get(requestRef)
      if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'La solicitud ya fue procesada o no existe.')
      }
      const request = requestSnapshot.data() ?? {}
      const orderId = requiredString(request.accountId, 'La cuenta de la solicitud')
      const orderRef = db.collection('canteenOrders').doc(orderId)
      const orderSnapshot = await transaction.get(orderRef)
      if (!orderSnapshot.exists) throw new HttpsError('not-found', 'La cuenta no existe.')
      const order = orderSnapshot.data() ?? {}

      if (decision === 'rejected') {
        transaction.update(requestRef, { status: 'rejected', reviewedByUid: actor.uid, reviewedByName: actor.name, reviewedAt: serverTimestamp(), reviewNotes })
        transaction.update(orderRef, { pendingVoidRequestId: '', voidRequestStatus: '', updatedAt: serverTimestamp(), updatedBy: actor.uid })
        writeActivity(transaction, actor, {
          action: 'cancellation', module: 'Cantina', description: `Rechazo anulacion de ${stringValue(order.accountName) || orderId}`,
          entityId: orderId, entityName: stringValue(order.accountName), metadata: { requestId, reviewNotes },
        })
        return { requestId, orderId, status: 'rejected' }
      }

      const lines = Array.isArray(order.items) ? order.items.map(normalizeTrustedLine) : []
      const requestedIds = new Set(asRecordArray(request.items).map((item, index) => normalizeTrustedLine(item, index).lineItemId))
      const affectedLines = lines.filter((line) => requestedIds.has(line.lineItemId) && !inactiveLineStates.has(line.status))
      if (affectedLines.length === 0) throw new HttpsError('failed-precondition', 'Los consumos solicitados ya no estan activos.')
      const productSnapshots = await Promise.all(affectedLines.map((line) => transaction.get(db.collection('canteenProducts').doc(line.productId))))
      if (productSnapshots.some((snapshot) => !snapshot.exists)) throw new HttpsError('failed-precondition', 'No se puede reconstruir el stock de un producto inexistente.')

      const finalStatus = productsDelivered ? (disposition === 'waste' ? 'waste' : 'courtesy') : 'voided'
      const nextLines = lines.map((line) => requestedIds.has(line.lineItemId) ? {
        ...line,
        status: finalStatus,
        voidedAt: Timestamp.now(),
        voidedBy: actor.uid,
        voidReason: stringValue(request.reason),
      } : line)
      const nextTotals = calculateTrustedOrderTotals({ items: nextLines })

      affectedLines.forEach((line, index) => {
        const productSnapshot = productSnapshots[index]
        const product = productSnapshot.data() ?? {}
        const stockBefore = product.stock === null || product.stock === undefined ? null : nonNegativeMoney(product.stock, 'El stock actual')
        const stockAfter = !productsDelivered && stockBefore !== null ? stockBefore + line.quantity : stockBefore
        if (!productsDelivered && stockBefore !== null) {
          transaction.update(productSnapshot.ref, { stock: stockAfter, updatedAt: serverTimestamp(), updatedBy: actor.uid })
        }
        const movementRef = db.collection('canteenInventoryMovements').doc()
        transaction.create(movementRef, {
          id: movementRef.id,
          type: productsDelivered ? disposition : 'void_return',
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          delta: productsDelivered ? 0 : line.quantity,
          stockBefore,
          stockAfter,
          inventoryTracked: stockBefore !== null,
          accountId: orderId,
          requestId,
          reason: stringValue(request.reason),
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
          createdByName: actor.name,
          source: 'secure_backend',
        })
      })

      transaction.update(orderRef, {
        items: nextLines,
        total: nextTotals.total,
        costTotal: nextTotals.costTotal,
        estimatedProfit: nextTotals.estimatedProfit,
        status: stringValue(request.scope) === 'account' || nextTotals.activeItems.length === 0 ? 'voided' : 'open',
        pendingVoidRequestId: '',
        voidRequestStatus: '',
        voidedAt: serverTimestamp(),
        voidedBy: actor.uid,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
      })
      transaction.update(requestRef, {
        status: 'approved', productsDelivered, deliveredDisposition: productsDelivered ? disposition : '',
        reviewedByUid: actor.uid, reviewedByName: actor.name, reviewedAt: serverTimestamp(), reviewNotes,
      })
      writeActivity(transaction, actor, {
        action: 'approval', module: 'Cantina', description: `Aprobo anulacion de ${stringValue(order.accountName) || orderId}`,
        entityId: orderId, entityName: stringValue(order.accountName),
        metadata: { requestId, amount: request.amount ?? 0, productsDelivered, disposition: productsDelivered ? disposition : 'void_return' },
      })
      return { requestId, orderId, status: 'approved', productsDelivered, total: nextTotals.total }
    },
  })
}

export const refundCanteenOrderSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const orderId = requiredString(input.orderId, 'La cuenta')
  const reason = requiredString(input.reason, 'El motivo')
  const paymentMethod = validPaymentMethod(input.paymentMethod)
  const reference = optionalString(input.reference)
  return executeIdempotent({
    uid,
    roles: ADMIN_ROLES,
    operationType: 'refund_canteen_order',
    entityId: orderId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { reason, paymentMethod, reference },
    handler: async (transaction, actor) => {
      const orderRef = db.collection('canteenOrders').doc(orderId)
      const [orderSnapshot, paymentSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(db.collection('payments').where('canteenOrderIds', 'array-contains', orderId)),
      ])
      if (!orderSnapshot.exists || orderSnapshot.data()?.status !== 'paid') throw new HttpsError('failed-precondition', 'La cuenta no admite reembolso.')
      const order = orderSnapshot.data() ?? {}
      const original = paymentSnapshot.docs.find((snapshot) => {
        const payment = snapshot.data()
        return Number(payment.canteenAmountPaid ?? 0) > 0 && !['refunded', 'voided', 'cancelled'].includes(stringValue(payment.status))
      })
      const existingRefund = paymentSnapshot.docs.find((snapshot) => Number(snapshot.data().canteenAmountPaid ?? 0) < 0 || snapshot.data().source === 'canteen_refund')
      if (!original) throw new HttpsError('failed-precondition', 'No se encontro el pago original de la cuenta.')
      if (existingRefund) throw new HttpsError('failed-precondition', 'La cuenta ya tiene un reembolso registrado.')
      const originalAmount = positiveMoney(original.data().canteenAmountPaid ?? original.data().totalPaid, 'El monto original')
      const refundRef = db.collection('payments').doc()
      transaction.create(refundRef, {
        id: refundRef.id,
        source: 'canteen_refund',
        concepts: 'canteen',
        status: 'paid',
        totalPaid: -originalAmount,
        canteenAmountPaid: -originalAmount,
        parkAmountPaid: 0,
        eventAmountPaid: 0,
        canteenOrderId: orderId,
        canteenOrderIds: [orderId],
        originalPaymentId: original.id,
        paymentMethod,
        refundReference: reference,
        description: `Reembolso Cantina - ${stringValue(order.accountName) || 'Cuenta'}`,
        refundReason: reason,
        paidAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
        createdByName: actor.name,
        createdByRole: actor.role,
        sourceIntegrity: 'secure_backend',
      })
      transaction.update(orderRef, {
        status: 'refunded', paymentStatus: 'paid', refundedAt: serverTimestamp(), refundedBy: actor.uid,
        refundReason: reason, refundPaymentId: refundRef.id, updatedAt: serverTimestamp(), updatedBy: actor.uid,
      })
      writeActivity(transaction, actor, {
        action: 'cancellation', module: 'Cantina', description: `Registro reembolso de ${stringValue(order.accountName) || orderId}`,
        entityId: orderId, entityName: stringValue(order.accountName), metadata: { amount: originalAmount, reason, paymentMethod, originalPaymentId: original.id, refundPaymentId: refundRef.id },
      })
      return { orderId, paymentId: refundRef.id, amount: originalAmount, status: 'refunded' }
    },
  })
}

export const upsertCanteenProductSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const requestedId = stringValue(input.id)
  const productId = requestedId || newDocumentId('canteenProducts')
  const name = requiredString(input.name, 'El nombre del producto')
  const category = stringValue(input.category)
  if (!categories.has(category)) throw new HttpsError('invalid-argument', 'La categoria no es valida.')
  const price = positiveMoney(input.price, 'El precio')
  const unitCost = input.unitCost === null || input.unitCost === undefined ? null : nonNegativeMoney(input.unitCost, 'El costo')
  const requestedStock = input.stock === null || input.stock === undefined ? null : nonNegativeMoney(input.stock, 'El stock')
  const minStock = input.minStock === null || input.minStock === undefined ? null : nonNegativeMoney(input.minStock, 'El stock minimo')
  const isActive = input.isActive !== false

  return executeIdempotent({
    uid,
    roles: INVENTORY_ROLES,
    operationType: 'upsert_canteen_product',
    entityId: productId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { productId, name, category, price, unitCost, requestedStock, minStock, isActive, imageUrl: input.imageUrl, imageFit: input.imageFit },
    handler: async (transaction, actor) => {
      const productRef = db.collection('canteenProducts').doc(productId)
      const productSnapshot = await transaction.get(productRef)
      const previous = productSnapshot.data() ?? {}
      const previousStock = productSnapshot.exists && previous.stock !== null && previous.stock !== undefined
        ? nonNegativeMoney(previous.stock, 'El stock anterior')
        : null
      const nextStock = requestedStock
      const productData = {
        id: productId,
        name,
        category,
        price,
        salePrice: price,
        unitCost,
        stock: nextStock,
        minStock,
        isActive,
        imageUrl: optionalString(input.imageUrl, 2000),
        imageFit: {
          scale: Number(asRecord(input.imageFit).scale) || 1,
          x: Number(asRecord(input.imageFit).x) || 0,
          y: Number(asRecord(input.imageFit).y) || 0,
        },
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        sourceIntegrity: 'secure_backend',
        ...(productSnapshot.exists ? {} : { createdAt: serverTimestamp(), createdBy: actor.uid }),
      }
      if (productSnapshot.exists) transaction.update(productRef, productData)
      else transaction.create(productRef, productData)

      if (previousStock !== nextStock) {
        const movementRef = db.collection('canteenInventoryMovements').doc()
        const delta = (nextStock ?? 0) - (previousStock ?? 0)
        transaction.create(movementRef, {
          id: movementRef.id,
          type: productSnapshot.exists ? 'manual_adjustment' : 'initial_stock',
          productId,
          productName: name,
          quantity: Math.abs(delta),
          delta,
          stockBefore: previousStock,
          stockAfter: nextStock,
          inventoryTracked: nextStock !== null,
          reason: productSnapshot.exists ? 'Edicion administrativa de producto' : 'Stock inicial',
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
          createdByName: actor.name,
          source: 'secure_backend',
        })
      }
      writeActivity(transaction, actor, {
        action: productSnapshot.exists ? 'update' : 'create', module: 'Cantina',
        description: productSnapshot.exists ? `Actualizo producto ${name}` : `Creo producto ${name}`,
        entityId: productId, entityName: name, metadata: { price, previousStock, nextStock },
      })
      return { productId, stock: nextStock, price }
    },
  })
}

export const setCanteenProductActiveSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const productId = requiredString(input.productId, 'El producto')
  const isActive = input.isActive === true
  return executeIdempotent({
    uid,
    roles: INVENTORY_ROLES,
    operationType: 'set_canteen_product_active',
    entityId: productId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { isActive },
    handler: async (transaction, actor) => {
      const productRef = db.collection('canteenProducts').doc(productId)
      const snapshot = await transaction.get(productRef)
      if (!snapshot.exists) throw new HttpsError('not-found', 'El producto no existe.')
      transaction.update(productRef, { isActive, updatedAt: serverTimestamp(), updatedBy: actor.uid })
      writeActivity(transaction, actor, {
        action: 'status_change', module: 'Cantina', description: `${isActive ? 'Activo' : 'Desactivo'} producto ${stringValue(snapshot.data()?.name) || productId}`,
        entityId: productId, entityName: stringValue(snapshot.data()?.name), metadata: { isActive },
      })
      return { productId, isActive }
    },
  })
}

export const adjustCanteenStockSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asRecord(rawInput)
  const productId = requiredString(input.productId, 'El producto')
  const quantity = positiveQuantity(input.quantity)
  const direction = stringValue(input.direction)
  if (!['increase', 'decrease'].includes(direction)) throw new HttpsError('invalid-argument', 'El tipo de ajuste no es valido.')
  const reason = requiredString(input.reason, 'El motivo')
  return executeIdempotent({
    uid,
    roles: INVENTORY_ROLES,
    operationType: 'adjust_canteen_stock',
    entityId: productId,
    idempotencyKey: input.idempotencyKey,
    fingerprint: { quantity, direction, reason },
    handler: async (transaction, actor) => {
      const productRef = db.collection('canteenProducts').doc(productId)
      const snapshot = await transaction.get(productRef)
      if (!snapshot.exists) throw new HttpsError('not-found', 'El producto no existe.')
      const product = snapshot.data() ?? {}
      const stockBefore = nonNegativeMoney(product.stock, 'El stock actual')
      const delta = direction === 'increase' ? quantity : -quantity
      const stockAfter = stockBefore + delta
      if (stockAfter < 0) throw new HttpsError('failed-precondition', 'El ajuste dejaria stock negativo.')
      const movementRef = db.collection('canteenInventoryMovements').doc()
      transaction.update(productRef, { stock: stockAfter, updatedAt: serverTimestamp(), updatedBy: actor.uid })
      transaction.create(movementRef, {
        id: movementRef.id, type: direction === 'increase' ? 'stock_entry' : 'manual_adjustment', productId,
        productName: stringValue(product.name), quantity, delta, stockBefore, stockAfter, reason,
        createdAt: serverTimestamp(), createdBy: actor.uid, createdByName: actor.name, source: 'secure_backend',
      })
      writeActivity(transaction, actor, {
        action: 'update', module: 'Cantina', description: `Ajusto stock de ${stringValue(product.name) || productId}`,
        entityId: productId, entityName: stringValue(product.name), metadata: { quantity, delta, stockBefore, stockAfter, reason },
      })
      return { productId, stockBefore, stockAfter, movementId: movementRef.id }
    },
  })
}

export const rejectDirectLineReplacement = async () => {
  throw new HttpsError('failed-precondition', 'Los consumos confirmados deben corregirse mediante una anulacion auditada.')
}

export type CanteenSecureResult = Awaited<ReturnType<typeof chargeCanteenOrderSecure>>
export type CanteenOrderReference = DocumentReference

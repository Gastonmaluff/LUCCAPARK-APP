import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Plus,
  Receipt,
  Trash2,
  Users,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { BrandLogo } from '../BrandLogo'
import { ProductManager } from './ProductManager'
import { ProductImageView } from './ProductImageView'
import { CanteenCheckoutModal } from './CanteenCheckoutModal'
import { ConsolidatedGroupCheckoutModal } from '../reception/ConsolidatedGroupCheckoutModal'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCanteenOrders, useCanteenProducts, useCanteenVoidRequests, usePaidCanteenOrdersForDate } from '../../hooks/useCanteen'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useEventDayContext } from '../../hooks/useEventDayContext'
import {
  addItemsToCanteenOrder,
  closeEmptyCanteenOrder,
  createCanteenOrder,
  refundCanteenOrder,
  requestCanteenVoid,
  reviewCanteenVoidRequest,
} from '../../services/canteenService'
import { getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import { formatPersonName } from '../../utils/textFormat'
import { getVisitBillingSummary, getVisitGroupBillingSummary } from '../../utils/visitBilling'
import { findOpenGroupOrder, formatGroupChildNames, getOrdersForVisit, getOrdersForVisitGroup, groupActiveVisits } from '../../utils/visitGroups'
import { formatVisitStartTime, getVisitTimeStatus } from '../../utils/visitTime'
import { StatusPill } from '../StatusPill'
import type { ActiveVisit, CanteenOrder, CanteenOrderItem, CanteenProduct, CanteenVoidRequest, LuccaEvent, PaymentMethod } from '../../types'

type CanteenOperationsProps = {
  standalone?: boolean
}

const paymentLabel: Record<Exclude<PaymentMethod, ''>, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
}

const orderTypeLabel: Record<CanteenOrder['type'], string> = {
  visit: 'Visita',
  event: 'Evento',
  free: 'Otro',
}

const itemFromProduct = (product: CanteenProduct): CanteenOrderItem => ({
  productId: product.id,
  productName: product.name,
  category: product.category,
  unitPrice: product.salePrice ?? product.price,
  unitCost: product.unitCost ?? null,
  quantity: 1,
  subtotal: product.salePrice ?? product.price,
  costSubtotal: product.unitCost ?? 0,
})

const orderSubtitle = (order: CanteenOrder) => {
  if (order.type === 'visit') {
    return order.customerName ? `${order.customerName} · Registro de recepcion` : 'Registro de recepcion'
  }
  if (order.type === 'event') {
    return order.customerName ? `${order.customerName} · Evento activo` : 'Evento activo'
  }
  return order.customerName || 'Cuenta manual'
}

const accountSubtitle = (order: CanteenOrder) => {
  if (order.customerName) {
    return `Responsable: ${order.customerName}`
  }
  if (order.type === 'visit') {
    return 'Registro de recepcion'
  }
  if (order.type === 'event') {
    return 'Evento activo'
  }
  return 'Cuenta manual'
}

const initialsFromName = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LP'

const typeClass: Record<CanteenOrder['type'], string> = {
  visit: 'visit',
  event: 'event',
  free: 'free',
}

const formatOrderTime = (date?: Date | null) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : ''

const voidReasons = ['Cliente desistió antes de recibir', 'Producto cargado por error', 'Carga duplicada', 'Otro']

function VoidRequestModal({ isAdmin, onClose, onCreated, target }: { isAdmin: boolean; onClose: () => void; onCreated: (request: CanteenVoidRequest) => void; target: { order: CanteenOrder; lineItemId?: string } }) {
  const [reason, setReason] = useState(voidReasons[0])
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (!reason.trim()) return setError('El motivo es obligatorio.')
    setIsSaving(true)
    try {
      const request = await requestCanteenVoid({ order: target.order, scope: target.lineItemId ? 'line' : 'account', lineItemId: target.lineItemId, reason, notes })
      if (request) onCreated(request)
      onClose()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo registrar la solicitud.')
    } finally { setIsSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal-card canteen-void-modal" role="dialog" aria-modal="true">
    <div className="modal-header"><div><span className="eyebrow">{isAdmin ? 'Anulación administrativa' : 'Solicitud de anulación'}</span><h2>{target.lineItemId ? 'Anular un producto' : 'Anular toda la cuenta'}</h2><p>{target.order.accountName}</p></div><button className="button ghost" onClick={onClose} type="button">Cerrar</button></div>
    <label className="field"><span>Motivo</span><select value={reason} onChange={(event) => setReason(event.target.value)}>{voidReasons.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="field"><span>Observación opcional</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error ? <div className="form-alert error">{error}</div> : null}
    <div className="modal-actions"><button className="button ghost" onClick={onClose} type="button">Cancelar</button><button className="button danger" disabled={isSaving} onClick={submit} type="button">{isAdmin ? 'Continuar revisión' : 'Solicitar anulación'}</button></div>
  </section></div>
}

function VoidReviewModal({ onClose, request }: { onClose: () => void; request: CanteenVoidRequest }) {
  const [delivered, setDelivered] = useState<'yes' | 'no' | ''>('')
  const [disposition, setDisposition] = useState<'courtesy' | 'waste' | 'unpaid_consumption'>('courtesy')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const review = async (decision: 'approved' | 'rejected') => {
    if (decision === 'approved' && !delivered) return setError('Indicá si los productos fueron entregados.')
    setIsSaving(true)
    try {
      await reviewCanteenVoidRequest(request, { decision, productsDelivered: delivered === 'yes', deliveredDisposition: delivered === 'yes' ? disposition : undefined, reviewNotes: notes })
      onClose()
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : 'No se pudo procesar la solicitud.') }
    finally { setIsSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal-card canteen-void-modal" role="dialog" aria-modal="true">
    <div className="modal-header"><div><span className="eyebrow">Aprobación administrativa</span><h2>Revisar anulación</h2><p>{request.reason} · {formatGuarani(request.amount)}</p></div><button className="button ghost" onClick={onClose} type="button">Cerrar</button></div>
    <fieldset className="canteen-delivery-choice"><legend>¿Los productos fueron entregados al cliente?</legend><label><input type="radio" name="delivered" checked={delivered === 'no'} onChange={() => setDelivered('no')} /> No fueron entregados</label><label><input type="radio" name="delivered" checked={delivered === 'yes'} onChange={() => setDelivered('yes')} /> Sí fueron entregados</label></fieldset>
    {delivered === 'yes' ? <label className="field"><span>Tratamiento</span><select value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}><option value="courtesy">Cortesía</option><option value="waste">Merma</option><option value="unpaid_consumption">Consumo no cobrado</option></select></label> : null}
    <label className="field"><span>Observación de revisión</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error ? <div className="form-alert error">{error}</div> : null}
    <div className="modal-actions"><button className="button ghost" disabled={isSaving} onClick={() => review('rejected')} type="button">Rechazar</button><button className="button danger" disabled={isSaving || !delivered} onClick={() => review('approved')} type="button">Aprobar anulación</button></div>
  </section></div>
}

function RefundModal({ onClose, order }: { onClose: () => void; order: CanteenOrder }) {
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (!reason.trim() || confirmation !== 'REEMBOLSAR') return setError('Completá el motivo y escribí REEMBOLSAR.')
    setIsSaving(true)
    try { await refundCanteenOrder(order, { reason, paymentMethod: method, reference }); onClose() }
    catch (refundError) { setError(refundError instanceof Error ? refundError.message : 'No se pudo registrar el reembolso.') }
    finally { setIsSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal-card canteen-void-modal" role="dialog" aria-modal="true">
    <div className="modal-header"><div><span className="eyebrow">Acción administrativa</span><h2>Registrar reembolso</h2><p>{order.accountName} · {formatGuarani(order.total)}</p></div><button className="button ghost" onClick={onClose} type="button">Cerrar</button></div>
    <label className="field"><span>Motivo</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label className="field"><span>Método de devolución</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label>
    <label className="field"><span>Referencia opcional</span><input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
    <label className="field"><span>Escribí REEMBOLSAR</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {error ? <div className="form-alert error">{error}</div> : null}<div className="modal-actions"><button className="button ghost" onClick={onClose} type="button">Cancelar</button><button className="button danger" disabled={isSaving || confirmation !== 'REEMBOLSAR'} onClick={submit} type="button">Registrar reembolso</button></div>
  </section></div>
}

function AccountCard({
  relatedOrders,
  onCharge,
  onOpen,
  order,
  visit,
  groupVisits,
}: {
  order: CanteenOrder
  visit?: ActiveVisit | null
  groupVisits?: ActiveVisit[]
  relatedOrders: CanteenOrder[]
  onOpen: () => void
  onCharge: () => void
}) {
  const productsSummary = order.items.length
    ? order.items.slice(0, 3).map((item) => `${item.quantity} ${item.productName}`).join(' · ')
    : 'Sin productos cargados'
  void productsSummary
  const visibleName = order.accountName || order.childName || 'Cuenta sin nombre'
  const chips = order.items.slice(0, 2).map((item) => `${item.quantity} ${item.productName}`)
  const extraItems = Math.max(0, order.items.length - chips.length)
  const visitBilling = groupVisits?.length ? getVisitGroupBillingSummary(groupVisits, relatedOrders) : visit ? getVisitBillingSummary(visit, relatedOrders) : null
  const canteenPending = visitBilling ? visitBilling.pendingCanteenAmount : order.paymentStatus === 'paid' ? 0 : order.total
  const parkPending = visitBilling ? visitBilling.pendingParkAmount : 0
  const parkPaid = visit ? parkPending <= 0 : false
  const totalToCharge = visitBilling ? visitBilling.totalPendingAmount : canteenPending
  const timeStatus = groupVisits?.some((item) => getVisitTimeStatus(item) === 'expired')
    ? 'expired'
    : groupVisits?.some((item) => getVisitTimeStatus(item) === 'warning')
      ? 'warning'
      : visit
        ? getVisitTimeStatus(visit)
        : null
  const alertLabel = timeStatus === 'expired' ? 'Tiempo vencido' : timeStatus === 'warning' ? 'Salida proxima' : ''

  return (
    <article className={`canteen-account-card ${typeClass[order.type]} ${alertLabel ? 'with-alert' : ''}`}>
      <div className="account-card-main">
        <span className="account-avatar">{initialsFromName(visibleName)}</span>
        <div className="account-card-copy">
          <strong>{visibleName}</strong>
          <p>{accountSubtitle(order)}</p>
          <div className="account-card-badges">
            <StatusPill tone="available">Abierta</StatusPill>
            <StatusPill tone="info">{orderTypeLabel[order.type]}</StatusPill>
            {alertLabel ? <StatusPill tone={timeStatus === 'expired' ? 'danger' : 'warning'}>{alertLabel}</StatusPill> : null}
          </div>
          <div className="account-product-chips">
            {chips.length === 0 ? <span>Sin productos</span> : chips.map((chip) => <span key={chip}>{chip}</span>)}
            {extraItems > 0 ? <span>+{extraItems}</span> : null}
          </div>
        </div>
      </div>
      <div className="account-card-balance">
        <div>
          <span>Cantina pendiente</span>
          <strong>{formatGuarani(canteenPending)}</strong>
        </div>
        <div>
          <span>Parque</span>
          <strong className={parkPending > 0 ? 'pending' : 'paid'}>{parkPending > 0 ? `${formatGuarani(parkPending)} pendiente` : parkPaid ? 'Pagado' : formatGuarani(0)}</strong>
        </div>
        <div className="account-card-total">
          <span>Total a cobrar</span>
          <strong>{formatGuarani(totalToCharge)}</strong>
        </div>
      </div>
      <div className="account-card-actions">
        <button className="button ghost" onClick={onOpen} type="button">
          Cargar productos
        </button>
        {order.status === 'open' ? (
          <button className="button primary" onClick={onCharge} type="button">
            Cobrar total
          </button>
        ) : null}
      </div>
    </article>
  )
}

export function CanteenOperations({ standalone = false }: CanteenOperationsProps) {
  const [searchParams] = useSearchParams()
  const productsResult = useCanteenProducts()
  const ordersResult = useCanteenOrders()
  const voidRequestsResult = useCanteenVoidRequests()
  const paidTodayResult = usePaidCanteenOrdersForDate(getLocalDateKey())
  const { profile } = useUserProfile()
  const { visits } = useActiveVisits()
  const { activeEvent, events } = useEventDayContext()
  const activeEvents = events.filter((event) => event.status === 'active')
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false)
  const [creationMode, setCreationMode] = useState<'visit' | 'event' | 'free'>('visit')
  const [manualName, setManualName] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isClosedTodayOpen, setIsClosedTodayOpen] = useState(false)
  const [checkoutOrder, setCheckoutOrder] = useState<CanteenOrder | null>(null)
  const [closedOrderDetail, setClosedOrderDetail] = useState<CanteenOrder | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [draftItems, setDraftItems] = useState<CanteenOrderItem[]>([])
  const [voidTarget, setVoidTarget] = useState<{ order: CanteenOrder; lineItemId?: string } | null>(null)
  const [reviewTarget, setReviewTarget] = useState<CanteenVoidRequest | null>(null)
  const [refundTarget, setRefundTarget] = useState<CanteenOrder | null>(null)
  const handledPreselectedVisit = useRef('')
  const isAdmin = profile?.role === 'admin'
  const draftTotal = draftItems.reduce((sum, item) => sum + item.subtotal, 0)

  const openOrders = ordersResult.orders.filter((order) => order.status === 'open')
  const paidToday = paidTodayResult.orders
  const selectedOrder = selectedOrderId ? ordersResult.orders.find((order) => order.id === selectedOrderId) ?? null : null
  const activeProducts = productsResult.products.filter((product) => product.isActive)
  const productCount = activeProducts.length
  const activeEventGuestsCount = activeEvent?.registeredGuestsCount ?? 0
  const visitGroups = groupActiveVisits(visits)

  const soldToday = paidToday.reduce((sum, order) => sum + order.total, 0)
  const costToday = paidToday.reduce((sum, order) => sum + (order.costTotal ?? 0), 0)
  const hasCostData = paidToday.some((order) => (order.costTotal ?? 0) > 0)
  const estimatedProfit = soldToday - costToday
  const relatedOrdersForVisit = (visitId: string) => {
    const visit = visits.find((item) => item.id === visitId)
    return visit ? getOrdersForVisit(ordersResult.orders, visit) : ordersResult.orders.filter((order) => order.visitId === visitId)
  }
  const groupVisitsForOrder = (order: CanteenOrder) =>
    order.groupEntryId ? visits.filter((visit) => visit.groupEntryId === order.groupEntryId) : []
  const relatedOrdersForGroup = (groupVisits: ActiveVisit[]) => getOrdersForVisitGroup(ordersResult.orders, groupVisits)
  const withCheckoutOrder = (orders: CanteenOrder[], checkout: CanteenOrder) =>
    orders.some((order) => order.id === checkout.id) ? orders.map((order) => order.id === checkout.id ? checkout : order) : [...orders, checkout]
  const visitForOrder = (order: CanteenOrder) =>
    order.type === 'visit' && order.visitId ? visits.find((visit) => visit.id === order.visitId) ?? null : null
  const selectedOrderGroupVisits = selectedOrder?.type === 'visit' ? groupVisitsForOrder(selectedOrder) : []
  const selectedOrderVisit = selectedOrder?.type === 'visit' && selectedOrder.visitId ? visits.find((visit) => visit.id === selectedOrder.visitId) ?? null : null

  useEffect(() => {
    setDraftItems([])
  }, [selectedOrderId])
  const orderPendingTotal = (order: CanteenOrder) => {
    const groupVisits = groupVisitsForOrder(order)
    if (groupVisits.length > 1) {
      return getVisitGroupBillingSummary(groupVisits, relatedOrdersForGroup(groupVisits)).totalPendingAmount
    }
    const visit = visitForOrder(order)
    if (visit) {
      return getVisitBillingSummary(visit, relatedOrdersForVisit(visit.id)).totalPendingAmount
    }
    return order.paymentStatus === 'paid' ? 0 : order.total
  }
  const openOrdersForView = openOrders
    .sort((a, b) => {
      const aGroupVisits = groupVisitsForOrder(a)
      const bGroupVisits = groupVisitsForOrder(b)
      const aVisit = aGroupVisits[0] ?? visitForOrder(a)
      const bVisit = bGroupVisits[0] ?? visitForOrder(b)
      const priority = (order: CanteenOrder, visit: ActiveVisit | null) => {
        const status = visit ? getVisitTimeStatus(visit) : null
        if (status === 'expired') return 0
        if (status === 'warning') return 1
        if (visit && getVisitBillingSummary(visit, relatedOrdersForVisit(visit.id)).pendingParkAmount > 0 && order.total > 0) return 2
        if (order.type === 'event') return 3
        if (order.type === 'visit') return 4
        return 5
      }
      return priority(a, aVisit) - priority(b, bVisit) || orderPendingTotal(b) - orderPendingTotal(a)
    })

  const openChargeModal = (order: CanteenOrder) => {
    setMessage(null)
    setCheckoutOrder(order)
  }

  const openVisitOrder = async (visit: ActiveVisit) => {
    const groupVisits = visit.groupEntryId ? visits.filter((item) => item.groupEntryId === visit.groupEntryId) : []
    const isGrouped = groupVisits.length > 1
    const existingOrder = isGrouped
      ? findOpenGroupOrder(ordersResult.orders, groupVisits)
      : ordersResult.orders.find((order) => order.type === 'visit' && order.visitId === visit.id && order.status === 'open')
    if (existingOrder) {
      setSelectedOrderId(existingOrder.id)
      setIsAccountPickerOpen(false)
      return
    }

    setIsSaving(true)
    try {
      const id = await createCanteenOrder({
        type: 'visit',
        visitId: isGrouped ? groupVisits[0].id : visit.id,
        visitIds: isGrouped ? groupVisits.map((item) => item.id) : [visit.id],
        groupEntryId: isGrouped ? visit.groupEntryId : '',
        childId: isGrouped ? groupVisits[0].childId : visit.childId,
        childIds: isGrouped ? groupVisits.map((item) => item.childId) : [visit.childId],
        childName: isGrouped ? formatGroupChildNames(groupVisits) : visit.childName,
        childNames: isGrouped ? groupVisits.map((item) => item.childName) : [visit.childName],
        customerId: visit.customerId,
        guardianId: visit.guardianId ?? visit.customerId,
        accountName: isGrouped ? `${visit.customerName} - ${formatGroupChildNames(groupVisits)}` : visit.childName,
        customerName: visit.customerName,
        customerPhone: visit.customerPhone,
        items: [],
        chargeNow: false,
      })
      setSelectedOrderId(id)
      setIsAccountPickerOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const groupEntryId = searchParams.get('groupEntryId')
    if (groupEntryId && !ordersResult.isLoading && handledPreselectedVisit.current !== `group:${groupEntryId}`) {
      const groupVisits = visits.filter((item) => item.groupEntryId === groupEntryId)
      const existingOrder = findOpenGroupOrder(ordersResult.orders, groupVisits)
      handledPreselectedVisit.current = `group:${groupEntryId}`
      if (existingOrder) {
        setSelectedOrderId(existingOrder.id)
        return
      }
      if (groupVisits.length) {
        openVisitOrder(groupVisits[0])
      }
      return
    }

    const visitId = searchParams.get('visitId')
    if (!visitId || ordersResult.isLoading || handledPreselectedVisit.current === visitId) {
      return
    }

    const existingOrder = ordersResult.orders.find((order) => order.visitId === visitId && order.status === 'open')
    if (existingOrder) {
      handledPreselectedVisit.current = visitId
      setSelectedOrderId(existingOrder.id)
      return
    }

    const visit = visits.find((item) => item.id === visitId)
    if (visit) {
      handledPreselectedVisit.current = visitId
      openVisitOrder(visit)
    }
  }, [ordersResult.isLoading, ordersResult.orders, searchParams, visits])

  const openEventOrder = async (event: LuccaEvent) => {
    const existingOrder = ordersResult.orders.find((order) => order.type === 'event' && order.eventId === event.id && order.status === 'open')
    if (existingOrder) {
      setSelectedOrderId(existingOrder.id)
      setIsAccountPickerOpen(false)
      return
    }

    setIsSaving(true)
    try {
      const id = await createCanteenOrder({
        type: 'event',
        eventId: event.id,
        accountName: event.title,
        customerName: event.customerName,
        customerPhone: event.customerPhone,
        items: [],
        chargeNow: false,
      })
      setSelectedOrderId(id)
      setIsAccountPickerOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  const createManualOrder = async () => {
    const normalizedManualName = formatPersonName(manualName)

    if (!normalizedManualName) {
      setMessage('Ingresa el nombre del cliente para abrir la cuenta.')
      return
    }

    setIsSaving(true)
    try {
      const id = await createCanteenOrder({
        type: 'free',
        accountName: normalizedManualName,
        customerName: normalizedManualName,
        items: [],
        chargeNow: false,
      })
      setSelectedOrderId(id)
      setIsAccountPickerOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  const addProduct = (_order: CanteenOrder, product: CanteenProduct) => {
    const nextItem = itemFromProduct(product)
    setDraftItems((current) => {
      const existing = current.find((item) => item.productId === product.id)
      if (!existing) return [...current, nextItem]
      return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice } : item)
    })
    setMessage(`${product.name} agregado al borrador.`)
  }

  const setDraftItemQuantity = (item: CanteenOrderItem, nextQuantity: number) => {
    setDraftItems((current) => current
      .map((current) =>
        current.productId === item.productId
          ? {
              ...current,
              quantity: nextQuantity,
              subtotal: current.unitPrice * nextQuantity,
              costSubtotal: (current.unitCost ?? 0) * nextQuantity,
            }
          : current,
      )
      .filter((current) => current.quantity > 0))
  }

  const mergedOrderWithDraft = (order: CanteenOrder): CanteenOrder => {
    const items = order.items.map((item) => ({ ...item }))
    draftItems.forEach((draft) => {
      const existing = items.find((item) => item.productId === draft.productId && (item.status || 'active') === 'active')
      if (existing) {
        existing.quantity += draft.quantity
        existing.subtotal = existing.quantity * existing.unitPrice
      } else {
        items.push(draft)
      }
    })
    return { ...order, items, total: order.total + draftTotal }
  }

  const saveDraft = async (order: CanteenOrder) => {
    if (!draftItems.length) return order
    const nextOrder = mergedOrderWithDraft(order)
    setIsSaving(true)
    try {
      await addItemsToCanteenOrder(order, draftItems)
      setDraftItems([])
      setMessage('Consumo confirmado y guardado en la cuenta.')
      return nextOrder
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el consumo.')
      return null
    } finally {
      setIsSaving(false)
    }
  }

  const saveDraftAndCharge = async (order: CanteenOrder) => {
    const nextOrder = await saveDraft(order)
    if (nextOrder) openChargeModal(nextOrder)
  }

  const closeEmptyOrder = async (order: CanteenOrder) => {
    if (!window.confirm('¿Cerrar esta cuenta vacía?')) return
    setIsSaving(true)
    try {
      await closeEmptyCanteenOrder(order)
      setSelectedOrderId(null)
      setMessage('Cuenta vacía cerrada correctamente.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cerrar la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  const content = (
    <div className="canteen-operations">
      <header className="canteen-hero">
        <div className="canteen-hero-brand">
          <BrandLogo className="compact" />
          <span className="canteen-hero-separator" />
          <div>
            <span className="eyebrow">Operativo</span>
            <h1>Cantina</h1>
            <p>Cuentas abiertas y cobro rapido.</p>
          </div>
        </div>
        <button
          className="button primary canteen-open-button"
          onClick={() => {
            if (activeEvent) {
              setCreationMode('event')
            }
            setIsAccountPickerOpen(true)
          }}
          type="button"
        >
          <Plus size={18} />
          Abrir cuenta
        </button>
        <div className="canteen-metrics">
          <span>
            <small>Vendido hoy</small>
            <strong>{formatGuarani(soldToday)}</strong>
          </span>
          <span>
            <small>Costo hoy</small>
            <strong>{hasCostData ? formatGuarani(costToday) : 'Sin costo'}</strong>
          </span>
          <span>
            <small>Ganancia est.</small>
            <strong>{hasCostData ? formatGuarani(estimatedProfit) : 'No disp.'}</strong>
          </span>
        </div>
      </header>

      {activeEvent ? (
        <section className="canteen-active-event-strip">
          <span>
            Evento activo: <strong>{activeEvent.title}</strong> - {activeEventGuestsCount} / {activeEvent.contractedChildrenCount} invitados
          </span>
          <button className="button secondary" disabled={isSaving} onClick={() => openEventOrder(activeEvent)} type="button">
            Ver cuenta del evento
          </button>
        </section>
      ) : null}

      {message ? <div className={message.includes('No se') || message.includes('Carga') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}

      {selectedOrder ? (
        <section className="panel canteen-detail-panel">
          <div className="panel-header">
            <button className="button ghost" onClick={() => setSelectedOrderId(null)} type="button">
              <ArrowLeft size={17} />
              Volver a cuentas
            </button>
            <StatusPill tone="warning">{orderTypeLabel[selectedOrder.type]}</StatusPill>
          </div>

          <div className="account-detail-header">
            <div>
              <span className="eyebrow">Cuenta seleccionada</span>
              <h2>{selectedOrder.accountName}</h2>
              <p>{orderSubtitle(selectedOrder)}</p>
            </div>
            <strong>
              {formatGuarani(
                selectedOrderGroupVisits.length > 1
                  ? getVisitGroupBillingSummary(selectedOrderGroupVisits, relatedOrdersForGroup(selectedOrderGroupVisits)).totalPendingAmount
                  : selectedOrderVisit
                    ? getVisitBillingSummary(selectedOrderVisit, relatedOrdersForVisit(selectedOrderVisit.id)).totalPendingAmount
                    : selectedOrder.total,
              )}
            </strong>
          </div>

          <section className="available-products-panel">
            <div className="section-subheader">
              <div>
                <h3>Productos disponibles</h3>
                <p>Toca un producto para agregar 1 unidad a esta cuenta.</p>
              </div>
            </div>
            <div className="quick-product-grid">
              {productCount === 0 ? <div className="empty-state">No hay productos activos en inventario.</div> : null}
              {activeProducts.map((product) => (
                <button className="quick-product-card" key={product.id} onClick={() => addProduct(selectedOrder, product)} type="button">
                  <ProductImageView alt={product.name} className="quick-product-image" fit={product.imageFit} imageUrl={product.imageUrl} />
                  <strong>{product.name}</strong>
                  <small>{product.category}</small>
                  <b>{formatGuarani(product.salePrice ?? product.price)}</b>
                </button>
              ))}
            </div>
          </section>

          <div className="account-summary">
            <h3>Consumo confirmado</h3>
            {selectedOrder.items.length === 0 ? <div className="empty-state">Esta cuenta todavía no tiene consumos confirmados.</div> : null}
            {selectedOrder.items.map((item) => {
              const lineStatus = item.status || 'active'
              const isActiveLine = lineStatus === 'active'
              const statusCopy = lineStatus === 'voided' ? 'Anulado' : lineStatus === 'waste' ? 'Merma' : lineStatus === 'courtesy' ? 'Cortesía' : selectedOrder.voidRequestStatus === 'pending' ? 'Anulación pendiente' : 'Confirmado'
              return (
              <div className={`account-item-row ${isActiveLine ? '' : 'is-voided'}`} key={item.productId}>
                <div>
                  <strong>{item.productName}</strong>
                  <small>{item.quantity} × {formatGuarani(item.unitPrice)} c/u</small>
                </div>
                <strong>{formatGuarani(item.subtotal)}</strong>
                <StatusPill tone={selectedOrder.voidRequestStatus === 'pending' ? 'warning' : isActiveLine ? 'available' : 'danger'}>
                  {statusCopy}
                </StatusPill>
                {isActiveLine && selectedOrder.voidRequestStatus !== 'pending' ? (
                  <button className="button ghost" disabled={isSaving} onClick={() => setVoidTarget({ order: selectedOrder, lineItemId: item.lineItemId || item.productId })} type="button">
                    {isAdmin ? 'Anular producto' : 'Solicitar anulación'}
                  </button>
                ) : null}
              </div>
            )})}
          </div>

          <div className="account-summary canteen-draft-panel">
            <div className="section-subheader">
              <div><h3>Borrador</h3><p>Estos productos todavía no afectan stock ni ventas.</p></div>
              <StatusPill tone="info">{formatGuarani(draftTotal)}</StatusPill>
            </div>
            {draftItems.length === 0 ? <div className="empty-state">No hay productos en el borrador.</div> : null}
            {draftItems.map((item) => (
              <div className="account-item-row" key={`draft-${item.productId}`}>
                <div><strong>{item.productName}</strong><small>{formatGuarani(item.unitPrice)} c/u</small></div>
                <div className="quantity-stepper">
                  <button onClick={() => setDraftItemQuantity(item, item.quantity - 1)} type="button">-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => setDraftItemQuantity(item, item.quantity + 1)} type="button">+</button>
                </div>
                <strong>{formatGuarani(item.subtotal)}</strong>
                <button className="icon-button" onClick={() => setDraftItemQuantity(item, 0)} type="button" aria-label={`Quitar ${item.productName}`}><Trash2 size={17} /></button>
              </div>
            ))}
          </div>

          <div className="account-paybar">
            <strong>
              Total a cobrar{' '}
              {formatGuarani(
                (selectedOrderGroupVisits.length > 1
                  ? getVisitGroupBillingSummary(selectedOrderGroupVisits, relatedOrdersForGroup(selectedOrderGroupVisits)).totalPendingAmount
                  : selectedOrderVisit
                    ? getVisitBillingSummary(selectedOrderVisit, relatedOrdersForVisit(selectedOrderVisit.id)).totalPendingAmount
                    : selectedOrder.total) + draftTotal,
              )}
            </strong>
            {draftItems.length ? <button className="button ghost" disabled={isSaving} onClick={() => saveDraft(selectedOrder)} type="button">Guardar abierta</button> : null}
            <button className="button primary" disabled={isSaving || (selectedOrder.total + draftTotal <= 0 && !selectedOrderVisit)} onClick={() => saveDraftAndCharge(selectedOrder)} type="button">
              <CreditCard size={18} />
              Cobrar total
            </button>
            {draftItems.length ? <button className="button danger" disabled={isSaving} onClick={() => { if (window.confirm('¿Descartar los productos del borrador?')) setDraftItems([]) }} type="button">Descartar selección</button> : null}
            {!draftItems.length && selectedOrder.items.length === 0 && selectedOrder.total === 0 ? <button className="button danger" disabled={isSaving} onClick={() => closeEmptyOrder(selectedOrder)} type="button">Cerrar cuenta vacía</button> : null}
            {!draftItems.length && selectedOrder.items.length > 0 && selectedOrder.voidRequestStatus !== 'pending' ? <button className="button danger" disabled={isSaving} onClick={() => setVoidTarget({ order: selectedOrder })} type="button">{isAdmin ? 'Anular cuenta' : 'Solicitar anulación'}</button> : null}
            {selectedOrder.voidRequestStatus === 'pending' ? <StatusPill tone="warning">Anulación pendiente</StatusPill> : null}
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <Receipt color="var(--orange)" />
                Cuentas abiertas
              </h2>
              <StatusPill tone={openOrders.length > 0 ? 'warning' : 'available'}>{openOrders.length} abiertas</StatusPill>
            </div>
            {ordersResult.isLoading ? <div className="empty-state">Cargando cuentas...</div> : null}
            {ordersResult.error ? <div className="form-alert error">No se pudieron cargar cuentas: {ordersResult.error}</div> : null}
            {!ordersResult.isLoading && !ordersResult.error && openOrdersForView.length === 0 ? (
              <div className="empty-state">No hay cuentas abiertas en este momento.</div>
            ) : null}
            <div className="canteen-account-grid">
              {openOrdersForView.map((order) => (
                <AccountCard
                  key={order.id}
                  order={order}
                  groupVisits={groupVisitsForOrder(order)}
                  relatedOrders={order.groupEntryId ? relatedOrdersForGroup(groupVisitsForOrder(order)) : order.visitId ? relatedOrdersForVisit(order.visitId) : [order]}
                  visit={visitForOrder(order)}
                  onCharge={() => openChargeModal(order)}
                  onOpen={() => setSelectedOrderId(order.id)}
                />
              ))}
            </div>
          </section>

          <section className="panel compact-panel">
            <button className="collapsible-title" onClick={() => setIsClosedTodayOpen((current) => !current)} type="button">
              <span>
                {isClosedTodayOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                <CheckCircle2 color="var(--green)" />
                <strong>Cuentas cerradas de hoy</strong>
              </span>
              <StatusPill tone="available">{paidToday.length} cobradas</StatusPill>
            </button>
            {isClosedTodayOpen ? (
              <div className="closed-orders-list">
                {paidToday.length === 0 ? <div className="empty-state">Todavia no hay cuentas cobradas hoy.</div> : null}
                {paidToday.map((order) => (
                  <div className="closed-order-row" key={order.id}>
                    <span>
                      <strong>{order.accountName}</strong>
                      <small>{orderTypeLabel[order.type]} · {order.items.map((item) => `${item.quantity} ${item.productName}`).join(', ')}</small>
                    </span>
                    <strong>{formatGuarani(order.total)}</strong>
                    <StatusPill tone="available">{order.paymentMethod ? paymentLabel[order.paymentMethod as Exclude<PaymentMethod, ''>] : 'Cobrado'}</StatusPill>
                    {order.paidAt ? <small>{formatOrderTime(order.paidAt)} hs</small> : null}
                    <button className="button ghost" onClick={() => setClosedOrderDetail(order)} type="button">
                      Ver detalle
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {isAdmin ? (
            <section className="panel compact-panel canteen-void-requests">
              <div className="panel-header"><h2 className="panel-title">Solicitudes de anulación</h2><StatusPill tone={voidRequestsResult.requests.some((item) => item.status === 'pending') ? 'warning' : 'available'}>{voidRequestsResult.requests.filter((item) => item.status === 'pending').length} pendientes</StatusPill></div>
              {voidRequestsResult.requests.filter((item) => item.status === 'pending').length === 0 ? <div className="empty-state">No hay solicitudes pendientes.</div> : null}
              {voidRequestsResult.requests.filter((item) => item.status === 'pending').map((request) => {
                const order = ordersResult.orders.find((item) => item.id === request.accountId)
                return <article className="canteen-void-request-row" key={request.id}><div><strong>{order?.accountName || request.accountId}</strong><small>{request.scope === 'line' ? 'Producto' : 'Cuenta completa'} · {request.reason}</small><small>Solicitó: {request.requestedByName}</small></div><strong>{formatGuarani(request.amount)}</strong><button className="button secondary" onClick={() => setReviewTarget(request)} type="button">Revisar</button></article>
              })}
            </section>
          ) : null}

          <ProductManager {...productsResult} />
        </>
      )}

      {isAccountPickerOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card account-picker-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <h2>Abrir cuenta</h2>
              <button className="button ghost" onClick={() => setIsAccountPickerOpen(false)} type="button">
                Cerrar
              </button>
            </div>
            <div className="order-type-switch large">
              {activeEvent ? (
                <button className={creationMode === 'event' ? 'active' : ''} onClick={() => setCreationMode('event')} type="button">
                  <CalendarDays size={18} />
                  Evento activo
                </button>
              ) : null}
              <button className={creationMode === 'visit' ? 'active' : ''} onClick={() => setCreationMode('visit')} type="button">
                <Users size={18} />
                Registro de recepcion
              </button>
              {!activeEvent ? (
                <button className={creationMode === 'event' ? 'active' : ''} onClick={() => setCreationMode('event')} type="button">
                  <CalendarDays size={18} />
                  Evento activo
                </button>
              ) : null}
              <button className={creationMode === 'free' ? 'active' : ''} onClick={() => setCreationMode('free')} type="button">
                <ChefHat size={18} />
                Otro
              </button>
            </div>

            {creationMode === 'visit' ? (
              <div className="picker-grid">
                {visits.length === 0 ? <div className="empty-state">No hay visitas activas para asociar.</div> : null}
                {visitGroups.map((group) => {
                  const visit = group.visits[0]
                  const existingOrder = group.isGrouped
                    ? findOpenGroupOrder(ordersResult.orders, group.visits)
                    : ordersResult.orders.find((order) => order.type === 'visit' && order.visitId === visit.id && order.status === 'open')
                  return (
                    <button className="picker-card" disabled={isSaving} key={group.id} onClick={() => openVisitOrder(visit)} type="button">
                      <strong>{group.isGrouped ? formatGroupChildNames(group.visits) : visit.childName}</strong>
                      <small>{visit.customerName}</small>
                      <span>{group.isGrouped ? `${group.visits.length} niños ingresaron juntos` : `Ingreso ${formatVisitStartTime(visit.startedAt)}`}</span>
                      <StatusPill tone={existingOrder ? 'warning' : 'info'}>{existingOrder ? 'Cuenta abierta' : 'Sin consumo'}</StatusPill>
                    </button>
                  )
                })}
              </div>
            ) : null}

            {creationMode === 'event' ? (
              <div className="picker-grid">
                {activeEvents.length === 0 ? <div className="empty-state">No hay evento activo en este momento.</div> : null}
                {activeEvents.map((event) => (
                  <button className="picker-card" disabled={isSaving} key={event.id} onClick={() => openEventOrder(event)} type="button">
                    <strong>{event.title}</strong>
                    <small>{event.customerName}</small>
                    <span>{event.startTime} a {event.endTime}</span>
                    <StatusPill tone="info">{event.contractedChildrenCount} cupos</StatusPill>
                  </button>
                ))}
              </div>
            ) : null}

            {creationMode === 'free' ? (
              <div className="manual-account-box">
                <label className="field">
                  <span>Nombre de cuenta manual</span>
                  <input
                    onBlur={() => setManualName(formatPersonName(manualName))}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="Ej. Carlos Benitez"
                    value={manualName}
                  />
                </label>
                <button className="button primary" disabled={isSaving} onClick={createManualOrder} type="button">
                  Crear cuenta manual
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {checkoutOrder && groupVisitsForOrder(checkoutOrder).length > 1 ? (
        <ConsolidatedGroupCheckoutModal
          finishByDefault={false}
          onClose={() => setCheckoutOrder(null)}
          onDone={() => {
            setMessage('Cobro grupal registrado correctamente.')
            setSelectedOrderId(null)
          }}
          orders={withCheckoutOrder(relatedOrdersForGroup(groupVisitsForOrder(checkoutOrder)), checkoutOrder)}
          source="canteen"
          visits={groupVisitsForOrder(checkoutOrder)}
        />
      ) : checkoutOrder ? (
        <CanteenCheckoutModal
          onClose={() => setCheckoutOrder(null)}
          onDone={(total, method) => {
            setMessage(`Cobro registrado correctamente · ${formatGuarani(total)} · ${paymentLabel[method]}`)
            setSelectedOrderId(null)
          }}
          order={checkoutOrder}
          relatedOrders={checkoutOrder.visitId ? withCheckoutOrder(relatedOrdersForVisit(checkoutOrder.visitId), checkoutOrder) : [checkoutOrder]}
          visit={checkoutOrder.type === 'visit' ? visitForOrder(checkoutOrder) : null}
        />
      ) : null}

      {closedOrderDetail ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card closed-order-detail-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Cuenta cerrada</span>
                <h2>{closedOrderDetail.accountName}</h2>
                <p>
                  {orderTypeLabel[closedOrderDetail.type]}
                  {closedOrderDetail.paidAt ? ` · ${formatOrderTime(closedOrderDetail.paidAt)} hs` : ''}
                </p>
              </div>
              <button className="button ghost" onClick={() => setClosedOrderDetail(null)} type="button">
                Cerrar
              </button>
            </div>
            <div className="checkout-detail-list">
              {closedOrderDetail.items.length === 0 ? <div className="empty-state">Sin productos cargados.</div> : null}
              {closedOrderDetail.items.map((item) => (
                <div className="checkout-line" key={`${closedOrderDetail.id}-${item.productId}`}>
                  <span>
                    <strong>
                      {item.productName} x{item.quantity}
                    </strong>
                    <small>{formatGuarani(item.unitPrice)} c/u</small>
                  </span>
                  <strong>{formatGuarani(item.subtotal)}</strong>
                </div>
              ))}
            </div>
            <div className="checkout-total-bar">
              <span>Total cobrado</span>
              <strong>{formatGuarani(closedOrderDetail.total)}</strong>
            </div>
            <div className="closed-order-meta">
              <span>Método: {closedOrderDetail.paymentMethod ? paymentLabel[closedOrderDetail.paymentMethod as Exclude<PaymentMethod, ''>] : 'Cobrado'}</span>
              {closedOrderDetail.cardType ? <span>Tarjeta: {closedOrderDetail.cardType === 'debit' ? 'Débito' : 'Crédito'}</span> : null}
              {closedOrderDetail.updatedBy ? <span>Usuario: {closedOrderDetail.updatedBy}</span> : null}
            </div>
            {isAdmin && closedOrderDetail.status === 'paid' ? <button className="button danger" onClick={() => setRefundTarget(closedOrderDetail)} type="button">Registrar reembolso / Anular pago</button> : null}
          </section>
        </div>
      ) : null}

      {voidTarget ? <VoidRequestModal isAdmin={isAdmin} target={voidTarget} onClose={() => setVoidTarget(null)} onCreated={(request) => { if (isAdmin) setReviewTarget(request) }} /> : null}
      {reviewTarget ? <VoidReviewModal request={reviewTarget} onClose={() => setReviewTarget(null)} /> : null}
      {refundTarget ? <RefundModal order={refundTarget} onClose={() => { setRefundTarget(null); setClosedOrderDetail(null) }} /> : null}
    </div>
  )

  if (standalone) {
    return (
      <main className="internal-page">
        <section className="internal-shell">{content}</section>
      </main>
    )
  }

  return content
}

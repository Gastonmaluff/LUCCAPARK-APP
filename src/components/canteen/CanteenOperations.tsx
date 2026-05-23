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
  ShoppingBasket,
  Trash2,
  Users,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { BrandLogo } from '../BrandLogo'
import { ProductManager } from './ProductManager'
import { ConsolidatedCheckoutModal } from '../reception/ConsolidatedCheckoutModal'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCanteenOrders, useCanteenProducts, usePaidCanteenOrdersForDate } from '../../hooks/useCanteen'
import { useEvents } from '../../hooks/useEvents'
import {
  addItemsToCanteenOrder,
  cancelCanteenOrder,
  chargeCanteenOrder,
  createCanteenOrder,
  updateCanteenOrderItems,
} from '../../services/canteenService'
import { getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import { formatVisitStartTime } from '../../utils/visitTime'
import { StatusPill } from '../StatusPill'
import type { ActiveVisit, CanteenOrder, CanteenOrderItem, CanteenProduct, LuccaEvent, PaymentMethod } from '../../types'

type CanteenOperationsProps = {
  standalone?: boolean
}

const paymentMethods: Array<Exclude<PaymentMethod, ''>> = ['cash', 'transfer', 'card', 'qr', 'other']

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

function AccountCard({
  onCharge,
  onOpen,
  order,
}: {
  order: CanteenOrder
  onOpen: () => void
  onCharge: () => void
}) {
  const productsSummary = order.items.length
    ? order.items.slice(0, 3).map((item) => `${item.quantity} ${item.productName}`).join(' · ')
    : 'Sin productos cargados'

  return (
    <article className="canteen-account-card">
      <div className="account-card-main">
        <span className="account-avatar">{(order.accountName || order.childName || 'C').slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{order.accountName || order.childName || 'Cuenta sin nombre'}</strong>
          <p>{orderSubtitle(order)}</p>
          <small>{productsSummary}</small>
        </div>
      </div>
      <div className="account-card-side">
        <StatusPill tone={order.status === 'paid' ? 'available' : 'warning'}>{order.status === 'paid' ? 'Pagada' : 'Abierta'}</StatusPill>
        <StatusPill tone="info">{orderTypeLabel[order.type]}</StatusPill>
        <strong>{formatGuarani(order.total)}</strong>
      </div>
      <div className="module-actions">
        <button className="button ghost" onClick={onOpen} type="button">
          Abrir detalle
        </button>
        {order.status === 'open' ? (
          <button className="button primary" onClick={onCharge} type="button">
            Cobrar
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
  const paidTodayResult = usePaidCanteenOrdersForDate(getLocalDateKey())
  const { visits } = useActiveVisits()
  const { events } = useEvents()
  const activeEvents = events.filter((event) => event.status === 'active')
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false)
  const [creationMode, setCreationMode] = useState<'visit' | 'event' | 'free'>('visit')
  const [manualName, setManualName] = useState('Cliente mostrador')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isClosedTodayOpen, setIsClosedTodayOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''>>('cash')
  const [checkoutVisit, setCheckoutVisit] = useState<ActiveVisit | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const handledPreselectedVisit = useRef('')

  const openOrders = ordersResult.orders.filter((order) => order.status === 'open')
  const paidToday = paidTodayResult.orders
  const selectedOrder = selectedOrderId ? ordersResult.orders.find((order) => order.id === selectedOrderId) ?? null : null
  const selectedOrderVisit = selectedOrder?.type === 'visit' && selectedOrder.visitId ? visits.find((visit) => visit.id === selectedOrder.visitId) ?? null : null
  const activeProducts = productsResult.products.filter((product) => product.isActive)
  const productCount = activeProducts.length

  const soldToday = paidToday.reduce((sum, order) => sum + order.total, 0)
  const costToday = paidToday.reduce((sum, order) => sum + (order.costTotal ?? 0), 0)
  const hasCostData = paidToday.some((order) => (order.costTotal ?? 0) > 0)
  const estimatedProfit = soldToday - costToday

  const chargeOrder = async (order: CanteenOrder) => {
    if (order.type === 'visit' && order.visitId) {
      const visit = visits.find((item) => item.id === order.visitId)
      if (visit) {
        setCheckoutVisit(visit)
        return
      }
    }

    setMessage(null)
    setIsSaving(true)
    try {
      await chargeCanteenOrder(order, paymentMethod)
      setMessage('Cuenta cobrada.')
      setSelectedOrderId(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cobrar la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  const openVisitOrder = async (visit: ActiveVisit) => {
    const existingOrder = ordersResult.orders.find((order) => order.type === 'visit' && order.visitId === visit.id && order.status === 'open')
    if (existingOrder) {
      setSelectedOrderId(existingOrder.id)
      setIsAccountPickerOpen(false)
      return
    }

    setIsSaving(true)
    try {
      const id = await createCanteenOrder({
        type: 'visit',
        visitId: visit.id,
        childId: visit.childId,
        childName: visit.childName,
        customerId: visit.customerId,
        accountName: visit.childName,
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
    if (!manualName.trim()) {
      setMessage('Carga un nombre para la cuenta.')
      return
    }

    setIsSaving(true)
    try {
      const id = await createCanteenOrder({
        type: 'free',
        accountName: manualName,
        customerName: manualName,
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

  const addProduct = async (order: CanteenOrder, product: CanteenProduct) => {
    setMessage(null)
    try {
      await addItemsToCanteenOrder(order, [itemFromProduct(product)])
      setMessage(`${product.name} agregado.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo agregar el producto.')
    }
  }

  const setItemQuantity = async (order: CanteenOrder, item: CanteenOrderItem, nextQuantity: number) => {
    const nextItems = order.items
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
      .filter((current) => current.quantity > 0)

    try {
      await updateCanteenOrderItems(order, nextItems)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el consumo.')
    }
  }

  const cancelOrder = async (order: CanteenOrder) => {
    if (!window.confirm('Cancelar esta cuenta? El registro quedara guardado como cancelado.')) {
      return
    }

    setIsSaving(true)
    try {
      await cancelCanteenOrder(order)
      setSelectedOrderId(null)
      setMessage('Cuenta cancelada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cancelar la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  const content = (
    <div className="canteen-operations">
      <header className="canteen-hero">
        {standalone ? <BrandLogo className="compact" /> : null}
        <div>
          <span className="eyebrow">Operativo</span>
          <h1>Cantina</h1>
          <p>Cuentas abiertas, productos rapidos y cobro simple.</p>
        </div>
        <button className="button primary canteen-open-button" onClick={() => setIsAccountPickerOpen(true)} type="button">
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
            <strong>{formatGuarani(selectedOrder.total)}</strong>
          </div>

          <div className="quick-product-grid">
            {productCount === 0 ? <div className="empty-state">No hay productos activos en inventario.</div> : null}
            {activeProducts.map((product) => (
              <button className="quick-product-card" key={product.id} onClick={() => addProduct(selectedOrder, product)} type="button">
                <span className="quick-product-image">
                  {product.imageUrl ? <img alt={product.name} src={product.imageUrl} /> : <ShoppingBasket size={34} />}
                </span>
                <strong>{product.name}</strong>
                <small>{product.category}</small>
                <b>{formatGuarani(product.salePrice ?? product.price)}</b>
              </button>
            ))}
          </div>

          <div className="account-summary">
            <h3>Resumen de consumo</h3>
            {selectedOrder.items.length === 0 ? <div className="empty-state">Esta cuenta todavia no tiene productos.</div> : null}
            {selectedOrder.items.map((item) => (
              <div className="account-item-row" key={item.productId}>
                <div>
                  <strong>{item.productName}</strong>
                  <small>{formatGuarani(item.unitPrice)} c/u</small>
                </div>
                <div className="quantity-stepper">
                  <button onClick={() => setItemQuantity(selectedOrder, item, item.quantity - 1)} type="button">
                    -
                  </button>
                  <span>{item.quantity}</span>
                  <button onClick={() => setItemQuantity(selectedOrder, item, item.quantity + 1)} type="button">
                    +
                  </button>
                </div>
                <strong>{formatGuarani(item.subtotal)}</strong>
                <button className="icon-button" onClick={() => setItemQuantity(selectedOrder, item, 0)} type="button" aria-label={`Quitar ${item.productName}`}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>

          <div className="account-paybar">
            <strong>Total {formatGuarani(selectedOrder.total)}</strong>
            <select onChange={(event) => setPaymentMethod(event.target.value as Exclude<PaymentMethod, ''>)} value={paymentMethod}>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {paymentLabel[method]}
                </option>
              ))}
            </select>
            <button className="button ghost" onClick={() => setSelectedOrderId(null)} type="button">
              Guardar abierta
            </button>
            <button className="button primary" disabled={isSaving || (selectedOrder.total <= 0 && !selectedOrderVisit)} onClick={() => chargeOrder(selectedOrder)} type="button">
              <CreditCard size={18} />
              Cobrar ahora
            </button>
            <button className="button danger" disabled={isSaving} onClick={() => cancelOrder(selectedOrder)} type="button">
              Cancelar cuenta
            </button>
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
            {!ordersResult.isLoading && !ordersResult.error && openOrders.length === 0 ? (
              <div className="empty-state">No hay cuentas abiertas en este momento.</div>
            ) : null}
            <div className="canteen-account-grid">
              {openOrders.map((order) => (
                <AccountCard key={order.id} order={order} onCharge={() => chargeOrder(order)} onOpen={() => setSelectedOrderId(order.id)} />
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
                  </div>
                ))}
              </div>
            ) : null}
          </section>

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
              <button className={creationMode === 'visit' ? 'active' : ''} onClick={() => setCreationMode('visit')} type="button">
                <Users size={18} />
                Registro de recepcion
              </button>
              <button className={creationMode === 'event' ? 'active' : ''} onClick={() => setCreationMode('event')} type="button">
                <CalendarDays size={18} />
                Evento activo
              </button>
              <button className={creationMode === 'free' ? 'active' : ''} onClick={() => setCreationMode('free')} type="button">
                <ChefHat size={18} />
                Otro
              </button>
            </div>

            {creationMode === 'visit' ? (
              <div className="picker-grid">
                {visits.length === 0 ? <div className="empty-state">No hay visitas activas para asociar.</div> : null}
                {visits.map((visit) => {
                  const existingOrder = ordersResult.orders.find(
                    (order) => order.type === 'visit' && order.visitId === visit.id && order.status === 'open',
                  )
                  return (
                    <button className="picker-card" disabled={isSaving} key={visit.id} onClick={() => openVisitOrder(visit)} type="button">
                      <strong>{visit.childName}</strong>
                      <small>{visit.customerName}</small>
                      <span>Ingreso {formatVisitStartTime(visit.startedAt)}</span>
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
                  <input onChange={(event) => setManualName(event.target.value)} value={manualName} />
                </label>
                <button className="button primary" disabled={isSaving} onClick={createManualOrder} type="button">
                  Crear cuenta manual
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {checkoutVisit ? (
        <ConsolidatedCheckoutModal
          allowFinishChoice
          onClose={() => setCheckoutVisit(null)}
          orders={ordersResult.orders.filter((order) => order.visitId === checkoutVisit.id)}
          source="canteen"
          visit={checkoutVisit}
        />
      ) : null}
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

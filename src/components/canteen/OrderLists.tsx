import { useMemo, useState } from 'react'
import { Ban, CheckCircle2, Plus } from 'lucide-react'
import { StatusPill } from '../StatusPill'
import { addItemsToCanteenOrder, cancelCanteenOrder, chargeCanteenOrder } from '../../services/canteenService'
import { formatShortTime } from '../../utils/date'
import { formatGuarani, toNumber } from '../../utils/money'
import type { CanteenOrder, CanteenOrderItem, CanteenProduct, PaymentMethod } from '../../types'

interface OrderListsProps {
  orders: CanteenOrder[]
  products: CanteenProduct[]
  isLoading: boolean
  error: string | null
}

const typeLabel: Record<CanteenOrder['type'], string> = {
  visit: 'Visita',
  event: 'Evento',
  free: 'Libre',
}

const paymentLabel: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
  '': 'Sin definir',
}

function QuickAddPanel({ onAdd, products }: { products: CanteenProduct[]; onAdd: (items: CanteenOrderItem[]) => Promise<void> }) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    const product = products.find((item) => item.id === productId)
    if (!product) {
      setError('Elegí un producto.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onAdd([
        {
          productId: product.id,
          productName: product.name,
          category: product.category,
          unitPrice: product.price,
          quantity,
          subtotal: product.price * quantity,
        },
      ])
      setProductId('')
      setQuantity(1)
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'No se pudo agregar producto.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="inline-action-panel">
      {error ? <div className="form-alert error">{error}</div> : null}
      <label className="field">
        <span>Producto</span>
        <select onChange={(event) => setProductId(event.target.value)} value={productId}>
          <option value="">Seleccionar</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Cantidad</span>
        <input min={1} onChange={(event) => setQuantity(Math.max(1, toNumber(event.target.value)))} type="number" value={quantity} />
      </label>
      <button className="button primary" disabled={isSaving} onClick={add} type="button">
        Agregar
      </button>
    </div>
  )
}

export function OpenOrdersList({ error, isLoading, orders, products }: OrderListsProps) {
  const openOrders = useMemo(() => orders.filter((order) => order.status === 'open'), [orders])
  const activeProducts = products.filter((product) => product.isActive)
  const [addingTo, setAddingTo] = useState('')
  const [charging, setCharging] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''>>('cash')
  const [actionError, setActionError] = useState<string | null>(null)

  const charge = async (order: CanteenOrder) => {
    setActionError(null)
    try {
      await chargeCanteenOrder(order, paymentMethod)
      setCharging('')
    } catch (chargeError) {
      setActionError(chargeError instanceof Error ? chargeError.message : 'No se pudo cobrar.')
    }
  }

  const cancel = async (order: CanteenOrder) => {
    if (!window.confirm(`Cancelar la cuenta ${order.accountName}?`)) {
      return
    }

    setActionError(null)
    try {
      await cancelCanteenOrder(order)
    } catch (cancelError) {
      setActionError(cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar.')
    }
  }

  return (
    <article className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Cuentas abiertas</h2>
        <StatusPill tone="warning">{openOrders.length} abiertas</StatusPill>
      </div>
      {isLoading ? <div className="empty-state">Cargando cuentas...</div> : null}
      {error ? <div className="form-alert error">No se pudieron cargar cuentas: {error}</div> : null}
      {actionError ? <div className="form-alert error">{actionError}</div> : null}
      {!isLoading && !error && openOrders.length === 0 ? <div className="empty-state">No hay cuentas abiertas.</div> : null}
      <div className="module-list">
        {openOrders.map((order) => (
          <article className="canteen-order-card" key={order.id}>
            <div className="order-card-top">
              <div>
                <strong>{order.accountName}</strong>
                <p className="muted">
                  {typeLabel[order.type]} · {formatShortTime(order.createdAt)}
                </p>
              </div>
              <strong>{formatGuarani(order.total)}</strong>
            </div>
            <p className="muted">{order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}</p>
            <div className="module-actions">
              <button className="button ghost" onClick={() => setAddingTo((current) => (current === order.id ? '' : order.id))} type="button">
                <Plus size={17} />
                Agregar producto
              </button>
              <button className="button secondary" onClick={() => setCharging((current) => (current === order.id ? '' : order.id))} type="button">
                <CheckCircle2 size={17} />
                Cobrar
              </button>
              <button className="button ghost" onClick={() => cancel(order)} type="button">
                <Ban size={17} />
                Cancelar
              </button>
            </div>
            {addingTo === order.id ? (
              <QuickAddPanel products={activeProducts} onAdd={(items) => addItemsToCanteenOrder(order, items)} />
            ) : null}
            {charging === order.id ? (
              <div className="inline-action-panel">
                <label className="field">
                  <span>Método</span>
                  <select onChange={(event) => setPaymentMethod(event.target.value as Exclude<PaymentMethod, ''>)} value={paymentMethod}>
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                    <option value="qr">QR</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
                <strong>{formatGuarani(order.total)}</strong>
                <button className="button primary" onClick={() => charge(order)} type="button">
                  Confirmar
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </article>
  )
}

export function PaidOrdersTodayList({ error, isLoading, orders }: Omit<OrderListsProps, 'products'>) {
  const paidOrders = useMemo(() => orders.filter((order) => order.status === 'paid'), [orders])

  return (
    <article className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Ventas pagadas de hoy</h2>
        <StatusPill tone="available">{paidOrders.length} ventas</StatusPill>
      </div>
      {isLoading ? <div className="empty-state">Cargando ventas...</div> : null}
      {error ? <div className="form-alert error">No se pudieron cargar ventas: {error}</div> : null}
      {!isLoading && !error && paidOrders.length === 0 ? <div className="empty-state">Todavía no hay ventas cobradas hoy.</div> : null}
      <div className="module-list">
        {paidOrders.map((order) => (
          <div className="module-row" key={order.id}>
            <div>
              <strong>{order.accountName}</strong>
              <p className="muted">
                {formatShortTime(order.paidAt)} · {typeLabel[order.type]} · {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
              </p>
            </div>
            <strong>{formatGuarani(order.total)}</strong>
            <StatusPill tone="available">{paymentLabel[order.paymentMethod ?? '']}</StatusPill>
          </div>
        ))}
      </div>
    </article>
  )
}

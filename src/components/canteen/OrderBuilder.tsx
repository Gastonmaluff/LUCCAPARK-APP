import { useMemo, useState } from 'react'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { StatusPill } from '../StatusPill'
import { createCanteenOrder } from '../../services/canteenService'
import { formatGuarani, toNumber } from '../../utils/money'
import type { ActiveVisit, CanteenAccountType, CanteenOrderItem, CanteenProduct, LuccaEvent, PaymentMethod } from '../../types'

interface OrderBuilderProps {
  products: CanteenProduct[]
  activeVisits: ActiveVisit[]
  activeEvents: LuccaEvent[]
}

const paymentMethods: Array<Exclude<PaymentMethod, ''>> = ['cash', 'transfer', 'card', 'qr', 'other']

const paymentLabel: Record<Exclude<PaymentMethod, ''>, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
}

export function OrderBuilder({ activeEvents, activeVisits, products }: OrderBuilderProps) {
  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products])
  const [type, setType] = useState<CanteenAccountType>('free')
  const [visitId, setVisitId] = useState('')
  const [eventId, setEventId] = useState('')
  const [freeName, setFreeName] = useState('Cliente mostrador')
  const [notes, setNotes] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [items, setItems] = useState<CanteenOrderItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''>>('cash')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const selectedVisit = activeVisits.find((visit) => visit.id === visitId)
  const selectedEvent = activeEvents.find((event) => event.id === eventId)
  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  const addProduct = () => {
    const product = activeProducts.find((item) => item.id === productId)

    if (!product || quantity <= 0) {
      setMessage('Elegí producto y cantidad.')
      return
    }

    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id)
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity, subtotal: (item.quantity + quantity) * item.unitPrice }
            : item,
        )
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          category: product.category,
          unitPrice: product.price,
          quantity,
          subtotal: product.price * quantity,
        },
      ]
    })
    setMessage(null)
  }

  const removeProduct = (itemId: string) => {
    setItems((current) => current.filter((item) => item.productId !== itemId))
  }

  const resolveAccount = () => {
    if (type === 'visit') {
      return {
        accountName: selectedVisit ? selectedVisit.childName : '',
        customerName: selectedVisit?.customerName ?? '',
        customerPhone: selectedVisit?.customerPhone ?? '',
      }
    }

    if (type === 'event') {
      return {
        accountName: selectedEvent ? selectedEvent.title : '',
        customerName: selectedEvent?.customerName ?? '',
        customerPhone: selectedEvent?.customerPhone ?? '',
      }
    }

    return {
      accountName: freeName,
      customerName: freeName,
      customerPhone: '',
    }
  }

  const saveOrder = async (chargeNow: boolean) => {
    setMessage(null)
    const account = resolveAccount()

    if (!account.accountName.trim()) {
      setMessage('Seleccioná o cargá una cuenta.')
      return
    }

    if (items.length === 0) {
      setMessage('Agregá al menos un producto.')
      return
    }

    setIsSaving(true)
    try {
      await createCanteenOrder({
        type,
        visitId: type === 'visit' ? visitId : '',
        eventId: type === 'event' ? eventId : '',
        ...account,
        items,
        notes,
        chargeNow,
        paymentMethod,
      })
      setItems([])
      setNotes('')
      setMessage(chargeNow ? 'Venta cobrada.' : 'Cuenta abierta guardada.')
    } catch (orderError) {
      setMessage(orderError instanceof Error ? orderError.message : 'No se pudo guardar la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <Receipt color="var(--orange)" />
          Nueva cuenta
        </h2>
        <StatusPill tone="info">{formatGuarani(total)}</StatusPill>
      </div>

      <div className="order-type-switch">
        {(['free', 'visit', 'event'] as CanteenAccountType[]).map((item) => (
          <button className={type === item ? 'active' : ''} key={item} onClick={() => setType(item)} type="button">
            {item === 'free' ? 'Libre' : item === 'visit' ? 'Visita' : 'Evento'}
          </button>
        ))}
      </div>

      {message ? <div className={message.includes('No se') || message.includes('Elegí') || message.includes('Seleccioná') || message.includes('Agregá') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}

      <div className="form-grid">
        {type === 'visit' ? (
          <label className="field">
            <span>Visita activa</span>
            <select onChange={(event) => setVisitId(event.target.value)} value={visitId}>
              <option value="">Seleccionar visita</option>
              {activeVisits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {visit.childName} - {visit.customerName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === 'event' ? (
          <label className="field">
            <span>Evento activo</span>
            <select onChange={(event) => setEventId(event.target.value)} value={eventId}>
              <option value="">Seleccionar evento</option>
              {activeEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === 'free' ? (
          <label className="field">
            <span>Nombre de cuenta</span>
            <input onChange={(event) => setFreeName(event.target.value)} value={freeName} />
          </label>
        ) : null}

        <div className="form-inline">
          <label className="field">
            <span>Producto</span>
            <select onChange={(event) => setProductId(event.target.value)} value={productId}>
              <option value="">Seleccionar producto</option>
              {activeProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {formatGuarani(product.price)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cantidad</span>
            <input min={1} onChange={(event) => setQuantity(Math.max(1, toNumber(event.target.value)))} type="number" value={quantity} />
          </label>
        </div>

        <button className="button secondary" onClick={addProduct} type="button">
          <Plus size={17} />
          Agregar producto
        </button>

        <div className="cart-list">
          {items.length === 0 ? <div className="empty-state">El carrito está vacío.</div> : null}
          {items.map((item) => (
            <div className="cart-row" key={item.productId}>
              <span>
                <strong>{item.productName}</strong>
                <small>
                  {item.quantity} x {formatGuarani(item.unitPrice)}
                </small>
              </span>
              <strong>{formatGuarani(item.subtotal)}</strong>
              <button className="icon-button" onClick={() => removeProduct(item.productId)} type="button" aria-label={`Quitar ${item.productName}`}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>

        <label className="field">
          <span>Notas</span>
          <textarea onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />
        </label>

        <label className="field">
          <span>Forma de pago si cobra ahora</span>
          <select onChange={(event) => setPaymentMethod(event.target.value as Exclude<PaymentMethod, ''>)} value={paymentMethod}>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {paymentLabel[method]}
              </option>
            ))}
          </select>
        </label>

        <div className="module-actions">
          <button className="button ghost" disabled={isSaving} onClick={() => saveOrder(false)} type="button">
            Guardar abierta
          </button>
          <button className="button primary" disabled={isSaving} onClick={() => saveOrder(true)} type="button">
            Cobrar ahora
          </button>
        </div>
      </div>
    </article>
  )
}

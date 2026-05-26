import { useMemo, useState } from 'react'
import { CreditCard, X } from 'lucide-react'
import { chargeCanteenOrder } from '../../services/canteenService'
import { checkoutVisitBalance } from '../../services/checkoutService'
import { formatGuarani } from '../../utils/money'
import { getVisitBillingSummary } from '../../utils/visitBilling'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'
import { StatusPill } from '../StatusPill'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../../types'

const orderTypeLabel: Record<CanteenOrder['type'], string> = {
  visit: 'Visita',
  event: 'Evento',
  free: 'Otro',
}

type CanteenCheckoutModalProps = {
  onClose: () => void
  onDone: (total: number, paymentMethod: Exclude<PaymentMethod, ''>) => void
  order: CanteenOrder
  relatedOrders: CanteenOrder[]
  visit?: ActiveVisit | null
}

export function CanteenCheckoutModal({ onClose, onDone, order, relatedOrders, visit }: CanteenCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [cardType, setCardType] = useState<'debit' | 'credit' | ''>('')
  const [finishVisit, setFinishVisit] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visitSummary = useMemo(() => (visit ? getVisitBillingSummary(visit, relatedOrders) : null), [relatedOrders, visit])
  const productOrders = visitSummary ? visitSummary.openCanteenOrders : [order]
  const productLines = productOrders.flatMap((canteenOrder) => canteenOrder.items)
  const canteenTotal = visitSummary ? visitSummary.pendingCanteenAmount : order.total
  const parkPending = visitSummary ? visitSummary.pendingParkAmount : 0
  const totalToCharge = visitSummary ? visitSummary.totalPendingAmount : order.total
  const canConfirm = Boolean(paymentMethod) && (paymentMethod !== 'card' || Boolean(cardType)) && totalToCharge > 0 && !isSaving

  const confirmCharge = async () => {
    if (!paymentMethod) {
      setError('Selecciona un metodo de pago para continuar.')
      return
    }

    if (paymentMethod === 'card' && !cardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }

    if (finishVisit && visit && !window.confirm('Ademas del cobro, se va a finalizar la visita. Confirmas la salida?')) {
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      if (visit && visitSummary) {
        await checkoutVisitBalance({
          visit,
          orders: relatedOrders,
          paymentMethod,
          cardType,
          source: 'canteen',
          finishVisit,
        })
      } else {
        await chargeCanteenOrder(order, paymentMethod, cardType)
      }

      onDone(totalToCharge, paymentMethod)
      onClose()
    } catch (chargeError) {
      console.error('[Cantina] No se pudo registrar el cobro', chargeError)
      setError('No se pudo registrar el cobro. Intenta nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card canteen-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="canteen-checkout-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Revision final</span>
            <h2 id="canteen-checkout-title">Confirmar cobro</h2>
            <p>
              {order.accountName}
              {order.customerName ? ` · ${order.customerName}` : ''}
            </p>
          </div>
          <div className="modal-header-actions">
            <StatusPill tone="info">{orderTypeLabel[order.type]}</StatusPill>
            <button className="icon-button" disabled={isSaving} onClick={onClose} type="button" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="checkout-detail-list">
          {visitSummary ? (
            <div className="checkout-line">
              <span>
                <strong>Parque</strong>
                <small>{visitSummary.pendingParkAmount > 0 ? visit?.planName ?? 'Parque' : 'Pagado'}</small>
              </span>
              <strong>{visitSummary.pendingParkAmount > 0 ? formatGuarani(parkPending) : 'Pagado'}</strong>
            </div>
          ) : null}

          {productLines.length === 0 ? <div className="empty-state">Esta cuenta no tiene productos cargados.</div> : null}
          {productLines.map((item) => (
            <div className="checkout-line" key={`${item.productId}-${item.productName}`}>
              <span>
                <strong>
                  {item.productName} x{item.quantity}
                </strong>
                <small>{formatGuarani(item.unitPrice)} c/u</small>
              </span>
              <strong>{formatGuarani(item.subtotal)}</strong>
            </div>
          ))}

          {visitSummary && canteenTotal <= 0 ? (
            <div className="checkout-line">
              <span>
                <strong>Cantina</strong>
                <small>Sin pendiente</small>
              </span>
              <strong>Pagado</strong>
            </div>
          ) : null}
        </div>

        {visit ? (
          <label className="checkout-finish-visit">
            <input checked={finishVisit} disabled={isSaving} onChange={(event) => setFinishVisit(event.target.checked)} type="checkbox" />
            <span>El cliente se retira ahora</span>
          </label>
        ) : null}

        <div className="checkout-total-bar">
          <span>Total a cobrar</span>
          <strong>{formatGuarani(totalToCharge)}</strong>
        </div>

        <PaymentMethodSelector
          cardType={cardType}
          disabled={isSaving}
          onCardTypeChange={setCardType}
          onPaymentMethodChange={setPaymentMethod}
          paymentMethod={paymentMethod}
        />

        {error ? <div className="form-alert error">{error}</div> : null}

        <div className="modal-actions">
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" disabled={!canConfirm} onClick={confirmCharge} type="button">
            <CreditCard size={18} />
            {isSaving ? 'Procesando cobro...' : 'Confirmar cobro'}
          </button>
        </div>
      </section>
    </div>
  )
}

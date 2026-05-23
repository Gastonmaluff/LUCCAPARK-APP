import { useState } from 'react'
import { CreditCard, X } from 'lucide-react'
import { checkoutVisitBalance } from '../../services/checkoutService'
import { formatGuarani } from '../../utils/money'
import { getVisitBillingSummary } from '../../utils/visitBilling'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../../types'

interface ConsolidatedCheckoutModalProps {
  source: 'reception' | 'canteen'
  visit: ActiveVisit
  orders: CanteenOrder[]
  finishByDefault?: boolean
  allowFinishChoice?: boolean
  onClose: () => void
  onDone?: () => void
}

const paymentMethods: Array<Exclude<PaymentMethod, ''>> = ['cash', 'transfer', 'card', 'qr', 'other']

const paymentLabel: Record<Exclude<PaymentMethod, ''>, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
}

export function ConsolidatedCheckoutModal({
  allowFinishChoice = false,
  finishByDefault = false,
  onClose,
  onDone,
  orders,
  source,
  visit,
}: ConsolidatedCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''>>('cash')
  const [cardType, setCardType] = useState<'debit' | 'credit' | ''>('')
  const [finishVisit, setFinishVisit] = useState(finishByDefault)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const summary = getVisitBillingSummary(visit, orders)

  const confirmCheckout = async () => {
    if (paymentMethod === 'card' && !cardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }

    if (summary.totalPendingAmount <= 0 && !finishVisit) {
      onClose()
      return
    }

    if (allowFinishChoice && finishVisit && !window.confirm(`Cobrar y finalizar la visita de ${visit.childName}?`)) {
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      await checkoutVisitBalance({
        visit,
        orders,
        paymentMethod,
        cardType,
        source,
        finishVisit,
      })
      onDone?.()
      onClose()
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'No se pudo cobrar la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card checkout-modal" role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Cobro consolidado</p>
            <h2>{visit.childName}</h2>
            <p className="muted">Responsable: {visit.customerName}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button" aria-label="Cerrar cobro">
            <X size={18} />
            Cerrar
          </button>
        </div>

        {error ? <div className="form-alert error">{error}</div> : null}

        <div className="checkout-block">
          <h3>Parque</h3>
          <div className="checkout-line">
            <span>{visit.planName}</span>
            <strong>{summary.pendingParkAmount > 0 ? formatGuarani(summary.pendingParkAmount) : 'Pagado'}</strong>
          </div>
        </div>

        <div className="checkout-block">
          <h3>Cantina</h3>
          {summary.openCanteenOrders.length === 0 ? <div className="checkout-line muted-line">Sin consumo pendiente</div> : null}
          {summary.openCanteenOrders.flatMap((order) =>
            order.items.map((item) => (
              <div className="checkout-line" key={`${order.id}-${item.productId}`}>
                <span>
                  {item.productName} x{item.quantity}
                </span>
                <strong>{formatGuarani(item.subtotal)}</strong>
              </div>
            )),
          )}
          <div className="checkout-line subtotal">
            <span>Subtotal cantina</span>
            <strong>{formatGuarani(summary.pendingCanteenAmount)}</strong>
          </div>
        </div>

        <div className="checkout-total">
          <span>Total pendiente</span>
          <strong>{formatGuarani(summary.totalPendingAmount)}</strong>
        </div>

        <div className="checkout-payment-grid">
          <label className="field">
            <span>Forma de pago</span>
            <select onChange={(event) => setPaymentMethod(event.target.value as Exclude<PaymentMethod, ''>)} value={paymentMethod}>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {paymentLabel[method]}
                </option>
              ))}
            </select>
          </label>
          {paymentMethod === 'card' ? (
            <label className="field">
              <span>Tipo de tarjeta</span>
              <select onChange={(event) => setCardType(event.target.value as 'debit' | 'credit' | '')} value={cardType}>
                <option value="">Seleccionar</option>
                <option value="debit">Debito</option>
                <option value="credit">Credito</option>
              </select>
            </label>
          ) : null}
        </div>

        {allowFinishChoice ? (
          <label className="field inline-check checkout-finish-check">
            <input checked={finishVisit} onChange={(event) => setFinishVisit(event.target.checked)} type="checkbox" />
            El cliente se retira ahora
          </label>
        ) : null}

        <div className="module-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" disabled={isSaving || (summary.totalPendingAmount <= 0 && !finishVisit)} onClick={confirmCheckout} type="button">
            <CreditCard size={18} />
            {finishVisit ? 'Cobrar y finalizar' : 'Confirmar cobro'}
          </button>
        </div>
      </section>
    </div>
  )
}

import { useState } from 'react'
import { CreditCard, X } from 'lucide-react'
import { checkoutVisitGroupBalance } from '../../services/checkoutService'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../../types'
import { formatGuarani } from '../../utils/money'
import { getVisitGroupBillingSummary, getVisitParkChargeAmount } from '../../utils/visitBilling'
import { formatGroupChildNames } from '../../utils/visitGroups'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'

interface ConsolidatedGroupCheckoutModalProps {
  visits: ActiveVisit[]
  orders: CanteenOrder[]
  finishByDefault?: boolean
  source: 'reception' | 'canteen'
  onClose: () => void
  onDone?: () => void
}

export function ConsolidatedGroupCheckoutModal({
  finishByDefault = true,
  onClose,
  onDone,
  orders,
  source,
  visits,
}: ConsolidatedGroupCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [cardType, setCardType] = useState<'debit' | 'credit' | ''>('')
  const [finishVisits, setFinishVisits] = useState(finishByDefault)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const summary = getVisitGroupBillingSummary(visits, orders)
  const title = formatGroupChildNames(visits)

  const confirmCheckout = async () => {
    if (!paymentMethod && summary.totalPendingAmount > 0) {
      setError('Seleccioná un método de pago.')
      return
    }

    if (paymentMethod === 'card' && !cardType) {
      setError('Seleccioná si la tarjeta es débito o crédito.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      await checkoutVisitGroupBalance({
        visits,
        orders,
        paymentMethod: paymentMethod || 'cash',
        cardType,
        source,
        finishVisits,
      })
      onDone?.()
      onClose()
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'No se pudo cobrar el grupo.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card checkout-modal" role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Cobro grupal</p>
            <h2>{title}</h2>
            <p className="muted">Responsable: {visits[0]?.customerName || 'Sin responsable'}</p>
          </div>
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button" aria-label="Cerrar cobro">
            <X size={18} />
            Cerrar
          </button>
        </div>

        {error ? <div className="form-alert error">{error}</div> : null}

        <div className="checkout-block">
          <h3>Entradas del parque</h3>
          {visits.map((visit) => (
            <div className="checkout-line" key={visit.id}>
              <span>
                <strong>{visit.childName}</strong>
                <small>{visit.planName}</small>
              </span>
              <strong>{formatGuarani(getVisitParkChargeAmount(visit))}</strong>
            </div>
          ))}
        </div>

        <div className="checkout-block">
          <h3>Cantina compartida</h3>
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

        <PaymentMethodSelector
          cardType={cardType}
          disabled={isSaving}
          onCardTypeChange={setCardType}
          onPaymentMethodChange={setPaymentMethod}
          paymentMethod={paymentMethod}
        />

        <label className="field inline-check checkout-finish-check">
          <input checked={finishVisits} disabled={isSaving} onChange={(event) => setFinishVisits(event.target.checked)} type="checkbox" />
          Finalizar todas las visitas del grupo
        </label>

        <div className="module-actions">
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={isSaving || (!paymentMethod && summary.totalPendingAmount > 0) || (summary.totalPendingAmount <= 0 && !finishVisits)}
            onClick={confirmCheckout}
            type="button"
          >
            <CreditCard size={18} />
            {finishVisits ? `Cobrar y finalizar ${visits.length} visitas` : 'Confirmar cobro'}
          </button>
        </div>
      </section>
    </div>
  )
}

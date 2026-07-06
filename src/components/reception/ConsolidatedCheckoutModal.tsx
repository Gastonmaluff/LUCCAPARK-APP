import { useMemo, useState } from 'react'
import { CreditCard, X } from 'lucide-react'
import { checkoutVisitBalance } from '../../services/checkoutService'
import { useVisitPricing } from '../../hooks/useVisitPricing'
import { formatGuarani } from '../../utils/money'
import { formatElapsedMinutes, getUnlimitedPricingPreview, isPendingUnlimitedVisit } from '../../utils/unlimitedPricing'
import { getVisitBillingSummary } from '../../utils/visitBilling'
import { formatVisitStartTime } from '../../utils/visitTime'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'
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

export function ConsolidatedCheckoutModal({
  allowFinishChoice = false,
  finishByDefault = false,
  onClose,
  onDone,
  orders,
  source,
  visit,
}: ConsolidatedCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [cardType, setCardType] = useState<'debit' | 'credit' | ''>('')
  const [finishVisit, setFinishVisit] = useState(finishByDefault)
  const [unlimitedFinalAmount, setUnlimitedFinalAmount] = useState('')
  const [unlimitedReason, setUnlimitedReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pricing = useVisitPricing()
  const summary = getVisitBillingSummary(visit, orders)
  const closeTime = useMemo(() => new Date(), [])
  const hasPendingUnlimited = isPendingUnlimitedVisit(visit)
  const unlimitedPreview = hasPendingUnlimited ? getUnlimitedPricingPreview(visit, pricing.config.unlimitedHourlyRate, closeTime) : null
  const unlimitedFinalValue = hasPendingUnlimited ? Number(unlimitedFinalAmount || unlimitedPreview?.suggestedAmount || 0) : 0
  const unlimitedDifference = unlimitedPreview ? unlimitedFinalValue - unlimitedPreview.suggestedAmount : 0
  const totalPendingAmount = summary.totalPendingAmount + (finishVisit && hasPendingUnlimited ? unlimitedFinalValue : 0)

  const confirmCheckout = async () => {
    if (hasPendingUnlimited && !finishVisit) {
      setError('El plan libre se cobra al finalizar la visita.')
      return
    }

    if (hasPendingUnlimited && !unlimitedPreview) {
      setError(pricing.error || 'Configura la tarifa por hora del plan libre antes de cobrar.')
      return
    }

    if (hasPendingUnlimited && (!Number.isFinite(unlimitedFinalValue) || unlimitedFinalValue <= 0)) {
      setError('El monto final del plan libre debe ser mayor a cero.')
      return
    }

    if (hasPendingUnlimited && unlimitedDifference !== 0 && !unlimitedReason.trim()) {
      setError('Indica el motivo del ajuste del plan libre.')
      return
    }

    if (!paymentMethod && totalPendingAmount > 0) {
      setError('Selecciona un metodo de pago.')
      return
    }

    if (paymentMethod === 'card' && !cardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }

    if (totalPendingAmount <= 0 && !finishVisit) {
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
        paymentMethod: paymentMethod || 'cash',
        cardType,
        source,
        finishVisit,
        unlimitedAdjustments: hasPendingUnlimited
          ? { [visit.id]: { finalAmount: unlimitedFinalValue, reason: unlimitedReason.trim() } }
          : undefined,
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
            <strong>
              {hasPendingUnlimited
                ? 'Monto a definir al finalizar'
                : summary.pendingParkAmount > 0
                  ? formatGuarani(summary.pendingParkAmount)
                  : 'Pagado'}
            </strong>
          </div>

          {hasPendingUnlimited ? (
            <div className="unlimited-checkout-box">
              <div className="checkout-line">
                <span>Hora de ingreso</span>
                <strong>{formatVisitStartTime(visit.startedAt)}</strong>
              </div>
              <div className="checkout-line">
                <span>Hora de salida</span>
                <strong>{formatVisitStartTime(closeTime)}</strong>
              </div>
              <div className="checkout-line">
                <span>Tiempo transcurrido</span>
                <strong>{unlimitedPreview ? formatElapsedMinutes(unlimitedPreview.elapsedMinutes) : 'Sin tarifa'}</strong>
              </div>
              <div className="checkout-line">
                <span>Horas facturables</span>
                <strong>{unlimitedPreview ? unlimitedPreview.billableHours : '-'}</strong>
              </div>
              <div className="checkout-line">
                <span>Tarifa por hora</span>
                <strong>{unlimitedPreview ? formatGuarani(unlimitedPreview.hourlyRate) : 'Configurar'}</strong>
              </div>
              <div className="checkout-line subtotal">
                <span>Importe sugerido</span>
                <strong>{unlimitedPreview ? formatGuarani(unlimitedPreview.suggestedAmount) : '-'}</strong>
              </div>
              <label className="field">
                <span>Monto final a cobrar</span>
                <input
                  min={1}
                  onChange={(event) => setUnlimitedFinalAmount(event.target.value)}
                  placeholder={unlimitedPreview ? String(unlimitedPreview.suggestedAmount) : ''}
                  type="number"
                  value={unlimitedFinalAmount}
                />
              </label>
              {unlimitedDifference !== 0 ? (
                <label className="field">
                  <span>Motivo del ajuste *</span>
                  <textarea
                    onChange={(event) => setUnlimitedReason(event.target.value)}
                    placeholder="Autorizacion del dueno, tarifa VIP acordada..."
                    rows={2}
                    value={unlimitedReason}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
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
          <strong>{formatGuarani(totalPendingAmount)}</strong>
        </div>

        <PaymentMethodSelector
          cardType={cardType}
          disabled={isSaving}
          onCardTypeChange={setCardType}
          onPaymentMethodChange={setPaymentMethod}
          paymentMethod={paymentMethod}
        />

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
          <button
            className="button primary"
            disabled={isSaving || (!paymentMethod && totalPendingAmount > 0) || (totalPendingAmount <= 0 && !finishVisit)}
            onClick={confirmCheckout}
            type="button"
          >
            <CreditCard size={18} />
            {finishVisit ? 'Cobrar y finalizar' : 'Confirmar cobro'}
          </button>
        </div>
      </section>
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { CreditCard, Wallet, X } from 'lucide-react'
import { checkoutVisitBalance, registerPartialPayment } from '../../services/checkoutService'
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

const newClientPaymentId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `partial-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

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
  const [notice, setNotice] = useState<string | null>(null)
  // Modo de pago parcial: 'park' precarga el saldo del parque; 'general' permite un monto libre.
  const [partialMode, setPartialMode] = useState<'park' | 'general' | null>(null)
  const [partialAmount, setPartialAmount] = useState('')
  const [partialNote, setPartialNote] = useState('')
  // Se genera en openPartial (siempre previo a confirmar) para evitar llamadas impuras en render.
  const clientPaymentIdRef = useRef('')
  const pricing = useVisitPricing()
  const summary = getVisitBillingSummary(visit, orders)
  const closeTime = useMemo(() => new Date(), [])
  const hasPendingUnlimited = isPendingUnlimitedVisit(visit)
  const unlimitedPreview = hasPendingUnlimited ? getUnlimitedPricingPreview(visit, pricing.config.unlimitedHourlyRate, closeTime) : null
  const unlimitedFinalValue = hasPendingUnlimited ? Number(unlimitedFinalAmount || unlimitedPreview?.suggestedAmount || 0) : 0
  const unlimitedDifference = unlimitedPreview ? unlimitedFinalValue - unlimitedPreview.suggestedAmount : 0
  const totalPendingAmount = summary.totalPendingAmount + (finishVisit && hasPendingUnlimited ? unlimitedFinalValue : 0)
  const totalCharges = summary.totalPaidAmount + summary.totalPendingAmount

  // El pago parcial no aplica a un plan libre aun sin tarifar (se cobra al finalizar).
  const canPartialPay = !hasPendingUnlimited && summary.totalPendingAmount > 0
  const canChargeParkOnly = canPartialPay && summary.pendingParkAmount > 0
  const partialMax = partialMode === 'park' ? summary.pendingParkAmount : summary.totalPendingAmount
  const partialValue = Number(partialAmount || 0)
  const partialRemaining = Math.max(0, summary.totalPendingAmount - (Number.isFinite(partialValue) ? partialValue : 0))

  const openPartial = (mode: 'park' | 'general') => {
    setError(null)
    setNotice(null)
    clientPaymentIdRef.current = newClientPaymentId()
    setPartialMode(mode)
    setPartialAmount(mode === 'park' ? String(summary.pendingParkAmount) : '')
    setPartialNote('')
  }

  const confirmPartial = async () => {
    if (!partialMode) return
    const amount = Math.round(partialValue)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresa un monto mayor a cero.')
      return
    }
    if (amount > partialMax) {
      setError('El monto supera el saldo pendiente.')
      return
    }
    if (!paymentMethod) {
      setError('Selecciona un metodo de pago.')
      return
    }
    if (paymentMethod === 'card' && !cardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const result = await registerPartialPayment({
        visits: [visit],
        amount,
        paymentMethod,
        cardType,
        target: partialMode,
        note: partialNote.trim(),
        clientPaymentId: clientPaymentIdRef.current,
      })
      onDone?.()
      setPartialMode(null)
      setPartialAmount('')
      setPartialNote('')
      setNotice(
        result.balanceAfter > 0
          ? `Pago registrado. La cuenta continua abierta con un saldo pendiente de ${formatGuarani(result.balanceAfter)}.`
          : 'Pago registrado. La cuenta queda con saldo Gs. 0 y continua abierta mientras la visita siga activa.',
      )
    } catch (partialError) {
      setError(partialError instanceof Error ? partialError.message : 'No se pudo registrar el pago parcial.')
    } finally {
      setIsSaving(false)
    }
  }

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
            <h2>
              {visit.childName}
              {visit.isBaby ? <span className="baby-tag" style={{ marginLeft: 8 }}>BEBÉ</span> : null}
            </h2>
            <p className="muted">Responsable: {visit.customerName}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button" aria-label="Cerrar cobro">
            <X size={18} />
            Cerrar
          </button>
        </div>

        {error ? <div className="form-alert error">{error}</div> : null}
        {notice ? <div className="form-alert success">{notice}</div> : null}

        <div className="checkout-block">
          <h3>Parque</h3>
          <div className="checkout-line">
            <span>{visit.planName}</span>
            <strong>
              {visit.isBaby
                ? 'Entrada gratuita (Gs. 0)'
                : hasPendingUnlimited
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
            <span>Saldo cantina</span>
            <strong>{formatGuarani(summary.pendingCanteenAmount)}</strong>
          </div>
        </div>

        <div className="checkout-block checkout-balance-summary">
          <div className="checkout-line">
            <span>Total acumulado</span>
            <strong>{formatGuarani(totalCharges)}</strong>
          </div>
          {summary.totalPaidAmount > 0 ? (
            <div className="checkout-line">
              <span>Pagado anteriormente</span>
              <strong>{formatGuarani(summary.totalPaidAmount)}</strong>
            </div>
          ) : null}
        </div>

        <div className="checkout-total">
          <span>Saldo pendiente actual</span>
          <strong>{formatGuarani(totalPendingAmount)}</strong>
        </div>

        {partialMode ? (
          <div className="checkout-block partial-payment-box">
            <h3>{partialMode === 'park' ? 'Cobrar entrada del parque' : 'Registrar pago parcial'}</h3>
            <div className="checkout-line">
              <span>Saldo actual</span>
              <strong>{formatGuarani(summary.totalPendingAmount)}</strong>
            </div>
            <label className="field">
              <span>Monto a pagar ahora</span>
              <input
                disabled={isSaving}
                max={partialMax}
                min={1}
                onChange={(event) => setPartialAmount(event.target.value)}
                type="number"
                value={partialAmount}
              />
              {partialMode === 'park' ? <small>Precargado con el saldo pendiente del parque.</small> : null}
            </label>
            <label className="field">
              <span>Observación (opcional)</span>
              <input disabled={isSaving} onChange={(event) => setPartialNote(event.target.value)} value={partialNote} />
            </label>
            <div className="checkout-line subtotal">
              <span>Saldo restante</span>
              <strong>{formatGuarani(partialRemaining)}</strong>
            </div>
            <PaymentMethodSelector
              cardType={cardType}
              disabled={isSaving}
              onCardTypeChange={setCardType}
              onPaymentMethodChange={setPaymentMethod}
              paymentMethod={paymentMethod}
            />
            <div className="module-actions">
              <button className="button ghost" disabled={isSaving} onClick={() => setPartialMode(null)} type="button">
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={isSaving || !paymentMethod || partialValue <= 0 || partialValue > partialMax}
                onClick={confirmPartial}
                type="button"
              >
                <Wallet size={18} />
                Confirmar pago parcial
              </button>
            </div>
          </div>
        ) : (
          <>
            {canPartialPay ? (
              <div className="checkout-partial-actions">
                {canChargeParkOnly ? (
                  <button className="button secondary" disabled={isSaving} onClick={() => openPartial('park')} type="button">
                    Cobrar entrada del parque
                  </button>
                ) : null}
                <button className="button ghost" disabled={isSaving} onClick={() => openPartial('general')} type="button">
                  Registrar pago parcial
                </button>
              </div>
            ) : null}

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
                Cerrar
              </button>
              <button
                className="button primary"
                disabled={isSaving || (!paymentMethod && totalPendingAmount > 0) || (totalPendingAmount <= 0 && !finishVisit)}
                onClick={confirmCheckout}
                type="button"
              >
                <CreditCard size={18} />
                {finishVisit ? 'Cobrar y finalizar' : 'Cobrar saldo completo'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

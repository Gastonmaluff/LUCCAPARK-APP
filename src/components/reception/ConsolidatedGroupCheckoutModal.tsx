import { useMemo, useState } from 'react'
import { CreditCard, X } from 'lucide-react'
import { checkoutVisitGroupBalance, type UnlimitedCheckoutAdjustments } from '../../services/checkoutService'
import { useVisitPricing } from '../../hooks/useVisitPricing'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../../types'
import { formatGuarani } from '../../utils/money'
import { formatElapsedMinutes, getUnlimitedPricingPreview, isPendingUnlimitedVisit } from '../../utils/unlimitedPricing'
import { getVisitGroupBillingSummary, getVisitParkChargeAmount } from '../../utils/visitBilling'
import { formatGroupChildNames } from '../../utils/visitGroups'
import { formatVisitStartTime } from '../../utils/visitTime'
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
  const [unlimitedFinalAmounts, setUnlimitedFinalAmounts] = useState<Record<string, string>>({})
  const [unlimitedReasons, setUnlimitedReasons] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pricing = useVisitPricing()
  const closeTime = useMemo(() => new Date(), [])
  const summary = getVisitGroupBillingSummary(visits, orders)
  const title = formatGroupChildNames(visits)
  const pendingUnlimitedVisits = visits.filter(isPendingUnlimitedVisit)
  const previewFor = (visit: ActiveVisit) => getUnlimitedPricingPreview(visit, pricing.config.unlimitedHourlyRate, closeTime)
  const finalValueFor = (visit: ActiveVisit) => {
    const preview = previewFor(visit)
    return Number(unlimitedFinalAmounts[visit.id] || preview?.suggestedAmount || 0)
  }
  const unlimitedTotal = finishVisits
    ? pendingUnlimitedVisits.reduce((sum, visit) => sum + finalValueFor(visit), 0)
    : 0
  const totalPendingAmount = summary.totalPendingAmount + unlimitedTotal

  const buildUnlimitedAdjustments = (): UnlimitedCheckoutAdjustments => {
    const adjustments: UnlimitedCheckoutAdjustments = {}
    pendingUnlimitedVisits.forEach((visit) => {
      adjustments[visit.id] = {
        finalAmount: finalValueFor(visit),
        reason: (unlimitedReasons[visit.id] ?? '').trim(),
      }
    })
    return adjustments
  }

  const confirmCheckout = async () => {
    if (pendingUnlimitedVisits.length > 0 && !finishVisits) {
      setError('El plan libre se cobra al finalizar la visita.')
      return
    }

    for (const visit of pendingUnlimitedVisits) {
      const preview = previewFor(visit)
      const finalValue = finalValueFor(visit)
      const reason = (unlimitedReasons[visit.id] ?? '').trim()
      if (!preview) {
        setError(pricing.error || 'Configura la tarifa por hora del plan libre antes de cobrar.')
        return
      }
      if (!Number.isFinite(finalValue) || finalValue <= 0) {
        setError(`El monto final de ${visit.childName} debe ser mayor a cero.`)
        return
      }
      if (finalValue !== preview.suggestedAmount && !reason) {
        setError(`Indica el motivo del ajuste de ${visit.childName}.`)
        return
      }
    }

    if (!paymentMethod && totalPendingAmount > 0) {
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
      await checkoutVisitGroupBalance({
        visits,
        orders,
        paymentMethod: paymentMethod || 'cash',
        cardType,
        source,
        finishVisits,
        unlimitedAdjustments: pendingUnlimitedVisits.length > 0 ? buildUnlimitedAdjustments() : undefined,
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
          {visits.map((visit) => {
            const preview = previewFor(visit)
            const finalValue = finalValueFor(visit)
            const difference = preview ? finalValue - preview.suggestedAmount : 0
            return (
              <div className="checkout-group-visit" key={visit.id}>
                <div className="checkout-line">
                  <span>
                    <strong>{visit.childName}</strong>
                    <small>{visit.planName}</small>
                  </span>
                  <strong>{isPendingUnlimitedVisit(visit) ? 'A definir' : formatGuarani(getVisitParkChargeAmount(visit))}</strong>
                </div>
                {isPendingUnlimitedVisit(visit) ? (
                  <div className="unlimited-checkout-box">
                    <div className="checkout-line">
                      <span>Ingreso / salida</span>
                      <strong>{formatVisitStartTime(visit.startedAt)} - {formatVisitStartTime(closeTime)}</strong>
                    </div>
                    <div className="checkout-line">
                      <span>Tiempo total</span>
                      <strong>{preview ? formatElapsedMinutes(preview.elapsedMinutes) : 'Sin tarifa'}</strong>
                    </div>
                    <div className="checkout-line">
                      <span>Horas facturables</span>
                      <strong>{preview ? preview.billableHours : '-'}</strong>
                    </div>
                    <div className="checkout-line">
                      <span>Tarifa / sugerido</span>
                      <strong>{preview ? `${formatGuarani(preview.hourlyRate)} / ${formatGuarani(preview.suggestedAmount)}` : 'Configurar'}</strong>
                    </div>
                    <label className="field">
                      <span>Monto final a cobrar</span>
                      <input
                        min={1}
                        onChange={(event) => setUnlimitedFinalAmounts((current) => ({ ...current, [visit.id]: event.target.value }))}
                        placeholder={preview ? String(preview.suggestedAmount) : ''}
                        type="number"
                        value={unlimitedFinalAmounts[visit.id] ?? ''}
                      />
                    </label>
                    {difference !== 0 ? (
                      <label className="field">
                        <span>Motivo del ajuste *</span>
                        <textarea
                          onChange={(event) => setUnlimitedReasons((current) => ({ ...current, [visit.id]: event.target.value }))}
                          placeholder="Autorizacion del dueno, tarifa VIP acordada..."
                          rows={2}
                          value={unlimitedReasons[visit.id] ?? ''}
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
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
          <strong>{formatGuarani(totalPendingAmount)}</strong>
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
            disabled={isSaving || (!paymentMethod && totalPendingAmount > 0) || (totalPendingAmount <= 0 && !finishVisits)}
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

import { Baby, CheckCircle2, CreditCard, Eye, LogOut } from 'lucide-react'
import { useState } from 'react'
import { chargeVisit, finishVisit } from '../../services/visitService'
import type { ActiveVisit, PaymentMethod } from '../../types'
import { formatVisitStartTime } from '../../utils/visitTime'
import { PaymentBadge } from './PaymentBadge'
import { TimeBadge } from './TimeBadge'

const paymentMethodLabel: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
  '': 'Sin definir',
}

interface VisitCardProps {
  visit: ActiveVisit
}

export function VisitCard({ visit }: VisitCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isCharging, setIsCharging] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''>>(
    visit.paymentMethod ? visit.paymentMethod : 'cash',
  )
  const [amountCharged, setAmountCharged] = useState(visit.amountCharged ? String(visit.amountCharged) : '')
  const [isSavingAction, setIsSavingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleCharge = async () => {
    setActionError(null)
    setIsSavingAction(true)

    try {
      await chargeVisit(visit, {
        paymentMethod,
        amountCharged: amountCharged ? Number(amountCharged) : null,
      })
      setIsCharging(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo cobrar la salida.')
    } finally {
      setIsSavingAction(false)
    }
  }

  const handleFinish = async () => {
    const shouldFinish = window.confirm(`Finalizar la visita de ${visit.childName}?`)

    if (!shouldFinish) {
      return
    }

    setActionError(null)
    setIsSavingAction(true)

    try {
      await finishVisit(visit)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo finalizar la visita.')
    } finally {
      setIsSavingAction(false)
    }
  }

  return (
    <article className="visit-card active-visit-card">
      <div className="visit-main-row">
        <div className="visit-name">
          <span className="avatar">
            <Baby />
          </span>
          <div>
            <strong>{visit.childName}</strong>
            <p className="muted">{visit.customerName}</p>
          </div>
        </div>
        <div>
          <p className="muted">Ingreso</p>
          <strong>{formatVisitStartTime(visit.startedAt)}</strong>
        </div>
        <div>
          <p className="muted">Plan</p>
          <strong>{visit.planName}</strong>
        </div>
        <div>
          <p className="muted">Tiempo</p>
          <TimeBadge visit={visit} />
        </div>
        <PaymentBadge status={visit.paymentStatus} />
      </div>

      <div className="visit-actions">
        {visit.paymentStatus !== 'paid' ? (
          <button className="button secondary" onClick={() => setIsCharging((current) => !current)} type="button">
            <CreditCard size={17} />
            Cobrar salida
          </button>
        ) : null}
        <button className="button ghost" onClick={() => setIsDetailOpen((current) => !current)} type="button">
          <Eye size={17} />
          Ver detalle
        </button>
        <button className="button ghost" disabled={isSavingAction} onClick={handleFinish} type="button">
          <LogOut size={17} />
          Finalizar
        </button>
      </div>

      {isCharging ? (
        <div className="inline-action-panel">
          <label className="field">
            <span>Forma de pago</span>
            <select
              onChange={(event) => setPaymentMethod(event.target.value as Exclude<PaymentMethod, ''>)}
              value={paymentMethod}
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="qr">QR</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label className="field">
            <span>Monto cobrado</span>
            <input
              min={0}
              onChange={(event) => setAmountCharged(event.target.value)}
              placeholder="Opcional"
              type="number"
              value={amountCharged}
            />
          </label>
          <button className="button primary" disabled={isSavingAction} onClick={handleCharge} type="button">
            <CheckCircle2 size={17} />
            Confirmar cobro
          </button>
        </div>
      ) : null}

      {isDetailOpen ? (
        <div className="visit-detail-grid">
          <span>Telefono: {visit.customerPhone || 'Sin telefono'}</span>
          <span>Relacion: {visit.customerRelation || 'Sin especificar'}</span>
          <span>Edad/rango: {visit.childAgeRange || 'Sin especificar'}</span>
          <span>Forma pago: {paymentMethodLabel[visit.paymentMethod ?? '']}</span>
          <span>Cantidad: {visit.childrenCount}</span>
          <span>Nota: {visit.notes || 'Sin notas'}</span>
        </div>
      ) : null}

      {actionError ? <div className="form-alert error">{actionError}</div> : null}
    </article>
  )
}

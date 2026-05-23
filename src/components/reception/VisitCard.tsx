import { Clock3, Eye, LogOut, Receipt, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { ConsolidatedCheckoutModal } from './ConsolidatedCheckoutModal'
import { finishVisit } from '../../services/visitService'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { formatGuarani } from '../../utils/money'
import { getVisitBillingSummary } from '../../utils/visitBilling'
import {
  formatOverdueDuration,
  formatRemainingTime,
  formatVisitStartTime,
  formatWarningMinutes,
  getVisitTimeStatus,
} from '../../utils/visitTime'

interface VisitCardProps {
  visit: ActiveVisit
  canteenOrders?: CanteenOrder[]
  now: Date
  onOpenConsumption?: () => void
}

const initialsFromName = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LP'

const statusLabel = (status: ReturnType<typeof getVisitTimeStatus>, visit: ActiveVisit, now: Date) => {
  if (status === 'expired') {
    return { title: 'Vencido', detail: formatOverdueDuration(visit, now) }
  }
  if (status === 'warning') {
    return { title: 'Vence en', detail: formatWarningMinutes(visit, now) }
  }
  if (status === 'unlimited') {
    return { title: 'Libre', detail: 'Sin límite' }
  }
  return { title: formatRemainingTime(visit, now), detail: 'restantes' }
}

export function VisitCard({ canteenOrders = [], now, onOpenConsumption, visit }: VisitCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isSavingAction, setIsSavingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const timeStatus = getVisitTimeStatus(visit, now)
  const timeCopy = statusLabel(timeStatus, visit, now)
  const billing = getVisitBillingSummary(visit, canteenOrders)
  const hasPendingBalance = billing.totalPendingAmount > 0

  const finishWithoutDebt = async () => {
    if (hasPendingBalance) {
      return
    }

    if (!window.confirm(`Finalizar la visita de ${visit.childName}?`)) {
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
    <article className={`visit-card active-visit-card reception-control-card ${timeStatus} ${hasPendingBalance ? 'has-debt' : ''}`}>
      <div className="visit-identity-block">
        <span className="visit-initials">{initialsFromName(visit.childName)}</span>
        <div>
          <strong>{visit.childName}</strong>
          <p>Responsable: {visit.customerName || 'Sin responsable'}</p>
          <small>
            <Clock3 size={15} />
            Ingreso: {formatVisitStartTime(visit.startedAt)}
          </small>
        </div>
      </div>

      <div className={`visit-time-block ${timeStatus}`}>
        <Clock3 size={34} />
        <strong>{timeCopy.title}</strong>
        <span>{timeCopy.detail}</span>
      </div>

      <div className="visit-account-block">
        <div className="account-line">
          <span>Parque</span>
          <strong className={billing.pendingParkAmount > 0 ? 'pending' : 'paid'}>
            {billing.pendingParkAmount > 0 ? `${formatGuarani(billing.pendingParkAmount)} pendiente` : 'Pagado'}
          </strong>
        </div>
        <div className="account-line">
          <span>Cantina</span>
          <strong className={billing.pendingCanteenAmount > 0 ? 'pending' : 'paid'}>
            {billing.pendingCanteenAmount > 0
              ? `${formatGuarani(billing.pendingCanteenAmount)} pendiente`
              : billing.relatedCanteenOrders.length > 0
                ? 'Pagada'
                : 'Sin consumo'}
          </strong>
        </div>
        <div className="account-line total">
          <span>Total pendiente</span>
          <strong className={billing.totalPendingAmount > 0 ? 'pending' : 'paid'}>{formatGuarani(billing.totalPendingAmount)}</strong>
        </div>
      </div>

      <div className="visit-action-block">
        {hasPendingBalance ? (
          <button className="button primary main-visit-action" onClick={() => setIsCheckoutOpen(true)} type="button">
            <WalletCards size={18} />
            Cobrar y finalizar
          </button>
        ) : (
          <button className="button secondary main-visit-action finish" disabled={isSavingAction} onClick={finishWithoutDebt} type="button">
            <LogOut size={18} />
            Finalizar salida
          </button>
        )}
        <div className="visit-secondary-actions">
          <button className="button ghost" onClick={onOpenConsumption} type="button">
            <Receipt size={16} />
            Ver consumo
          </button>
          <button className="button ghost" onClick={() => setIsDetailOpen((current) => !current)} type="button">
            <Eye size={16} />
            Ver detalle
          </button>
        </div>
      </div>

      {isDetailOpen ? (
        <div className="visit-detail-grid reception-detail-grid">
          <span>Telefono: {visit.customerPhone || 'Sin telefono'}</span>
          <span>Relacion: {visit.customerRelation || 'Sin especificar'}</span>
          <span>Edad: {visit.childAgeCalculated ?? visit.childExactAge ?? visit.childAgeRange ?? 'Sin especificar'}</span>
          <span>Plan: {visit.planName}</span>
          <span>Cantidad: {visit.childrenCount}</span>
          <span>Nota: {visit.notes || 'Sin notas'}</span>
        </div>
      ) : null}

      {actionError ? <div className="form-alert error">{actionError}</div> : null}

      {isCheckoutOpen ? (
        <ConsolidatedCheckoutModal
          finishByDefault
          onClose={() => setIsCheckoutOpen(false)}
          orders={canteenOrders}
          source="reception"
          visit={visit}
        />
      ) : null}
    </article>
  )
}

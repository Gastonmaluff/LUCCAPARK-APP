import { Clock3, Eye, LogOut, Receipt, TimerReset, Users, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { extendVisitTime, finishVisit } from '../../services/visitService'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { formatGuarani } from '../../utils/money'
import { isPendingUnlimitedVisit } from '../../utils/unlimitedPricing'
import { getVisitGroupBillingSummary } from '../../utils/visitBilling'
import { formatGroupChildNames } from '../../utils/visitGroups'
import {
  formatElapsedTime,
  formatOverdueDuration,
  formatRemainingTime,
  formatVisitStartTime,
  formatWarningMinutes,
  getVisitTimeStatus,
  missingVisitStartTimeLabel,
} from '../../utils/visitTime'
import { ConsolidatedGroupCheckoutModal } from './ConsolidatedGroupCheckoutModal'
import { VisitConsumptionPanel } from './VisitConsumptionPanel'

interface VisitGroupCardProps {
  canteenOrders: CanteenOrder[]
  canteenPath: string
  now: Date
  visits: ActiveVisit[]
}

const statusLabel = (visit: ActiveVisit, now: Date) => {
  const status = getVisitTimeStatus(visit, now)
  if (status === 'expired') return { status, title: 'Vencido', detail: formatOverdueDuration(visit, now) }
  if (status === 'warning') return { status, title: 'Vence en', detail: formatWarningMinutes(visit, now) }
  if (status === 'unlimited') {
    const elapsedTime = formatElapsedTime(visit.startedAt, now)
    return {
      status,
      title: elapsedTime,
      detail: elapsedTime === missingVisitStartTimeLabel ? 'Plan libre' : 'Libre · transcurrido',
    }
  }
  return { status, title: formatRemainingTime(visit, now), detail: 'restantes' }
}

export function VisitGroupCard({ canteenOrders, canteenPath, now, visits }: VisitGroupCardProps) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isConsumptionOpen, setIsConsumptionOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isExtensionOpen, setIsExtensionOpen] = useState(false)
  const [isChildrenExpanded, setIsChildrenExpanded] = useState(false)
  const [selectedVisitIds, setSelectedVisitIds] = useState<string[]>(() => visits.map((visit) => visit.id))
  const [isSavingAction, setIsSavingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const billing = getVisitGroupBillingSummary(visits, canteenOrders)
  const groupName = formatGroupChildNames(visits)
  const responsibleName = visits[0]?.customerName || 'Sin responsable'
  const visibleVisits = isChildrenExpanded ? visits : visits.slice(0, 4)
  const hiddenChildrenCount = Math.max(0, visits.length - visibleVisits.length)
  const hasPendingUnlimited = visits.some(isPendingUnlimitedVisit)
  const hasPendingBalance = billing.totalPendingAmount > 0 || hasPendingUnlimited
  const canExtendVisits = visits.filter((visit) => !visit.isUnlimited)

  const selectedVisits = useMemo(
    () => visits.filter((visit) => selectedVisitIds.includes(visit.id) && !visit.isUnlimited),
    [selectedVisitIds, visits],
  )

  const toggleVisitSelection = (visitId: string) => {
    setSelectedVisitIds((current) => (current.includes(visitId) ? current.filter((id) => id !== visitId) : [...current, visitId]))
  }

  const selectAllExtensions = () => {
    setSelectedVisitIds(canExtendVisits.map((visit) => visit.id))
  }

  const handleExtendTime = async (minutes: 30 | 60) => {
    const amount = minutes === 30 ? 30000 : 60000
    if (selectedVisits.length === 0) {
      setActionError('Seleccioná al menos un niño para extender el tiempo.')
      return
    }

    setActionError(null)
    setIsSavingAction(true)
    try {
      await Promise.all(selectedVisits.map((visit) => extendVisitTime(visit, { minutes, amount })))
      setIsExtensionOpen(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo extender el tiempo del grupo.')
    } finally {
      setIsSavingAction(false)
    }
  }

  const finishSingleVisit = async (visit: ActiveVisit) => {
    if (isPendingUnlimitedVisit(visit)) {
      setIsCheckoutOpen(true)
      return
    }

    if (!window.confirm(`Finalizar solo la visita de ${visit.childName}?`)) return

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
    <article className={`visit-card active-visit-card reception-control-card visit-group-card ${hasPendingBalance ? 'has-debt' : ''}`}>
      <div className="visit-identity-block visit-group-identity">
        <span className="visit-initials group">
          <Users size={22} />
        </span>
        <div>
          <span className="visit-group-label">Responsable</span>
          <strong>{responsibleName}</strong>
          <small>
            <Clock3 size={15} />
            {visits.length} niños ingresaron juntos
          </small>
        </div>
      </div>

      <div className="visit-group-children">
        <div className="visit-group-children-header">
          <strong>Niños dentro del parque</strong>
          <small>{groupName}</small>
        </div>
        {visibleVisits.map((visit) => {
          const timeCopy = statusLabel(visit, now)
          return (
            <div className={`visit-group-child-row ${timeCopy.status}`} key={visit.id}>
              <span>
                <strong>{visit.childName}</strong>
                <small>Ingreso: {formatVisitStartTime(visit.startedAt)}</small>
              </span>
              <b>{timeCopy.title}</b>
              <em>{timeCopy.detail}</em>
            </div>
          )
        })}
        {visits.length > 4 ? (
          <button className="button ghost visit-group-toggle" onClick={() => setIsChildrenExpanded((current) => !current)} type="button">
            {isChildrenExpanded ? 'Mostrar menos' : `Ver ${hiddenChildrenCount} ${hiddenChildrenCount === 1 ? 'niño más' : 'niños más'}`}
          </button>
        ) : null}
      </div>

      <div className="visit-group-side">
        <div className="visit-account-block group-account">
          <div className="account-line">
            <span>Parque</span>
            <strong className={billing.pendingParkAmount > 0 || hasPendingUnlimited ? 'pending' : 'paid'}>
              {hasPendingUnlimited
                ? 'Monto a definir al finalizar'
                : billing.pendingParkAmount > 0
                  ? `${formatGuarani(billing.pendingParkAmount)} pendiente`
                  : 'Pagado'}
            </strong>
          </div>
          <div className="account-line">
            <span>Cantina compartida</span>
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
            <strong className={billing.totalPendingAmount > 0 || hasPendingUnlimited ? 'pending' : 'paid'}>
              {hasPendingUnlimited && billing.totalPendingAmount <= 0 ? 'A definir' : formatGuarani(billing.totalPendingAmount)}
            </strong>
          </div>
        </div>

        <div className="visit-action-block">
          {hasPendingBalance ? (
            <button className="button primary main-visit-action" disabled={isSavingAction} onClick={() => setIsCheckoutOpen(true)} type="button">
              <WalletCards size={18} />
              Cobrar y finalizar {visits.length} visitas
            </button>
          ) : (
            <button className="button secondary main-visit-action finish" disabled={isSavingAction} onClick={() => setIsCheckoutOpen(true)} type="button">
              <LogOut size={18} />
              Finalizar grupo
            </button>
          )}
          <div className="visit-secondary-actions">
            <button className="button ghost" onClick={() => setIsConsumptionOpen((current) => !current)} type="button">
              <Receipt size={16} />
              Ver consumo
            </button>
            <button className="button ghost" onClick={() => setIsDetailOpen((current) => !current)} type="button">
              <Eye size={16} />
              Ver detalle
            </button>
            {canExtendVisits.length ? (
              <button className="button ghost" disabled={isSavingAction} onClick={() => setIsExtensionOpen((current) => !current)} type="button">
                <TimerReset size={16} />
                Extender tiempo
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isExtensionOpen ? (
        <div className="visit-extension-panel visit-group-extension-panel">
          <div>
            <strong>Extender tiempo</strong>
            <p>Elegí uno o varios niños. Si ya venció, el tiempo corre desde este momento.</p>
          </div>
          <div className="visit-group-extension-list">
            <button className="button ghost" disabled={isSavingAction} onClick={selectAllExtensions} type="button">
              A todos
            </button>
            {canExtendVisits.map((visit) => (
              <label key={visit.id}>
                <input checked={selectedVisitIds.includes(visit.id)} disabled={isSavingAction} onChange={() => toggleVisitSelection(visit.id)} type="checkbox" />
                {visit.childName}
              </label>
            ))}
          </div>
          <div className="visit-extension-options">
            <button className="button secondary" disabled={isSavingAction || selectedVisits.length === 0} onClick={() => handleExtendTime(30)} type="button">
              +30 min · {selectedVisits.length} x {formatGuarani(30000)} = {formatGuarani(selectedVisits.length * 30000)}
            </button>
            <button className="button primary" disabled={isSavingAction || selectedVisits.length === 0} onClick={() => handleExtendTime(60)} type="button">
              +1 hora · {selectedVisits.length} x {formatGuarani(60000)} = {formatGuarani(selectedVisits.length * 60000)}
            </button>
          </div>
        </div>
      ) : null}

      {isConsumptionOpen ? (
        <VisitConsumptionPanel
          canteenPath={canteenPath}
          groupEntryId={visits[0]?.groupEntryId}
          orders={canteenOrders}
          title={`Consumo de ${groupName}`}
          visit={visits[0]}
        />
      ) : null}

      {isDetailOpen ? (
        <div className="visit-detail-grid reception-detail-grid visit-group-detail-grid">
          <span>Teléfono: {visits[0]?.customerPhone || 'Sin teléfono'}</span>
          <span>Cédula: {visits[0]?.customerDocumentNumber || visits[0]?.guardianDocumentNumber || 'Sin cédula'}</span>
          <span>Relación: {visits[0]?.customerRelation || 'Sin especificar'}</span>
          <span>Consumo compartido: {formatGuarani(billing.pendingCanteenAmount)}</span>
          {visits.map((visit) => (
            <div className="visit-group-detail-row" key={visit.id}>
              <strong>{visit.childName}</strong>
              <small>
                {visit.planName} · ingreso {formatVisitStartTime(visit.startedAt)}
              </small>
              <button className="button ghost" disabled={isSavingAction} onClick={() => finishSingleVisit(visit)} type="button">
                Finalizar solo este niño
              </button>
            </div>
          ))}
          <Link className="button primary" to={`${canteenPath}?groupEntryId=${visits[0]?.groupEntryId ?? ''}`}>
            + Agregar producto a cuenta grupal
          </Link>
        </div>
      ) : null}

      {actionError ? <div className="form-alert error">{actionError}</div> : null}

      {isCheckoutOpen ? (
        <ConsolidatedGroupCheckoutModal
          finishByDefault
          onClose={() => setIsCheckoutOpen(false)}
          orders={canteenOrders}
          source="reception"
          visits={visits}
        />
      ) : null}
    </article>
  )
}

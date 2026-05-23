import { Baby, CalendarHeart, ClipboardList, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { ActiveVisitsList } from './ActiveVisitsList'
import { ReceptionSummaryCards } from './ReceptionSummaryCards'
import { StorageModeNotice } from './StorageModeNotice'
import { TodayVisitsSection } from './TodayVisitsSection'
import { VisitForm } from './VisitForm'
import { BrandLogo } from '../BrandLogo'
import { StatusPill } from '../StatusPill'
import type { ActiveVisit, CanteenOrder } from '../../types'

interface ReceptionWorkspaceProps {
  canteenOrders: CanteenOrder[]
  canteenPath: string
  error: string | null
  isLoading: boolean
  now: Date
  storageMode: 'firestore' | 'local' | null
  visits: ActiveVisit[]
  onEventMode?: () => void
  eventModeActive?: boolean
}

export function ReceptionWorkspace({
  canteenOrders,
  canteenPath,
  error,
  isLoading,
  now,
  storageMode,
  visits,
  eventModeActive = false,
  onEventMode,
}: ReceptionWorkspaceProps) {
  const [isVisitFormOpen, setIsVisitFormOpen] = useState(false)

  return (
    <>
      <header className="reception-control-header">
        <div className="reception-brand-heading">
          <BrandLogo className="compact" />
          <span className="reception-header-separator" />
          <div>
            <h1>Recepción</h1>
            <p>Control de ingresos y salidas</p>
          </div>
        </div>
        <div className="reception-header-actions">
          {onEventMode ? (
            <button
              aria-pressed={eventModeActive}
              className={`button secondary ${eventModeActive ? 'active' : ''}`}
              onClick={onEventMode}
              type="button"
            >
              <CalendarHeart size={17} />
              Día de evento
            </button>
          ) : null}
          <button className="button primary" onClick={() => setIsVisitFormOpen(true)} type="button">
            <Plus size={18} />
            Registrar ingreso
          </button>
        </div>
      </header>

      <ReceptionSummaryCards canteenOrders={canteenOrders} now={now} visits={visits} />
      <StorageModeNotice mode={storageMode} />

      <article className="panel admin-active-visits-panel">
        <div className="panel-header active-visits-header">
          <div>
            <h2 className="panel-title">
              <Baby color="var(--green)" />
              Visitas activas
            </h2>
          </div>
          <div className="module-actions">
            <StatusPill tone="available">Tiempo real</StatusPill>
          </div>
        </div>
        <ActiveVisitsList
          canteenOrders={canteenOrders}
          canteenPath={canteenPath}
          error={error}
          isLoading={isLoading}
          now={now}
          visits={visits}
        />
      </article>

      <TodayVisitsSection canteenOrders={canteenOrders} />

      {isVisitFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <aside aria-label="Registrar ingreso" className="visit-form-modal" role="dialog">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Visita normal</p>
                <h2 className="panel-title">
                  <ClipboardList color="var(--orange)" />
                  Registrar ingreso
                </h2>
              </div>
              <button className="icon-button modal-close" onClick={() => setIsVisitFormOpen(false)} type="button" aria-label="Cerrar formulario">
                <X size={20} />
              </button>
            </div>
            <VisitForm onCancel={() => setIsVisitFormOpen(false)} onCreated={() => setIsVisitFormOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  )
}

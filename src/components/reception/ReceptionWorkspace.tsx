import { Baby, ClipboardList, X } from 'lucide-react'
import { useState } from 'react'
import { ActiveVisitsList } from './ActiveVisitsList'
import { ReceptionSummaryCards } from './ReceptionSummaryCards'
import { StorageModeNotice } from './StorageModeNotice'
import { TodayVisitsSection } from './TodayVisitsSection'
import { VisitForm } from './VisitForm'
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
}

export function ReceptionWorkspace({
  canteenOrders,
  canteenPath,
  error,
  isLoading,
  now,
  storageMode,
  visits,
}: ReceptionWorkspaceProps) {
  const [isVisitFormOpen, setIsVisitFormOpen] = useState(false)

  return (
    <>
      <ReceptionSummaryCards now={now} visits={visits} />
      <StorageModeNotice mode={storageMode} />

      <article className="panel admin-active-visits-panel">
        <div className="panel-header active-visits-header">
          <div>
            <h2 className="panel-title">
              <Baby color="var(--green)" />
              Visitas activas
            </h2>
            <p className="muted">Ninos dentro del parque, pagos, tiempos y consumo asociado.</p>
          </div>
          <div className="module-actions">
            <StatusPill tone="available">Tiempo real</StatusPill>
            <button className="button primary" onClick={() => setIsVisitFormOpen(true)} type="button">
              <ClipboardList size={18} />
              Registrar ingreso
            </button>
          </div>
        </div>
        <ActiveVisitsList
          canteenOrders={canteenOrders}
          canteenPath={canteenPath}
          error={error}
          isLoading={isLoading}
          visits={visits}
        />
      </article>

      <TodayVisitsSection />

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

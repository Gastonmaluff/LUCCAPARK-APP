import { Baby, ClipboardList, X } from 'lucide-react'
import { useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { ActiveVisitsList } from '../../components/reception/ActiveVisitsList'
import { ReceptionSummaryCards } from '../../components/reception/ReceptionSummaryCards'
import { StorageModeNotice } from '../../components/reception/StorageModeNotice'
import { VisitForm } from '../../components/reception/VisitForm'
import { StatusPill } from '../../components/StatusPill'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useOpenCanteenOrders } from '../../hooks/useCanteen'
import { useCurrentTime } from '../../hooks/useCurrentTime'

export function AdminReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { orders: openCanteenOrders } = useOpenCanteenOrders()
  const now = useCurrentTime(1000)
  const [isVisitFormOpen, setIsVisitFormOpen] = useState(false)

  return (
    <>
      <AdminModuleHeader
        eyebrow="Operacion"
        title="Recepcion administrativa"
        description="Monitoreo de visitas activas, temporizadores y acciones de cobro/finalizacion."
      />

      <ReceptionSummaryCards now={now} visits={visits} />
      <StorageModeNotice mode={storageMode} />

      <article className="panel admin-active-visits-panel">
        <div className="panel-header active-visits-header">
          <div>
            <h2 className="panel-title">
              <Baby color="var(--green)" />
              Visitas activas
            </h2>
            <p className="muted">Ninos dentro del parque, pagos, tiempos y accesos rapidos.</p>
          </div>
          <div className="module-actions">
            <StatusPill tone="available">Firestore</StatusPill>
            <button className="button primary" onClick={() => setIsVisitFormOpen(true)} type="button">
              <ClipboardList size={18} />
              Registrar ingreso
            </button>
          </div>
        </div>
        <ActiveVisitsList canteenOrders={openCanteenOrders} error={error} isLoading={isLoading} visits={visits} />
      </article>

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
            <VisitForm onCreated={() => setIsVisitFormOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  )
}

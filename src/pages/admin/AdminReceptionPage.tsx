import { Baby, ClipboardList, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { ActiveVisitsList } from '../../components/reception/ActiveVisitsList'
import { ReceptionSummaryCards } from '../../components/reception/ReceptionSummaryCards'
import { StorageModeNotice } from '../../components/reception/StorageModeNotice'
import { VisitForm } from '../../components/reception/VisitForm'
import { StatusPill } from '../../components/StatusPill'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCurrentTime } from '../../hooks/useCurrentTime'

export function AdminReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const now = useCurrentTime(1000)

  return (
    <>
      <AdminModuleHeader
        eyebrow="Operacion"
        title="Recepcion administrativa"
        description="Registro normal real con Firestore, temporizadores y acciones de cobro/finalizacion."
        action={
          <Link className="button primary" to="/recepcion">
            <ExternalLink size={18} />
            Abrir portal rapido
          </Link>
        }
      />

      <ReceptionSummaryCards now={now} visits={visits} />
      <StorageModeNotice mode={storageMode} />

      <div className="reception-grid">
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <ClipboardList color="var(--orange)" />
              Registrar ingreso
            </h2>
            <StatusPill tone="info">Visita normal</StatusPill>
          </div>
          <VisitForm compact />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Baby color="var(--green)" />
              Visitas activas
            </h2>
            <StatusPill tone="available">Firestore</StatusPill>
          </div>
          <ActiveVisitsList error={error} isLoading={isLoading} visits={visits} />
        </article>
      </div>
    </>
  )
}

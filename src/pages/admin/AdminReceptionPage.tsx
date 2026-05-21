import { Baby, ClipboardList, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { EventReceptionPanel } from '../../components/events/EventReceptionPanel'
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
  const [mode, setMode] = useState<'normal' | 'event'>('normal')

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

      <div className="mode-switch admin-mode-switch" role="tablist" aria-label="Modo de recepcion">
        <button className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')} type="button">
          Visita normal
        </button>
        <button className={mode === 'event' ? 'active' : ''} onClick={() => setMode('event')} type="button">
          Evento privado
        </button>
      </div>

      {mode === 'normal' ? (
        <>
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
      ) : (
        <EventReceptionPanel showAdminLink />
      )}
    </>
  )
}

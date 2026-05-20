import { Baby, ClipboardList, RefreshCw } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { ActiveVisitsList } from '../components/reception/ActiveVisitsList'
import { ReceptionSummaryCards } from '../components/reception/ReceptionSummaryCards'
import { StorageModeNotice } from '../components/reception/StorageModeNotice'
import { VisitForm } from '../components/reception/VisitForm'
import { StatusPill } from '../components/StatusPill'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useCurrentTime } from '../hooks/useCurrentTime'

export function ReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const now = useCurrentTime(1000)

  return (
    <main className="internal-page">
      <section className="internal-shell">
        <header className="admin-topbar">
          <BrandLogo className="compact" />
          <div>
            <p className="eyebrow">Operacion diaria</p>
            <h1 className="reception-title">Recepcion</h1>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Modo de recepcion">
            <button className="active" type="button">
              Visita normal
            </button>
            <button disabled title="Se implementa en el proximo prompt" type="button">
              Evento privado
            </button>
          </div>
          <button className="button ghost" onClick={() => window.location.reload()} type="button">
            <RefreshCw size={17} />
            Actualizar
          </button>
        </header>

        <ReceptionSummaryCards now={now} visits={visits} />
        <StorageModeNotice mode={storageMode} />

        <div className="reception-grid">
          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <ClipboardList color="var(--orange)" />
                Registrar ingreso
              </h2>
            </div>
            <VisitForm />
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <Baby color="var(--orange)" />
                Visitas activas
              </h2>
              <StatusPill tone="info">Tiempo real</StatusPill>
            </div>
            <ActiveVisitsList error={error} isLoading={isLoading} visits={visits} />
          </article>
        </div>
      </section>
    </main>
  )
}

import { Baby, ClipboardList, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { EventReceptionPanel } from '../components/events/EventReceptionPanel'
import { ActiveVisitsList } from '../components/reception/ActiveVisitsList'
import { ReceptionSummaryCards } from '../components/reception/ReceptionSummaryCards'
import { StorageModeNotice } from '../components/reception/StorageModeNotice'
import { VisitForm } from '../components/reception/VisitForm'
import { StatusPill } from '../components/StatusPill'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useOpenCanteenOrders } from '../hooks/useCanteen'
import { useCurrentTime } from '../hooks/useCurrentTime'

export function ReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { orders: openCanteenOrders } = useOpenCanteenOrders()
  const now = useCurrentTime(1000)
  const [mode, setMode] = useState<'normal' | 'event'>('normal')

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
            <button className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')} type="button">
              Visita normal
            </button>
            <button className={mode === 'event' ? 'active' : ''} onClick={() => setMode('event')} type="button">
              Evento privado
            </button>
          </div>
          <button className="button ghost" onClick={() => window.location.reload()} type="button">
            <RefreshCw size={17} />
            Actualizar
          </button>
        </header>

        {mode === 'normal' ? (
          <>
            <ReceptionSummaryCards now={now} visits={visits} />
            <StorageModeNotice mode={storageMode} />
          </>
        ) : null}

        {mode === 'normal' ? (
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
              <ActiveVisitsList canteenOrders={openCanteenOrders} error={error} isLoading={isLoading} visits={visits} />
            </article>
          </div>
        ) : (
          <EventReceptionPanel />
        )}
      </section>
    </main>
  )
}

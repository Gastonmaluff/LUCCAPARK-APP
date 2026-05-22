import { Baby, CalendarHeart, ClipboardList, RefreshCw } from 'lucide-react'
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
        <header className="admin-topbar reception-topbar">
          <BrandLogo className="compact" />
          <div className="reception-heading">
            <p className="eyebrow">Operacion diaria</p>
            <h1 className="reception-title">Recepcion</h1>
            <p className="muted">Ingresos normales y control de invitados en dias de evento.</p>
          </div>
          <div className="reception-header-actions">
            <button
              aria-pressed={mode === 'event'}
              className={`button secondary ${mode === 'event' ? 'active' : ''}`}
              onClick={() => setMode((current) => (current === 'event' ? 'normal' : 'event'))}
              type="button"
            >
              <CalendarHeart size={17} />
              Día de evento
            </button>
            <button className="button ghost" onClick={() => window.location.reload()} type="button">
              <RefreshCw size={17} />
              Actualizar
            </button>
          </div>
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

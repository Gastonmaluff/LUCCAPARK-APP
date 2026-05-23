import { CalendarHeart, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { EventReceptionPanel } from '../components/events/EventReceptionPanel'
import { ReceptionWorkspace } from '../components/reception/ReceptionWorkspace'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useCanteenOrders } from '../hooks/useCanteen'
import { useCurrentTime } from '../hooks/useCurrentTime'

export function ReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { orders: canteenOrders } = useCanteenOrders()
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
          <ReceptionWorkspace
            canteenOrders={canteenOrders}
            canteenPath="/cantina"
            error={error}
            isLoading={isLoading}
            now={now}
            storageMode={storageMode}
            visits={visits}
          />
        ) : (
          <EventReceptionPanel />
        )}
      </section>
    </main>
  )
}

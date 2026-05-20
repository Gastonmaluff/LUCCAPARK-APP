import { MonitorPlay } from 'lucide-react'
import { useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { StatusPill } from '../components/StatusPill'
import { appConfig } from '../config/app'
import { demoEvents, demoVisits } from '../data/demoData'

export function TVPage() {
  const [mode, setMode] = useState<'visit' | 'event'>('visit')
  const activeEvent = demoEvents[0]

  return (
    <main className="tv-page">
      <section className="tv-shell">
        <header className="tv-toolbar">
          <BrandLogo className="compact" />
          <div className="mode-switch">
            <button className={mode === 'visit' ? 'active' : ''} type="button" onClick={() => setMode('visit')}>
              Visitas
            </button>
            <button className={mode === 'event' ? 'active' : ''} type="button" onClick={() => setMode('event')}>
              Evento
            </button>
          </div>
        </header>

        {mode === 'visit' ? (
          <>
            <h1 className="tv-title">Tiempos activos</h1>
            <p className="muted" style={{ color: '#b8c4d5', fontSize: '1.4rem', marginBottom: 22 }}>
              Vista grande para Smart TV, Chromecast, Fire Stick o navegador.
            </p>
            <div className="tv-grid">
              {demoVisits.map((visit) => (
                <article className="tv-card" key={visit.childName}>
                  <strong>{visit.childName}</strong>
                  <span className={`timer ${visit.tone}`}>{visit.remaining}</span>
                  <StatusPill tone={visit.paymentStatus === 'paid' ? 'paid' : visit.paymentStatus === 'payAtExit' ? 'warning' : 'danger'}>
                    {visit.paymentStatus === 'paid' ? 'Pagado' : visit.paymentStatus === 'payAtExit' ? 'Paga al salir' : 'Pendiente'}
                  </StatusPill>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="tv-event">
            <img src={appConfig.heroImageUrl} alt="Banner configurable para evento" />
            <div className="tv-event-copy">
              <p className="eyebrow" style={{ color: 'var(--yellow)' }}>
                <MonitorPlay size={20} /> Modo evento privado
              </p>
              <h1>Bienvenidos al cumpleanos de Mateo</h1>
              <p style={{ color: '#dbe7f6', fontSize: '1.5rem' }}>
                {activeEvent.date} · {activeEvent.time}
              </p>
              <div className="counter-box">
                <span>Invitados registrados</span>
                <strong>
                  {activeEvent.checkedIn} / {activeEvent.capacity}
                </strong>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

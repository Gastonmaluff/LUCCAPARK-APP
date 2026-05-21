import { Baby } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { TvEventView } from '../components/events/TvEventView'
import { PaymentBadge } from '../components/reception/PaymentBadge'
import { TimeBadge } from '../components/reception/TimeBadge'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useActiveEvent } from '../hooks/useEvents'
import { formatVisitStartTime, getVisitTimeStatus } from '../utils/visitTime'

export function TVPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { activeEvent, isLoading: isLoadingEvent } = useActiveEvent()

  if (activeEvent) {
    return <TvEventView event={activeEvent} />
  }

  return (
    <main className="tv-page">
      <section className="tv-shell">
        <header className="tv-toolbar">
          <BrandLogo className="compact" />
          <div className="tv-mode-label">Modo normal</div>
        </header>

        <h1 className="tv-title">Ninos dentro ahora</h1>
        <p className="muted" style={{ color: '#b8c4d5', fontSize: '1.4rem', marginBottom: 22 }}>
          Vista en tiempo real para temporizadores de visitas normales.
        </p>

        {isLoading || isLoadingEvent ? <div className="tv-empty">Cargando pantalla TV...</div> : null}
        {storageMode === 'local' && !isLoading ? (
          <div className="tv-local-note">Modo local temporal: activar Firestore para sincronizar entre dispositivos reales.</div>
        ) : null}
        {error ? <div className="tv-empty danger">No se pudieron cargar las visitas activas.</div> : null}
        {!isLoading && !isLoadingEvent && !error && visits.length === 0 ? (
          <div className="tv-empty">
            <BrandLogo />
            <strong>No hay visitas activas en este momento</strong>
          </div>
        ) : null}

        {!isLoading && !isLoadingEvent && !error && visits.length > 0 ? (
          <div className="tv-grid">
            {visits.map((visit) => {
              const timeStatus = getVisitTimeStatus(visit)
              return (
                <article className={`tv-card ${timeStatus}`} key={visit.id}>
                  <div>
                    <strong>{visit.childName}</strong>
                    <p>{visit.customerName}</p>
                  </div>
                  <TimeBadge large visit={visit} />
                  <div className="tv-card-footer">
                    <span>
                      <Baby size={20} />
                      {visit.planName}
                    </span>
                    <span>Ingreso {formatVisitStartTime(visit.startedAt)}</span>
                  </div>
                  <PaymentBadge status={visit.paymentStatus} />
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </main>
  )
}

import { CalendarDays, Users } from 'lucide-react'
import { BrandLogo } from '../BrandLogo'
import { useEventGuests } from '../../hooks/useEvents'
import { formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'
import type { LuccaEvent } from '../../types'
import { appConfig } from '../../config/app'

interface TvEventViewProps {
  event: LuccaEvent
}

export function TvEventView({ event }: TvEventViewProps) {
  const { guests } = useEventGuests(event.id)
  const stats = getEventCapacityStats(event, guests.length || event.registeredGuestsCount)
  const title = event.hideSensitiveInfoOnTv
    ? 'Evento privado en curso'
    : event.tvTitle || `Bienvenidos al cumpleanos de ${event.birthdayChildName}`
  const message = event.hideSensitiveInfoOnTv ? 'Bienvenidos a Lucca Park' : event.tvMessage || 'Que empiece la diversion'
  const bannerImage = event.tvBannerImageUrl || appConfig.heroImageUrl

  return (
    <main className="tv-page tv-event-page">
      <section className="tv-shell">
        <header className="tv-toolbar">
          <BrandLogo className="compact" />
          <div className="tv-mode-label">Modo evento</div>
        </header>

        <div className="tv-event">
          <div className="tv-event-copy">
            {event.showEventNameOnTv || event.hideSensitiveInfoOnTv ? <h1>{title}</h1> : null}
            <p>{message}</p>
            <div className="tv-event-meta">
              <span>
                <CalendarDays size={26} />
                {formatEventTimeRange(event)}
              </span>
            </div>

            {event.showGuestCounterOnTv && !event.hideSensitiveInfoOnTv ? (
              <div className={`counter-box ${stats.capacityStatus}`}>
                <span>Invitados registrados</span>
                <strong>
                  {stats.registeredGuestsCount} / {stats.contractedChildrenCount}
                </strong>
                {stats.extraGuestsCount > 0 ? <em>{stats.extraGuestsCount} adicionales</em> : <em>{stats.includedRemaining} lugares incluidos</em>}
              </div>
            ) : null}
          </div>

          <div className="tv-event-media">
            <img src={bannerImage} alt="Evento privado Lucca Park" />
            {!event.hideSensitiveInfoOnTv && event.showGuestCounterOnTv ? (
              <div className="tv-event-floating-counter">
                <Users size={30} />
                {stats.registeredGuestsCount} / {stats.contractedChildrenCount}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

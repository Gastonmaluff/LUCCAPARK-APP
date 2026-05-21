import { CalendarDays, Clock, UserRound } from 'lucide-react'
import { EventCapacityBadge } from './EventCapacityBadge'
import { EventStatusBadge } from './EventStatusBadge'
import { formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'
import type { LuccaEvent } from '../../types'

interface EventSummaryCardProps {
  event: LuccaEvent
  guestCount?: number
}

export function EventSummaryCard({ event, guestCount }: EventSummaryCardProps) {
  const stats = getEventCapacityStats(event, guestCount)

  return (
    <article className={`event-summary-card ${stats.capacityStatus}`}>
      <div className="event-summary-main">
        <div>
          <p className="eyebrow">Evento seleccionado</p>
          <h2>{event.title}</h2>
          <p className="muted">
            <UserRound size={16} /> {event.customerName}
          </p>
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="event-summary-grid">
        <span>
          <CalendarDays size={18} />
          {event.date}
        </span>
        <span>
          <Clock size={18} />
          {formatEventTimeRange(event)}
        </span>
      </div>

      <EventCapacityBadge event={event} guestCount={guestCount} large />

      <div className="event-capacity-notes">
        <strong>{stats.includedRemaining} lugares incluidos restantes</strong>
        {stats.extraGuestsCount > 0 ? <strong className="danger">{stats.extraGuestsCount} ninos adicionales</strong> : null}
      </div>
    </article>
  )
}

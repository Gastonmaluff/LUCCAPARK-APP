import { CalendarPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EventStatusBadge } from './EventStatusBadge'
import { formatEventTimeRange } from '../../utils/eventCapacity'
import type { LuccaEvent } from '../../types'

interface EventSelectorProps {
  events: LuccaEvent[]
  selectedEventId: string
  onSelect: (eventId: string) => void
  isLoading: boolean
  error: string | null
  showAdminLink?: boolean
}

export function EventSelector({ error, events, isLoading, onSelect, selectedEventId, showAdminLink }: EventSelectorProps) {
  if (isLoading) {
    return <div className="empty-state">Cargando eventos de hoy...</div>
  }

  if (error) {
    return <div className="form-alert error">No se pudieron cargar los eventos: {error}</div>
  }

  if (events.length === 0) {
    return (
      <div className="empty-state event-empty">
        <strong>No hay eventos programados para hoy</strong>
        <span>Creá o activá una reserva desde el panel administrativo.</span>
        {showAdminLink ? (
          <Link className="button primary" to="/admin/reservas">
            <CalendarPlus size={18} />
            Crear evento
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="event-selector-list">
      {events.map((event) => (
        <button
          className={`event-selector-card ${selectedEventId === event.id ? 'selected' : ''}`}
          key={event.id}
          onClick={() => onSelect(event.id)}
          type="button"
        >
          <span>
            <strong>{event.title}</strong>
            <small>
              {formatEventTimeRange(event)} · cupo {event.contractedChildrenCount}
            </small>
          </span>
          <EventStatusBadge status={event.status} />
        </button>
      ))}
    </div>
  )
}

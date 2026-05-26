import { Clock, UserRound } from 'lucide-react'
import { StatusPill } from '../StatusPill'
import type { EventGuest } from '../../types'

interface EventGuestListProps {
  guests: EventGuest[]
  isLoading: boolean
  error: string | null
  contractedChildrenCount?: number
}

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

export function EventGuestList({ contractedChildrenCount = 0, error, guests, isLoading }: EventGuestListProps) {
  if (isLoading) {
    return <div className="empty-state">Cargando invitados...</div>
  }

  if (error) {
    return <div className="form-alert error">No se pudieron cargar los invitados: {error}</div>
  }

  if (guests.length === 0) {
    return <div className="empty-state">Todavía no hay invitados registrados para este evento.</div>
  }

  return (
    <div className="event-guest-list">
      {guests.map((guest) => (
        <article className={`event-guest-row ${guest.isExtra ? 'extra' : ''}`} key={guest.id}>
          <div className="event-guest-person">
            <strong>{guest.childName}</strong>
            <p className="muted event-guest-responsible">
              <UserRound size={15} />
              <span>{guest.responsibleName}</span>
            </p>
          </div>
          <span className="muted event-guest-meta">
            <Clock size={15} />
            {formatTime(guest.checkedInAt)}
          </span>
          <StatusPill tone={guest.isExtra ? 'warning' : 'available'}>
            {guest.isExtra ? `Adicional #${Math.max(1, guest.guestNumber - contractedChildrenCount)}` : `Incluido #${guest.guestNumber}`}
          </StatusPill>
          {guest.notes ? <p className="muted event-guest-note">{guest.notes}</p> : null}
        </article>
      ))}
    </div>
  )
}

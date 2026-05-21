import { useMemo, useState } from 'react'
import { Baby, CalendarDays, ClipboardList } from 'lucide-react'
import { EventGuestForm } from './EventGuestForm'
import { EventGuestList } from './EventGuestList'
import { EventSelector } from './EventSelector'
import { EventSummaryCard } from './EventSummaryCard'
import { StatusPill } from '../StatusPill'
import { useEventGuests, useTodayEvents } from '../../hooks/useEvents'

interface EventReceptionPanelProps {
  showAdminLink?: boolean
}

export function EventReceptionPanel({ showAdminLink = false }: EventReceptionPanelProps) {
  const { error, events, isLoading } = useTodayEvents()
  const [selectedEventId, setSelectedEventId] = useState('')
  const effectiveSelectedEventId =
    selectedEventId && events.some((event) => event.id === selectedEventId)
      ? selectedEventId
      : events.find((event) => event.status === 'active')?.id ?? events[0]?.id ?? ''
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === effectiveSelectedEventId) ?? null,
    [events, effectiveSelectedEventId],
  )
  const { error: guestsError, guests, isLoading: isLoadingGuests } = useEventGuests(selectedEvent?.id)

  return (
    <div className="event-mode-grid">
      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <CalendarDays color="var(--orange)" />
            Evento del dia
          </h2>
          <StatusPill tone="info">Sin temporizador</StatusPill>
        </div>
        <EventSelector
          error={error}
          events={events}
          isLoading={isLoading}
          onSelect={setSelectedEventId}
          selectedEventId={effectiveSelectedEventId}
          showAdminLink={showAdminLink}
        />
        {selectedEvent ? <EventSummaryCard event={selectedEvent} guestCount={guests.length || selectedEvent.registeredGuestsCount} /> : null}
      </article>

      {selectedEvent ? (
        <>
          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <ClipboardList color="var(--orange)" />
                Registrar invitado
              </h2>
            </div>
            <EventGuestForm event={selectedEvent} />
          </article>

          <article className="panel event-guest-panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <Baby color="var(--green)" />
                Invitados registrados
              </h2>
              <StatusPill tone="available">{guests.length} ingresos</StatusPill>
            </div>
            <EventGuestList error={guestsError} guests={guests} isLoading={isLoadingGuests} />
          </article>
        </>
      ) : null}
    </div>
  )
}

import { CalendarPlus, Filter } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { EventCreateForm } from '../../components/events/EventCreateForm'
import { EventDetailPanel } from '../../components/events/EventDetailPanel'
import { EventStatusBadge } from '../../components/events/EventStatusBadge'
import { StatusPill } from '../../components/StatusPill'
import { useEvents } from '../../hooks/useEvents'
import { formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'

export function AdminReservationsPage() {
  const { error, events, isLoading } = useEvents()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState('')
  const effectiveSelectedEventId =
    selectedEventId && events.some((event) => event.id === selectedEventId) ? selectedEventId : events[0]?.id ?? ''
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === effectiveSelectedEventId) ?? null,
    [events, effectiveSelectedEventId],
  )

  return (
    <>
      <AdminModuleHeader
        eyebrow="Eventos"
        title="Reservas"
        description="Crear eventos reales, activar cumpleaños, revisar invitados y configurar TV."
        action={
          <button className="button primary" onClick={() => setShowCreateForm((current) => !current)} type="button">
            <CalendarPlus size={18} />
            Nueva reserva
          </button>
        }
      />

      {showCreateForm ? (
        <article className="panel create-event-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarPlus color="var(--orange)" />
              Crear evento
            </h2>
            <StatusPill tone="info">Firestore</StatusPill>
          </div>
          <EventCreateForm
            onCreated={(eventId) => {
              setSelectedEventId(eventId)
              setShowCreateForm(false)
            }}
          />
        </article>
      ) : null}

      <div className="reservations-grid">
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Filter color="var(--turquoise)" />
              Reservas y eventos
            </h2>
            <StatusPill tone="available">Tiempo real</StatusPill>
          </div>

          {isLoading ? <div className="empty-state">Cargando reservas...</div> : null}
          {error ? <div className="form-alert error">No se pudieron cargar eventos: {error}</div> : null}
          {!isLoading && !error && events.length === 0 ? (
            <div className="empty-state">Todavía no hay reservas creadas.</div>
          ) : null}

          <div className="module-list">
            {events.map((event) => {
              const stats = getEventCapacityStats(event)
              return (
                <button
                  className={`event-admin-row ${selectedEvent?.id === event.id ? 'selected' : ''}`}
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  type="button"
                >
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.customerName} · {event.date} · {formatEventTimeRange(event)}
                    </small>
                  </span>
                  <span>
                    {stats.registeredGuestsCount} / {stats.contractedChildrenCount}
                  </span>
                  <EventStatusBadge status={event.status} />
                </button>
              )
            })}
          </div>
        </article>

        <EventDetailPanel event={selectedEvent} />
      </div>
    </>
  )
}

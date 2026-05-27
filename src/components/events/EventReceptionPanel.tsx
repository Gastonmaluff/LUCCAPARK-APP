import { useMemo, useState } from 'react'
import { Baby, CalendarDays, ClipboardList, Monitor, Plus, Receipt, Square, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EventGuestForm } from './EventGuestForm'
import { EventGuestList } from './EventGuestList'
import { EventSelector } from './EventSelector'
import { EventSummaryCard } from './EventSummaryCard'
import { EventTvImageModal } from './EventTvImageModal'
import { StatusPill } from '../StatusPill'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useEventDayContext } from '../../hooks/useEventDayContext'
import { useEventGuests } from '../../hooks/useEvents'
import { updateEventStatus } from '../../services/eventService'
import { formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'
import { getEventPendingAmount } from '../../utils/eventFinance'
import { formatGuarani } from '../../utils/money'

interface EventReceptionPanelProps {
  canteenPath?: string
  reservationsPath?: string
  showAdminLink?: boolean
}

export function EventReceptionPanel({
  canteenPath = '/admin/cantina',
  reservationsPath = '/admin/reservas',
  showAdminLink = false,
}: EventReceptionPanelProps) {
  const { activeEvent, error, events, isLoading } = useEventDayContext()
  const [selectedEventId, setSelectedEventId] = useState('')
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false)
  const [isTvModalOpen, setIsTvModalOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const manualSelectedEventId =
    selectedEventId && events.some((event) => event.id === selectedEventId)
      ? selectedEventId
      : events.find((event) => event.status === 'active')?.id ?? events[0]?.id ?? ''
  const selectedEvent = useMemo(
    () => activeEvent ?? events.find((event) => event.id === manualSelectedEventId) ?? null,
    [activeEvent, events, manualSelectedEventId],
  )
  const { error: guestsError, guests, isLoading: isLoadingGuests } = useEventGuests(selectedEvent?.id)
  const { orders: canteenOrders } = useCanteenOrders()
  const eventCanteenTotal = selectedEvent
    ? canteenOrders
        .filter((order) => order.eventId === selectedEvent.id && order.status !== 'cancelled')
        .reduce((sum, order) => sum + order.total, 0)
    : 0
  const stats = selectedEvent ? getEventCapacityStats(selectedEvent, guests.length || selectedEvent.registeredGuestsCount) : null
  const pendingAmount = selectedEvent ? getEventPendingAmount(selectedEvent) : 0

  const finishEvent = async () => {
    if (!selectedEvent || !window.confirm(`Finalizar el evento ${selectedEvent.title}?`)) {
      return
    }

    setIsUpdatingStatus(true)
    setMessage(null)
    try {
      await updateEventStatus(selectedEvent.id, 'finished')
      setMessage('Evento finalizado.')
    } catch (statusError) {
      setMessage(statusError instanceof Error ? statusError.message : 'No se pudo finalizar el evento.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  if (activeEvent && selectedEvent && stats) {
    return (
      <div className="event-operations-view">
        {message ? <div className={message.includes('No se') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}
        <article className="event-operation-hero">
          <div className="event-operation-heading">
            <div>
              <p className="eyebrow">EVENTO EN CURSO</p>
              <h1>{selectedEvent.title}</h1>
              <p>
                {selectedEvent.customerName} - {selectedEvent.date} - {formatEventTimeRange(selectedEvent)}
              </p>
            </div>
            <div className="event-operation-badges">
              <StatusPill tone="available">En curso</StatusPill>
              <StatusPill tone="info">Sin temporizador</StatusPill>
            </div>
          </div>

          <div className="event-operation-metrics">
            <span>
              <small>Ingresaron</small>
              <strong>
                {stats.registeredGuestsCount} / {stats.contractedChildrenCount}
              </strong>
            </span>
            <span>
              <small>Lugares restantes</small>
              <strong>{stats.includedRemaining}</strong>
            </span>
            <span className={stats.extraGuestsCount > 0 ? 'metric-warning' : ''}>
              <small>Adicionales</small>
              <strong>{stats.extraGuestsCount}</strong>
            </span>
            <span>
              <small>Consumo cantina</small>
              <strong>{formatGuarani(eventCanteenTotal)}</strong>
            </span>
            <span>
              <small>Saldo evento</small>
              <strong>{formatGuarani(pendingAmount)}</strong>
            </span>
          </div>

          <div className="event-operation-actions">
            <button className="button primary" onClick={() => setIsGuestFormOpen(true)} type="button">
              <Plus size={18} />
              Registrar invitado
            </button>
            <Link className="button ghost" to={`${reservationsPath}?eventId=${selectedEvent.id}`}>
              Ver reserva
            </Link>
            <Link className="button ghost" to={canteenPath}>
              <Receipt size={17} />
              Ver consumo
            </Link>
            <button className="button ghost" onClick={() => setIsTvModalOpen(true)} type="button">
              <Monitor size={17} />
              Configurar TV
            </button>
            <button className="button danger" disabled={isUpdatingStatus} onClick={finishEvent} type="button">
              <Square size={18} />
              Finalizar evento
            </button>
          </div>
        </article>

        <article className="panel event-guest-panel featured">
          <div className="panel-header">
            <h2 className="panel-title">
              <Baby color="var(--green)" />
              Invitados registrados
            </h2>
            <StatusPill tone="available">{guests.length} ingresos</StatusPill>
          </div>
          <EventGuestList
            contractedChildrenCount={selectedEvent.contractedChildrenCount}
            error={guestsError}
            guests={guests}
            isLoading={isLoadingGuests}
          />
        </article>

        {isGuestFormOpen ? (
          <div className="modal-backdrop" role="presentation">
            <aside aria-label="Registrar invitado" className="visit-form-modal" role="dialog">
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Invitado de evento</p>
                  <h2 className="panel-title">
                    <ClipboardList color="var(--orange)" />
                    Registrar invitado
                  </h2>
                </div>
                <button className="icon-button modal-close" onClick={() => setIsGuestFormOpen(false)} type="button" aria-label="Cerrar formulario">
                  <X size={20} />
                </button>
              </div>
              <EventGuestForm event={selectedEvent} onCreated={() => setIsGuestFormOpen(false)} />
            </aside>
          </div>
        ) : null}
        {isTvModalOpen ? <EventTvImageModal event={selectedEvent} onClose={() => setIsTvModalOpen(false)} /> : null}
      </div>
    )
  }

  return (
    <div className="event-mode-grid">
      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <CalendarDays color="var(--orange)" />
            Evento del dia
          </h2>
          <StatusPill tone="info">Consulta manual</StatusPill>
        </div>
        <EventSelector
          error={error}
          events={events}
          isLoading={isLoading}
          onSelect={setSelectedEventId}
          selectedEventId={manualSelectedEventId}
          showAdminLink={showAdminLink}
        />
        {selectedEvent ? <EventSummaryCard event={selectedEvent} guestCount={guests.length || selectedEvent.registeredGuestsCount} /> : null}
      </article>

      {selectedEvent ? (
        <article className="panel event-guest-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Baby color="var(--green)" />
              Invitados registrados
            </h2>
            <button className="button primary" onClick={() => setIsGuestFormOpen(true)} type="button">
              <Plus size={18} />
              Registrar invitado
            </button>
          </div>
          <EventGuestList
            contractedChildrenCount={selectedEvent.contractedChildrenCount}
            error={guestsError}
            guests={guests}
            isLoading={isLoadingGuests}
          />
        </article>
      ) : null}

      {selectedEvent && isGuestFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <aside aria-label="Registrar invitado" className="visit-form-modal" role="dialog">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Invitado de evento</p>
                <h2 className="panel-title">
                  <ClipboardList color="var(--orange)" />
                  Registrar invitado
                </h2>
              </div>
              <button className="icon-button modal-close" onClick={() => setIsGuestFormOpen(false)} type="button" aria-label="Cerrar formulario">
                <X size={20} />
              </button>
            </div>
            <EventGuestForm event={selectedEvent} onCreated={() => setIsGuestFormOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

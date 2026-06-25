import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, History, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { EventBudgetsSection } from '../../components/events/EventBudgetsSection'
import { EventCreateForm } from '../../components/events/EventCreateForm'
import { EventDayCallout } from '../../components/events/EventDayCallout'
import { EventDetailPanel } from '../../components/events/EventDetailPanel'
import { EventPaymentModal } from '../../components/events/EventPaymentModal'
import { EventStatusBadge } from '../../components/events/EventStatusBadge'
import { EventTvImageModal } from '../../components/events/EventTvImageModal'
import { StatusPill } from '../../components/StatusPill'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useEventDayContext } from '../../hooks/useEventDayContext'
import { useEventGuests } from '../../hooks/useEvents'
import {
  canStartEvent,
  formatEventTimeRange,
  getEventCapacityStats,
  getTodayDateKey,
  isEventBlockingCalendar,
  isUpcomingEventStatus,
} from '../../utils/eventCapacity'
import { getEventFinancialLabel, getEventPaidAmount, getEventPendingAmount } from '../../utils/eventFinance'
import { formatGuarani } from '../../utils/money'
import { updateEventStatus } from '../../services/eventService'
import type { LuccaEvent } from '../../types'

type HistoryFilter = 'all' | 'finished' | 'cancelled'


const weekdayLabels = ['Lun', 'Mar', 'Mi?', 'Jue', 'Vie', 'S?b', 'Dom']

const formatDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) {
    return dateKey
  }
  return new Intl.DateTimeFormat('es-PY', { weekday: 'short', day: '2-digit', month: 'short' }).format(
    new Date(year, month - 1, day),
  )
}

const monthTitle = (date: Date) =>
  new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric' }).format(date)

const dateKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const buildCalendarDays = (monthDate: Date) => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const start = new Date(year, month, 1 - mondayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      dateKey: dateKeyFromDate(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    }
  })
}

const eventSortKey = (event: LuccaEvent) => `${event.date} ${event.startTime}`

const isUpcomingEvent = (event: LuccaEvent, todayKey: string) =>
  isUpcomingEventStatus(event.status) && event.date >= todayKey

export function AdminReservationsPage() {
  const { activeEvent, error, events, isLoading, mode, todayUpcomingEvent } = useEventDayContext()
  const { orders: canteenOrders } = useCanteenOrders()
  const [searchParams] = useSearchParams()
  const todayKey = getTodayDateKey()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState(todayKey)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null)
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey)
  const [eventActionError, setEventActionError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [tvEvent, setTvEvent] = useState<LuccaEvent | null>(null)
  const [paymentEvent, setPaymentEvent] = useState<LuccaEvent | null>(null)
  const [monthDate, setMonthDate] = useState(() => {
    const [year, month] = todayKey.split('-').map(Number)
    return new Date(year, month - 1, 1)
  })
  const [query, setQuery] = useState('')
  const featuredEvent = activeEvent ?? todayUpcomingEvent
  const { guests: featuredGuests } = useEventGuests(featuredEvent?.id)
  const featuredCanteenTotal = featuredEvent
    ? canteenOrders
        .filter((order) => order.eventId === featuredEvent.id && order.status !== 'cancelled')
        .reduce((sum, order) => sum + order.total, 0)
    : 0

  useEffect(() => {
    const eventId = searchParams.get('eventId')
    if (eventId && events.some((event) => event.id === eventId)) {
      setSelectedEventId(eventId)
    }
  }, [events, searchParams])

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const aUpcoming = isUpcomingEvent(a, todayKey)
        const bUpcoming = isUpcomingEvent(b, todayKey)
        if (aUpcoming !== bUpcoming) {
          return aUpcoming ? -1 : 1
        }
        return aUpcoming ? eventSortKey(a).localeCompare(eventSortKey(b)) : eventSortKey(b).localeCompare(eventSortKey(a))
      }),
    [events, todayKey],
  )
  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) || null : null

  const upcomingReservations = useMemo(
    () =>
      sortedEvents.filter((event) => {
        const normalizedQuery = query.trim().toLowerCase()
        const matchesQuery =
          !normalizedQuery ||
          event.title.toLowerCase().includes(normalizedQuery) ||
          event.customerName.toLowerCase().includes(normalizedQuery) ||
          event.birthdayChildName.toLowerCase().includes(normalizedQuery)
        return matchesQuery && isUpcomingEvent(event, todayKey) && event.id !== featuredEvent?.id
      }),
    [featuredEvent?.id, query, sortedEvents, todayKey],
  )

  const historyEvents = useMemo(
    () =>
      sortedEvents.filter((event) => {
        const normalizedQuery = query.trim().toLowerCase()
        const matchesQuery =
          !normalizedQuery ||
          event.title.toLowerCase().includes(normalizedQuery) ||
          event.customerName.toLowerCase().includes(normalizedQuery) ||
          event.birthdayChildName.toLowerCase().includes(normalizedQuery)
        return (
          matchesQuery &&
          (event.status === 'finished' || event.status === 'cancelled') &&
          (historyFilter === 'all' || event.status === historyFilter)
        )
      }),
    [historyFilter, query, sortedEvents],
  )

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate])
  const selectedDayEvents = sortedEvents.filter((event) => event.date === selectedDayKey)

  const openCreateForm = (dateKey = todayKey) => {
    if (dateKey < todayKey) {
      setEventActionError('No se puede crear una reserva en una fecha que ya pasó.')
      return
    }
    setCreateDate(dateKey)
    setShowCreateForm(true)
  }

  const changeMonth = (direction: -1 | 1) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1))
  }

  const goToday = () => {
    const [year, month] = todayKey.split('-').map(Number)
    setMonthDate(new Date(year, month - 1, 1))
    setSelectedDayKey(todayKey)
  }

  const startEvent = async (event: LuccaEvent) => {
    setUpdatingEventId(event.id)
    setEventActionError(null)
    try {
      await updateEventStatus(event.id, 'active')
      setSelectedEventId(event.id)
    } catch (error) {
      setEventActionError(error instanceof Error ? error.message : 'No se pudo empezar el evento.')
    } finally {
      setUpdatingEventId(null)
    }
  }

  const finishEvent = async (event: LuccaEvent) => {
    if (!window.confirm(`Finalizar el evento ${event.title}?`)) {
      return
    }

    setUpdatingEventId(event.id)
    setEventActionError(null)
    try {
      await updateEventStatus(event.id, 'finished')
    } catch (error) {
      setEventActionError(error instanceof Error ? error.message : 'No se pudo finalizar el evento.')
    } finally {
      setUpdatingEventId(null)
    }
  }

  return (
    <>
      <AdminModuleHeader
        eyebrow="Eventos"
        title="Reservas"
        description="Gestion? reservas, eventos privados y disponibilidad del parque."
        action={
          <button className="button primary" onClick={() => openCreateForm()} type="button">
            <CalendarPlus size={18} />
            Nueva reserva
          </button>
        }
      />

      <div className="reservations-stack">
        <article className="panel reservations-list-panel">
          {eventActionError ? <div className="form-alert error">{eventActionError}</div> : null}
          {featuredEvent ? (
            <EventDayCallout
              canteenTotal={featuredCanteenTotal}
              detailTo={`/admin/reservas?eventId=${featuredEvent.id}`}
              event={featuredEvent}
              guestCount={featuredGuests.length || featuredEvent.registeredGuestsCount}
              isBusy={updatingEventId === featuredEvent.id}
              onFinish={mode === 'active' ? () => finishEvent(featuredEvent) : undefined}
              onStart={mode === 'today' ? () => startEvent(featuredEvent) : undefined}
              onConfigureTv={() => setTvEvent(featuredEvent)}
              operationTo="/admin/recepcion"
              variant={activeEvent ? 'active' : 'today'}
            />
          ) : null}

          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarDays color="var(--turquoise)" />
              Próximas reservas
            </h2>
            <div className="module-actions">
              <StatusPill tone="info">{upcomingReservations.length} próximas</StatusPill>
              <button className="button ghost" onClick={() => setShowHistory(true)} type="button">
                <History size={17} />
                Ver historial
              </button>
            </div>
          </div>

          <div className="reservations-toolbar">
            <label className="field search-field">
              <span>
                <Search size={15} /> Buscar reserva
              </span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Evento, cumpleañero o cliente..." value={query} />
            </label>
          </div>

          {isLoading ? <div className="empty-state">Cargando reservas...</div> : null}
          {error ? <div className="form-alert error">No se pudieron cargar eventos: {error}</div> : null}
          {!isLoading && !error && upcomingReservations.length === 0 ? <div className="empty-state">No hay próximas reservas para mostrar.</div> : null}

          <div className="reservation-list">
            {upcomingReservations.map((event) => {
              const stats = getEventCapacityStats(event)
              const eventCanteenTotal = canteenOrders
                .filter((order) => order.eventId === event.id && order.status !== 'cancelled')
                .reduce((sum, order) => sum + order.total, 0)

              return (
                <article className={`reservation-row reservation-premium-card status-${event.status}`} key={event.id}>
                  <div className="reservation-identity">
                    <strong>{event.title || event.birthdayChildName}</strong>
                    <p>{event.customerName} · {formatDate(event.date)} · {formatEventTimeRange(event)}</p>
                    <small>
                      Cupo: {stats.contractedChildrenCount} niños · Ingresaron: {stats.registeredGuestsCount} · Cantina: {formatGuarani(eventCanteenTotal)}
                    </small>
                  </div>
                  <div className="reservation-status-zone">
                    <div className="reservation-badge-row">
                      <EventStatusBadge status={event.status} />
                      <StatusPill tone={getEventPendingAmount(event) <= 0 && (event.totalAmount || 0) > 0 ? 'available' : getEventPaidAmount(event) > 0 ? 'warning' : 'info'}>
                        {getEventFinancialLabel(event)}
                      </StatusPill>
                    </div>
                    {event.totalAmount ? (
                      <div className="reservation-finance-summary">
                        <span><small>Total contratado</small><strong>{formatGuarani(event.totalAmount)}</strong></span>
                        <span><small>Cobrado</small><strong>{formatGuarani(getEventPaidAmount(event))}</strong></span>
                        <span><small>Pendiente</small><strong>{formatGuarani(getEventPendingAmount(event))}</strong></span>
                      </div>
                    ) : (
                      <div className="reservation-no-amount">Monto aún no configurado</div>
                    )}
                  </div>
                  <div className="reservation-actions">
                    <button className="button primary" onClick={() => setPaymentEvent(event)} type="button">
                      Registrar cobro
                    </button>
                    <button className="button ghost" onClick={() => setSelectedEventId(event.id)} type="button">
                      Ver detalle
                    </button>
                    {canStartEvent(event) ? (
                      <button className="button secondary" disabled={updatingEventId === event.id} onClick={() => startEvent(event)} type="button">
                        Empezar evento
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </article>

        <article className="panel reservation-calendar-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarDays color="var(--green)" />
              Calendario de disponibilidad
            </h2>
            <div className="module-actions">
              <button className="button ghost" onClick={() => changeMonth(-1)} type="button" aria-label="Mes anterior">
                <ChevronLeft size={18} />
              </button>
              <strong className="calendar-month-label">{monthTitle(monthDate)}</strong>
              <button className="button ghost" onClick={() => changeMonth(1)} type="button" aria-label="Mes siguiente">
                <ChevronRight size={18} />
              </button>
              <button className="button secondary" onClick={goToday} type="button">
                Hoy
              </button>
            </div>
          </div>

          <div className="reservation-calendar-grid">
            {weekdayLabels.map((label) => (
              <strong className="reservation-calendar-label" key={label}>
                {label}
              </strong>
            ))}
            {calendarDays.map((day) => {
              const dayEvents = sortedEvents.filter((event) => event.date === day.dateKey)
              const primaryEvent = dayEvents.find(isEventBlockingCalendar)
              const isToday = day.dateKey === todayKey
              const isPast = day.dateKey < todayKey
              const statusClass = primaryEvent ? `occupied ${primaryEvent.status}` : isPast ? 'past' : 'available'
              return (
                <button
                  className={[
                    'reservation-day',
                    statusClass,
                    day.isCurrentMonth ? '' : 'outside',
                    isToday ? 'today' : '',
                    selectedDayKey === day.dateKey ? 'selected' : '',
                  ].join(' ')}
                  disabled={isPast}
                  key={day.dateKey}
                  onClick={() => setSelectedDayKey(day.dateKey)}
                  type="button"
                >
                  <span className="day-number">{day.day}</span>
                  {isToday ? <small className="today-badge">Hoy</small> : null}
                  {primaryEvent ? (
                    <span className="calendar-event-chip">
                      {primaryEvent.title}
                      {dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}
                    </span>
                  ) : (
                    <span className="calendar-event-chip available-chip">{isPast ? 'No disponible' : 'Disponible'}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="selected-day-panel">
            <div>
              <p className="eyebrow">Día seleccionado</p>
              <h3>{formatDate(selectedDayKey)}</h3>
            </div>
            {selectedDayKey < todayKey ? (
              <div className="selected-day-actions">
                <StatusPill tone="blocked">No disponible</StatusPill>
                <span className="muted">Las fechas pasadas no aceptan nuevas reservas.</span>
              </div>
            ) : selectedDayEvents.length === 0 ? (
              <div className="selected-day-actions">
                <StatusPill tone="available">Disponible</StatusPill>
                <button className="button primary" onClick={() => openCreateForm(selectedDayKey)} type="button">
                  Agregar reserva a este día
                </button>
              </div>
            ) : (
              <div className="selected-day-events">
                {selectedDayEvents.map((event) => (
                  <article className="selected-day-event" key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <p className="muted">
                        {event.customerName} ? {formatEventTimeRange(event)} ? cupo {event.contractedChildrenCount}
                      </p>
                    </div>
                    <EventStatusBadge status={event.status} />
                    <button className="button ghost" onClick={() => setSelectedEventId(event.id)} type="button">
                      Ver detalle completo
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>

      <EventBudgetsSection />

      {showCreateForm ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card reservation-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Nueva reserva</p>
                <h2>Crear evento</h2>
              </div>
              <button className="button ghost" onClick={() => setShowCreateForm(false)} type="button" aria-label="Cerrar formulario">
                <X size={18} />
                Cerrar
              </button>
            </div>
            <EventCreateForm
              events={events}
              initialDate={createDate}
              onCancel={() => setShowCreateForm(false)}
              onCreated={(eventId) => {
                setShowCreateForm(false)
                setSelectedEventId(eventId)
              }}
            />
          </section>
        </div>
      ) : null}

      {showHistory ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card reservation-detail-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Historial</p>
                <h2>Historial de eventos</h2>
              </div>
              <button className="button ghost" onClick={() => setShowHistory(false)} type="button" aria-label="Cerrar historial">
                <X size={18} />
                Cerrar
              </button>
            </div>
            <div className="reservation-filter-row secondary">
              {([
                ['all', 'Todos'],
                ['finished', 'Finalizados'],
                ['cancelled', 'Cancelados'],
              ] as Array<[HistoryFilter, string]>).map(([value, label]) => (
                <button className={historyFilter === value ? 'active' : ''} key={value} onClick={() => setHistoryFilter(value)} type="button">
                  {label}
                </button>
              ))}
            </div>
            {historyEvents.length === 0 ? <div className="empty-state">No hay eventos en historial para mostrar.</div> : null}
            <div className="reservation-list">
              {historyEvents.map((event) => {
                const stats = getEventCapacityStats(event)
                const eventCanteenTotal = canteenOrders
                  .filter((order) => order.eventId === event.id && order.status !== 'cancelled')
                  .reduce((sum, order) => sum + order.total, 0)
                return (
                  <article className={`reservation-row reservation-premium-card status-${event.status}`} key={event.id}>
                  <div className="reservation-identity">
                    <strong>{event.title || event.birthdayChildName}</strong>
                    <p>{event.customerName} · {formatDate(event.date)} · {formatEventTimeRange(event)}</p>
                    <small>
                      Cupo: {stats.contractedChildrenCount} niños · Ingresaron: {stats.registeredGuestsCount} · Cantina: {formatGuarani(eventCanteenTotal)}
                    </small>
                  </div>
                  <div className="reservation-status-zone">
                    <div className="reservation-badge-row">
                      <EventStatusBadge status={event.status} />
                      <StatusPill tone={getEventPendingAmount(event) <= 0 && (event.totalAmount || 0) > 0 ? 'available' : getEventPaidAmount(event) > 0 ? 'warning' : 'info'}>
                        {getEventFinancialLabel(event)}
                      </StatusPill>
                    </div>
                    {event.totalAmount ? (
                      <div className="reservation-finance-summary">
                        <span><small>Total contratado</small><strong>{formatGuarani(event.totalAmount)}</strong></span>
                        <span><small>Cobrado</small><strong>{formatGuarani(getEventPaidAmount(event))}</strong></span>
                        <span><small>Pendiente</small><strong>{formatGuarani(getEventPendingAmount(event))}</strong></span>
                      </div>
                    ) : (
                      <div className="reservation-no-amount">Monto aún no configurado</div>
                    )}
                  </div>
                  <div className="reservation-actions">
                    <button className="button primary" onClick={() => setPaymentEvent(event)} type="button">
                      Registrar cobro
                    </button>
                    <button className="button ghost" onClick={() => setSelectedEventId(event.id)} type="button">
                      Ver detalle
                    </button>
                    {canStartEvent(event) ? (
                      <button className="button secondary" disabled={updatingEventId === event.id} onClick={() => startEvent(event)} type="button">
                        Empezar evento
                      </button>
                    ) : null}
                  </div>
                </article>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}

      {selectedEvent ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card reservation-detail-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Detalle de reserva</p>
                <h2>{selectedEvent.title}</h2>
              </div>
              <button className="button ghost" onClick={() => setSelectedEventId(null)} type="button" aria-label="Cerrar detalle">
                <X size={18} />
                Cerrar
              </button>
            </div>
            <EventDetailPanel event={selectedEvent} />
          </section>
        </div>
      ) : null}

      {tvEvent ? <EventTvImageModal event={tvEvent} onClose={() => setTvEvent(null)} /> : null}
      {paymentEvent ? <EventPaymentModal event={paymentEvent} onClose={() => setPaymentEvent(null)} /> : null}
    </>
  )
}

import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { EventCreateForm } from '../../components/events/EventCreateForm'
import { EventDetailPanel } from '../../components/events/EventDetailPanel'
import { EventStatusBadge } from '../../components/events/EventStatusBadge'
import { StatusPill } from '../../components/StatusPill'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useEvents } from '../../hooks/useEvents'
import { formatEventTimeRange, getEventCapacityStats, getTodayDateKey } from '../../utils/eventCapacity'
import { formatGuarani } from '../../utils/money'
import type { EventStatus, LuccaEvent } from '../../types'

const statusFilters: Array<{ label: string; value: 'upcoming' | EventStatus | 'all' }> = [
  { label: 'Próximas', value: 'upcoming' },
  { label: 'Confirmadas', value: 'confirmed' },
  { label: 'En curso', value: 'active' },
  { label: 'Finalizadas', value: 'finished' },
  { label: 'Canceladas', value: 'cancelled' },
  { label: 'Todas', value: 'all' },
]

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
  ['inquiry', 'reserved', 'confirmed', 'active'].includes(event.status) && event.date >= todayKey

export function AdminReservationsPage() {
  const { error, events, isLoading } = useEvents()
  const { orders: canteenOrders } = useCanteenOrders()
  const todayKey = getTodayDateKey()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState(todayKey)
  const [selectedEvent, setSelectedEvent] = useState<LuccaEvent | null>(null)
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey)
  const [monthDate, setMonthDate] = useState(() => {
    const [year, month] = todayKey.split('-').map(Number)
    return new Date(year, month - 1, 1)
  })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof statusFilters)[number]['value']>('upcoming')

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

  const filteredEvents = useMemo(
    () =>
      sortedEvents.filter((event) => {
        const normalizedQuery = query.trim().toLowerCase()
        const matchesQuery =
          !normalizedQuery ||
          event.title.toLowerCase().includes(normalizedQuery) ||
          event.customerName.toLowerCase().includes(normalizedQuery) ||
          event.birthdayChildName.toLowerCase().includes(normalizedQuery)
        const matchesFilter =
          filter === 'all' ||
          (filter === 'upcoming' && isUpcomingEvent(event, todayKey)) ||
          event.status === filter
        return matchesQuery && matchesFilter
      }),
    [filter, query, sortedEvents, todayKey],
  )

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate])
  const selectedDayEvents = sortedEvents.filter((event) => event.date === selectedDayKey)

  const openCreateForm = (dateKey = todayKey) => {
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

  return (
    <>
      <AdminModuleHeader
        eyebrow="Eventos"
        title="Reservas"
        description="Gestioná reservas, eventos privados y disponibilidad del parque."
        action={
          <button className="button primary" onClick={() => openCreateForm()} type="button">
            <CalendarPlus size={18} />
            Nueva reserva
          </button>
        }
      />

      <div className="reservations-stack">
        <article className="panel reservations-list-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Filter color="var(--turquoise)" />
              Reservas y eventos
            </h2>
            <StatusPill tone="info">{filteredEvents.length} visibles</StatusPill>
          </div>

          <div className="reservations-toolbar">
            <label className="field search-field">
              <span>
                <Search size={15} /> Buscar reserva
              </span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Evento, cumpleañero o cliente..." value={query} />
            </label>
            <div className="reservation-filter-row">
              {statusFilters.map((item) => (
                <button className={filter === item.value ? 'active' : ''} key={item.value} onClick={() => setFilter(item.value)} type="button">
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? <div className="empty-state">Cargando reservas...</div> : null}
          {error ? <div className="form-alert error">No se pudieron cargar eventos: {error}</div> : null}
          {!isLoading && !error && filteredEvents.length === 0 ? <div className="empty-state">No hay reservas para mostrar.</div> : null}

          <div className="reservation-list">
            {filteredEvents.map((event) => {
              const stats = getEventCapacityStats(event)
              const eventCanteenTotal = canteenOrders
                .filter((order) => order.eventId === event.id && order.status !== 'cancelled')
                .reduce((sum, order) => sum + order.total, 0)

              return (
                <article className={`reservation-row status-${event.status}`} key={event.id}>
                  <div className="reservation-main">
                    <strong>{event.title}</strong>
                    <p>
                      {event.customerName} · {formatDate(event.date)} · {formatEventTimeRange(event)}
                    </p>
                    <small>
                      Cupo: {stats.contractedChildrenCount} niños · Ingresaron: {stats.registeredGuestsCount} · Cantina:{' '}
                      {formatGuarani(eventCanteenTotal)}
                    </small>
                  </div>
                  <div className="reservation-money">
                    <span>Total</span>
                    <strong>{event.totalAmount ? formatGuarani(event.totalAmount) : 'Sin monto'}</strong>
                    <small>
                      Seña {formatGuarani(event.depositAmount ?? 0)} · Saldo {formatGuarani(event.pendingAmount ?? 0)}
                    </small>
                  </div>
                  <EventStatusBadge status={event.status} />
                  <div className="module-actions">
                    <button className="button ghost" onClick={() => setSelectedEvent(event)} type="button">
                      Ver detalle
                    </button>
                    {event.status === 'reserved' || event.status === 'confirmed' ? (
                      <button className="button secondary" onClick={() => setSelectedEvent(event)} type="button">
                        Activar evento
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
              const primaryEvent = dayEvents[0]
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
                    <span className="calendar-event-chip available-chip">Disponible</span>
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
            {selectedDayEvents.length === 0 ? (
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
                        {event.customerName} · {formatEventTimeRange(event)} · cupo {event.contractedChildrenCount}
                      </p>
                    </div>
                    <EventStatusBadge status={event.status} />
                    <button className="button ghost" onClick={() => setSelectedEvent(event)} type="button">
                      Ver detalle completo
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>

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
                const created = events.find((event) => event.id === eventId)
                if (created) {
                  setSelectedEvent(created)
                }
              }}
            />
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
              <button className="button ghost" onClick={() => setSelectedEvent(null)} type="button" aria-label="Cerrar detalle">
                <X size={18} />
                Cerrar
              </button>
            </div>
            <EventDetailPanel event={selectedEvent} />
          </section>
        </div>
      ) : null}
    </>
  )
}

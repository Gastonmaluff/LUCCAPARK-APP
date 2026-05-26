import { CalendarDays, ChefHat, Coins, Gift, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { EventDayCallout } from '../../components/events/EventDayCallout'
import { EventTvImageModal } from '../../components/events/EventTvImageModal'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useClientsData } from '../../hooks/useClients'
import { useEventDayContext } from '../../hooks/useEventDayContext'
import { useEventGuests } from '../../hooks/useEvents'
import { updateEventStatus } from '../../services/eventService'
import { getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import type { LuccaEvent } from '../../types'

const eventStatusLabel: Record<string, string> = {
  active: 'En curso',
  cancelled: 'Cancelada',
  confirmed: 'Proxima / Reservada',
  finished: 'Finalizada',
  inquiry: 'Proxima / Reservada',
  reserved: 'Proxima / Reservada',
}

const formatEventDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return dateKey
  return new Intl.DateTimeFormat('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function AdminDashboardPage() {
  const todayKey = getLocalDateKey()
  const { visits: activeVisits } = useActiveVisits()
  const { orders: canteenOrders } = useCanteenOrders()
  const { eventGuests, visits } = useClientsData()
  const { activeEvent, events, featuredEvent, mode } = useEventDayContext()
  const { guests: featuredGuests } = useEventGuests(featuredEvent?.id)
  const [eventActionError, setEventActionError] = useState<string | null>(null)
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false)
  const [tvEvent, setTvEvent] = useState<LuccaEvent | null>(null)

  const visitsToday = visits.filter((visit) => getLocalDateKey(visit.startedAt ?? visit.createdAt ?? new Date(0)) === todayKey)
  const activeVisitsToday = activeVisits.filter((visit) => getLocalDateKey(visit.startedAt) === todayKey)
  const allVisitIdsToday = new Set([...visitsToday.map((visit) => visit.id), ...activeVisitsToday.map((visit) => visit.id)])
  const paidVisitsToday = visitsToday.filter((visit) => visit.paymentStatus === 'paid')
  const paidCanteenToday = canteenOrders.filter((order) => order.status === 'paid' && order.paidAt && getLocalDateKey(order.paidAt) === todayKey)
  const eventGuestsToday = eventGuests.filter((guest) => getLocalDateKey(guest.checkedInAt) === todayKey)
  const upcomingEvents = events
    .filter((event) => ['inquiry', 'reserved', 'confirmed'].includes(event.status) && event.date >= todayKey && event.id !== featuredEvent?.id)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
  const nextEvent = upcomingEvents[0]
  const featuredCanteenTotal = featuredEvent
    ? canteenOrders.filter((order) => order.eventId === featuredEvent.id && order.status !== 'cancelled').reduce((sum, order) => sum + order.total, 0)
    : 0

  const visitsCollected = paidVisitsToday.reduce((sum, visit) => sum + (visit.amountCharged ?? 0), 0)
  const canteenCollected = paidCanteenToday.reduce((sum, order) => sum + order.total, 0)
  const totalCollected = visitsCollected + canteenCollected
  const childrenToday =
    visitsToday.reduce((sum, visit) => sum + (visit.childrenCount ?? 1), 0) +
    activeVisitsToday.reduce((sum, visit) => (visitsToday.some((item) => item.id === visit.id) ? sum : sum + visit.childrenCount), 0) +
    eventGuestsToday.length
  const normalChildrenToday = Math.max(0, childrenToday - eventGuestsToday.length)

  const changeFeaturedStatus = async (status: 'active' | 'finished') => {
    if (!featuredEvent) return
    if (status === 'finished' && !window.confirm(`Finalizar el evento ${featuredEvent.title}?`)) return

    setIsUpdatingEvent(true)
    setEventActionError(null)
    try {
      await updateEventStatus(featuredEvent.id, status)
    } catch (error) {
      setEventActionError(error instanceof Error ? error.message : 'No se pudo actualizar el evento.')
    } finally {
      setIsUpdatingEvent(false)
    }
  }

  return (
    <>
      <AdminModuleHeader
        eyebrow="Panel administrativo"
        title="Control"
        description="Resumen ejecutivo del dia: ingresos, ninos, cantina y proximo evento."
      />

      {featuredEvent ? (
        <>
          {eventActionError ? <div className="form-alert error">{eventActionError}</div> : null}
          <EventDayCallout
            canteenTotal={featuredCanteenTotal}
            detailTo={`/admin/reservas?eventId=${featuredEvent.id}`}
            event={featuredEvent}
            guestCount={featuredGuests.length || featuredEvent.registeredGuestsCount}
            isBusy={isUpdatingEvent}
            onFinish={mode === 'active' ? () => changeFeaturedStatus('finished') : undefined}
            onStart={mode === 'today' ? () => changeFeaturedStatus('active') : undefined}
            onConfigureTv={() => setTvEvent(featuredEvent)}
            operationTo="/admin/recepcion"
            variant={activeEvent ? 'active' : 'today'}
          />
        </>
      ) : null}

      <div className="metric-grid control-metric-grid">
        <MetricCard
          label="Ingresos de hoy"
          value={formatGuarani(totalCollected)}
          detail={
            <div className="metric-breakdown">
              <span><b>Parque - {normalChildrenToday} ninos</b><strong>{formatGuarani(visitsCollected)}</strong></span>
              <span><b>Cantina - {paidCanteenToday.length} cuentas</b><strong>{formatGuarani(canteenCollected)}</strong></span>
            </div>
          }
          icon={<Coins />}
          color="var(--orange)"
        />
        <MetricCard
          label="Ninos que ingresaron hoy"
          value={String(childrenToday)}
          detail={
            <div className="metric-breakdown compact">
              <span>Visitas normales: <strong>{allVisitIdsToday.size}</strong></span>
              <span>Invitados de evento: <strong>{eventGuestsToday.length}</strong></span>
            </div>
          }
          icon={<Users />}
          color="var(--green)"
        />
        <MetricCard
          label="Ingresos de cantina de hoy"
          value={formatGuarani(canteenCollected)}
          detail={<span className="metric-highlight-number"><strong>{paidCanteenToday.length}</strong> cuentas cobradas</span>}
          icon={<ChefHat />}
          color="var(--turquoise)"
        />
        <MetricCard
          label="Proximo evento"
          value={nextEvent ? nextEvent.title : 'Sin eventos'}
          detail={nextEvent ? `${formatEventDate(nextEvent.date)} - ${nextEvent.startTime}-${nextEvent.endTime}` : 'No hay eventos proximos registrados.'}
          icon={<Gift />}
          color="var(--yellow)"
        />
      </div>

      <div className="control-stack">
        <article className="panel control-full-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarDays color="var(--turquoise)" />
              Proximos eventos
            </h2>
            <StatusPill tone="info">{upcomingEvents.length} proximos</StatusPill>
          </div>
          {upcomingEvents.length === 0 ? <div className="empty-state">No hay eventos proximos registrados.</div> : null}
          <div className="module-list">
            {upcomingEvents.slice(0, 6).map((event) => (
              <div className="module-row control-event-row" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <p className="muted">
                    {event.customerName} - {formatEventDate(event.date)} - {event.startTime}-{event.endTime} - cupo {event.contractedChildrenCount}
                  </p>
                </div>
                <StatusPill tone="warning">{eventStatusLabel[event.status] ?? event.status}</StatusPill>
                <Link className="button ghost" to={`/admin/reservas?eventId=${event.id}`}>
                  Ver detalle
                </Link>
              </div>
            ))}
          </div>
        </article>
      </div>
      {tvEvent ? <EventTvImageModal event={tvEvent} onClose={() => setTvEvent(null)} /> : null}
    </>
  )
}

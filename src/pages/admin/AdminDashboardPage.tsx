import { AlertTriangle, CalendarDays, ChefHat, Coins, Gift, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useClientsData } from '../../hooks/useClients'
import { useEvents } from '../../hooks/useEvents'
import { getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'

const eventStatusLabel: Record<string, string> = {
  inquiry: 'Consulta',
  reserved: 'Reservado',
  confirmed: 'Confirmado',
  active: 'Activo',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}

const formatEventDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) {
    return dateKey
  }

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
  const { events } = useEvents()

  const visitsToday = visits.filter((visit) => getLocalDateKey(visit.startedAt ?? visit.createdAt ?? new Date(0)) === todayKey)
  const activeVisitsToday = activeVisits.filter((visit) => getLocalDateKey(visit.startedAt) === todayKey)
  const allVisitIdsToday = new Set([...visitsToday.map((visit) => visit.id), ...activeVisitsToday.map((visit) => visit.id)])
  const paidVisitsToday = visitsToday.filter((visit) => visit.paymentStatus === 'paid')
  const paidCanteenToday = canteenOrders.filter((order) => order.status === 'paid' && order.paidAt && getLocalDateKey(order.paidAt) === todayKey)
  const eventGuestsToday = eventGuests.filter((guest) => getLocalDateKey(guest.checkedInAt) === todayKey)
  const openCanteenOrders = canteenOrders.filter((order) => order.status === 'open')
  const pendingVisits = [...visitsToday, ...activeVisitsToday].filter((visit, index, list) => {
    const firstIndex = list.findIndex((item) => item.id === visit.id)
    return firstIndex === index && visit.paymentStatus !== 'paid'
  })
  const pendingEvents = events.filter((event) => ['inquiry', 'reserved'].includes(event.status) && event.date >= todayKey)
  const upcomingEvents = events
    .filter((event) => ['reserved', 'confirmed', 'active'].includes(event.status) && event.date >= todayKey)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
  const nextEvent = upcomingEvents[0]

  const visitsCollected = paidVisitsToday.reduce((sum, visit) => sum + (visit.amountCharged ?? 0), 0)
  const canteenCollected = paidCanteenToday.reduce((sum, order) => sum + order.total, 0)
  const totalCollected = visitsCollected + canteenCollected
  const childrenToday =
    visitsToday.reduce((sum, visit) => sum + (visit.childrenCount ?? 1), 0) +
    activeVisitsToday.reduce(
      (sum, visit) => (visitsToday.some((item) => item.id === visit.id) ? sum : sum + visit.childrenCount),
      0,
    ) +
    eventGuestsToday.length
  const openCanteenTotal = openCanteenOrders.reduce((sum, order) => sum + order.total, 0)
  const pendingVisitsAmount = pendingVisits.reduce((sum, visit) => sum + (visit.amountCharged ?? visit.defaultAmount ?? 0), 0)

  return (
    <>
      <AdminModuleHeader
        eyebrow="Panel administrativo"
        title="Control"
        description="Datos reales del dia: ingresos, ninos ingresados, cantina y pendientes operativos."
      />

      <div className="metric-grid control-metric-grid">
        <MetricCard
          label="Ingresos de hoy"
          value={formatGuarani(totalCollected)}
          detail={`Visitas ${formatGuarani(visitsCollected)} · Cantina ${formatGuarani(canteenCollected)}`}
          icon={<Coins />}
          color="var(--orange)"
        />
        <MetricCard
          label="Niños que ingresaron hoy"
          value={String(childrenToday)}
          detail={`${allVisitIdsToday.size} visitas · ${eventGuestsToday.length} invitados`}
          icon={<Users />}
          color="var(--green)"
        />
        <MetricCard
          label="Ingresos de cantina de hoy"
          value={formatGuarani(canteenCollected)}
          detail={`${paidCanteenToday.length} cuentas cobradas`}
          icon={<ChefHat />}
          color="var(--turquoise)"
        />
        <MetricCard
          label="Próximo evento"
          value={nextEvent ? nextEvent.title : 'Sin eventos'}
          detail={nextEvent ? `${formatEventDate(nextEvent.date)} · ${nextEvent.startTime}-${nextEvent.endTime}` : 'No hay eventos próximos registrados.'}
          icon={<Gift />}
          color="var(--yellow)"
        />
      </div>

      <div className="control-stack">
        <article className="panel control-full-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarDays color="var(--turquoise)" />
              Próximos eventos
            </h2>
            <StatusPill tone="info">{upcomingEvents.length} próximos</StatusPill>
          </div>
          {upcomingEvents.length === 0 ? <div className="empty-state">No hay eventos próximos registrados.</div> : null}
          <div className="module-list">
            {upcomingEvents.slice(0, 6).map((event) => (
              <div className="module-row control-event-row" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <p className="muted">
                    {event.customerName} · {formatEventDate(event.date)} · {event.startTime}-{event.endTime} · cupo {event.contractedChildrenCount}
                  </p>
                </div>
                <StatusPill tone={event.status === 'confirmed' || event.status === 'active' ? 'available' : 'warning'}>
                  {eventStatusLabel[event.status] ?? event.status}
                </StatusPill>
                <Link className="button ghost" to="/admin/reservas">
                  Ver detalle
                </Link>
              </div>
            ))}
          </div>
        </article>

        <article className="panel control-full-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <AlertTriangle color="var(--orange)" />
              Pendientes de hoy
            </h2>
            <StatusPill tone="warning">
              {pendingVisits.length + openCanteenOrders.length + pendingEvents.length} pendientes
            </StatusPill>
          </div>
          <div className="pending-grid">
            <Link className="pending-card" to="/admin/recepcion">
              <span>Visitas con cobro pendiente</span>
              <strong>{pendingVisits.length}</strong>
              <small>{formatGuarani(pendingVisitsAmount)}</small>
            </Link>
            <Link className="pending-card" to="/admin/cantina">
              <span>Cuentas de cantina abiertas</span>
              <strong>{openCanteenOrders.length}</strong>
              <small>{formatGuarani(openCanteenTotal)}</small>
            </Link>
            <Link className="pending-card" to="/admin/reservas">
              <span>Eventos por confirmar</span>
              <strong>{pendingEvents.length}</strong>
              <small>{pendingEvents.length ? 'Revisar reservas' : 'Sin pendientes'}</small>
            </Link>
          </div>
        </article>
      </div>
    </>
  )
}

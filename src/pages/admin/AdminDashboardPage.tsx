import { BarChart3, CalendarDays, CalendarRange, ChefHat, Coins, ClipboardList, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { CalendarPreview } from '../../components/CalendarPreview'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { demoEvents } from '../../data/demoData'

export function AdminDashboardPage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Panel administrativo"
        title="Dashboard"
        description="Vista general demo para controlar ocupacion, eventos, ingresos y accesos rapidos."
        action={
          <div className="quick-actions">
            <Link className="button primary" to="/admin/recepcion">
              <ClipboardList size={18} />
              Recepcion
            </Link>
            <Link className="button secondary" to="/admin/calendario">
              <CalendarRange size={18} />
              Calendario
            </Link>
            <Link className="button ghost" to="/admin/cantina">
              <ChefHat size={18} />
              Cantina
            </Link>
          </div>
        }
      />

      <div className="metric-grid">
        <MetricCard label="Ingresos de hoy" value="G 12.450.000" detail="Demo - 18% vs. ayer" icon={<Coins />} color="var(--orange)" />
        <MetricCard label="Ninos registrados" value="236" detail="Metadata preparada" icon={<Users />} color="var(--green)" />
        <MetricCard label="Ocupacion actual" value="68%" detail="163 / 240 ninos" icon={<TrendingUp />} color="var(--turquoise)" />
        <MetricCard label="Cumpleanos reservados" value="5" detail="Eventos de hoy" icon={<CalendarDays />} color="var(--yellow)" />
      </div>

      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <BarChart3 color="var(--orange)" />
              Ingresos por dia
            </h2>
            <StatusPill tone="info">Demo</StatusPill>
          </div>
          <div className="mini-chart" aria-label="Grafico demo">
            {[58, 66, 64, 53, 78, 68, 61].map((height, index) => (
              <span className="bar" style={{ height: `${height}%` }} key={index} />
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarDays color="var(--turquoise)" />
              Proximos eventos
            </h2>
            <StatusPill tone="available">Firestore ready</StatusPill>
          </div>
          <div className="event-list">
            {demoEvents.map((event) => (
              <div className="event-card" key={event.name}>
                <div>
                  <strong>{event.name}</strong>
                  <p className="muted">
                    {event.client} - {event.date} - {event.time}
                  </p>
                </div>
                <StatusPill tone={event.status === 'confirmed' ? 'available' : 'warning'}>{event.status}</StatusPill>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <CalendarRange color="var(--green)" />
              Calendario mensual
            </h2>
            <Link className="button ghost" to="/admin/calendario">
              Ver calendario
            </Link>
          </div>
          <CalendarPreview />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Users color="var(--turquoise)" />
              Control de cupos
            </h2>
            <Link className="button ghost" to="/admin/reservas">
              Ver reservas
            </Link>
          </div>
          <div className="event-card">
            <div>
              <strong>Cumple de Mateo</strong>
              <p className="muted">Invitados registrados: 38 / 40</p>
              <div className="progress" aria-label="38 de 40 invitados">
                <span style={{ width: '95%' }} />
              </div>
            </div>
            <StatusPill tone="warning">Cerca del cupo</StatusPill>
          </div>
        </article>
      </div>
    </>
  )
}

import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChefHat,
  ClipboardList,
  Coins,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { CalendarPreview } from '../components/CalendarPreview'
import { MetricCard } from '../components/MetricCard'
import { StatusPill } from '../components/StatusPill'
import { demoEvents } from '../data/demoData'

const navItems = [
  ['Dashboard', LayoutDashboard],
  ['Recepcion', ClipboardList],
  ['Reservas', CalendarDays],
  ['Calendario', CalendarRange],
  ['Cantina', ChefHat],
  ['Finanzas', WalletCards],
  ['Reportes', BarChart3],
  ['Configuracion', Settings],
] as const

export function AdminPage() {
  return (
    <main className="internal-page">
      <section className="internal-shell">
        <header className="admin-topbar">
          <BrandLogo className="compact" />
          <nav className="internal-nav" aria-label="Admin">
            {navItems.map(([label, Icon], index) => (
              <a className={`nav-chip ${index === 0 ? 'active' : ''}`} href="#dashboard" key={label}>
                <Icon size={17} />
                {label}
              </a>
            ))}
          </nav>
          <Link className="button ghost" to="/recepcion">
            Abrir recepcion
          </Link>
        </header>

        <div className="metric-grid">
          <MetricCard label="Ingresos de hoy" value="G 12.450.000" detail="Demo · 18% vs. ayer" icon={<Coins />} color="var(--orange)" />
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
                      {event.client} · {event.date} · {event.time}
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
            </div>
            <CalendarPreview />
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <Users color="var(--turquoise)" />
                Control de cupos
              </h2>
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
            <div className="empty-state" style={{ marginTop: 14 }}>
              Modulos de cantina, finanzas, presupuestos, PDF y reportes quedan visibles en la arquitectura para fases posteriores.
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

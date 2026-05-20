import { BarChart3, Filter, LineChart } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { demoReportCards } from '../../data/demoData'

export function AdminReportsPage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Analitica"
        title="Reportes"
        description="Filtros y visualizaciones placeholder para estadisticas futuras."
        action={
          <button
            className="button ghost"
            onClick={() => window.alert('Filtro demo. Los reportes reales se implementan en fases posteriores.')}
            type="button"
          >
            <Filter size={18} />
            Filtrar demo
          </button>
        }
      />
      <div className="metric-grid reports-grid">
        {demoReportCards.map((card, index) => (
          <MetricCard
            color={['var(--turquoise)', 'var(--orange)', 'var(--green)'][index]}
            detail={card.detail}
            icon={<LineChart />}
            key={card.label}
            label={card.label}
            value={card.value}
          />
        ))}
      </div>
      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <BarChart3 color="var(--orange)" />
            Evolucion mensual
          </h2>
          <StatusPill tone="info">Placeholder</StatusPill>
        </div>
        <div className="mini-chart" aria-label="Grafico placeholder de reportes">
          {[34, 48, 58, 46, 70, 82, 76, 90].map((height, index) => (
            <span className="bar turquoise" style={{ height: `${height}%` }} key={index} />
          ))}
        </div>
        <div className="empty-state" style={{ marginTop: 16 }}>
          En fases posteriores esta vista mostrara estadisticas reales de visitas, reservas, cantina, finanzas y cumpleanos.
        </div>
      </article>
    </>
  )
}

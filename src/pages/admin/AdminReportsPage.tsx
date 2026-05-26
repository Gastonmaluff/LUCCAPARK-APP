import { BarChart3, LineChart } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'

const reportIdeas = [
  'Niños por periodo y horarios de mayor concurrencia',
  'Clientes recurrentes y cumpleaños próximos',
  'Eventos realizados por mes',
  'Productos más y menos vendidos',
  'Ticket promedio por visita y por evento',
]

export function AdminReportsPage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Analitica"
        title="Reportes"
        description="Analisis comercial y operativo. La caja, gastos y cierres quedan en Finanzas y cierres."
      />
      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <BarChart3 color="var(--orange)" />
            Reportes analiticos
          </h2>
          <StatusPill tone="info">Preparado sin datos demo</StatusPill>
        </div>
        <div className="module-list">
          {reportIdeas.map((idea) => (
            <div className="module-row" key={idea}>
              <span>{idea}</span>
              <LineChart color="var(--turquoise)" size={18} />
            </div>
          ))}
        </div>
        <div className="empty-state" style={{ marginTop: 16 }}>
          Los reportes se construiran sobre datos reales de visitas, clientes, eventos y productos. No se muestran cierres ni caja financiera en este modulo.
        </div>
      </article>
    </>
  )
}

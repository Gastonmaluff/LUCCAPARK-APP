import { Banknote, CalendarCheck, WalletCards } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { demoFinanceCards } from '../../data/demoData'

export function AdminFinancePage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Caja"
        title="Finanzas y cierres"
        description="Pantalla base para ingresos, pendientes y cierres diarios."
        action={
          <button
            className="button primary"
            onClick={() => window.alert('Cierre diario demo. En Fase 2 se guardara el cierre real.')}
            type="button"
          >
            <CalendarCheck size={18} />
            Hacer cierre diario
          </button>
        }
      />
      <div className="metric-grid">
        {demoFinanceCards.map((card, index) => (
          <MetricCard
            color={['var(--orange)', 'var(--green)', 'var(--yellow)', 'var(--turquoise)'][index]}
            detail={card.detail}
            icon={index === 2 ? <WalletCards /> : <Banknote />}
            key={card.label}
            label={card.label}
            value={card.value}
          />
        ))}
      </div>
      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <WalletCards color="var(--turquoise)" />
            Cierre diario demo
          </h2>
          <StatusPill tone="warning">Pendiente</StatusPill>
        </div>
        <div className="module-list">
          {['Efectivo G 4.200.000', 'Tarjeta G 3.100.000', 'Transferencia G 2.750.000', 'QR / Otros G 2.400.000'].map((item) => (
            <div className="module-row" key={item}>
              <span>{item}</span>
              <StatusPill tone="info">Editable luego</StatusPill>
            </div>
          ))}
        </div>
      </article>
    </>
  )
}

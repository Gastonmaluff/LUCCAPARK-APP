interface MetricCardProps {
  label: string
  value: string
  detail: React.ReactNode
  icon: React.ReactNode
  color: string
}

export function MetricCard({ label, value, detail, icon, color }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-row">
        <div>
          <p className="eyebrow" style={{ color }}>
            {label}
          </p>
          <strong>{value}</strong>
          <div className="metric-detail">{detail}</div>
        </div>
        <span className="metric-icon" style={{ background: `${color}1f`, color }}>
          {icon}
        </span>
      </div>
    </article>
  )
}

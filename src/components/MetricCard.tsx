interface MetricCardProps {
  label: string
  value: string
  detail: string
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
          <p className="muted">{detail}</p>
        </div>
        <span className="metric-icon" style={{ background: `${color}1f`, color }}>
          {icon}
        </span>
      </div>
    </article>
  )
}

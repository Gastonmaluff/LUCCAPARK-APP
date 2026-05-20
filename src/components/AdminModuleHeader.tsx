interface AdminModuleHeaderProps {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}

export function AdminModuleHeader({ action, description, eyebrow, title }: AdminModuleHeaderProps) {
  return (
    <header className="module-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action ? <div className="module-actions">{action}</div> : null}
    </header>
  )
}

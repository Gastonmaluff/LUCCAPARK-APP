interface StatusPillProps {
  tone: 'available' | 'reserved' | 'blocked' | 'info' | 'paid' | 'warning' | 'danger'
  children: React.ReactNode
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  children?: React.ReactNode
}

export function SectionHeading({ eyebrow, title, children }: SectionHeadingProps) {
  return (
    <header className="section-heading">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </header>
  )
}

import { LogOut, ShieldAlert } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../config/firebase'
import { BrandLogo } from './BrandLogo'

interface AccessDeniedProps {
  homeTo?: string
  message: string
  title: string
}

export function AccessDenied({ homeTo, message, title }: AccessDeniedProps) {
  return (
    <main className="internal-page">
      <section className="internal-shell">
        <article className="panel auth-card">
          <BrandLogo className="compact" />
          <ShieldAlert color="var(--orange)" size={34} />
          <div>
            <p className="eyebrow">Seguridad de acceso</p>
            <h1>{title}</h1>
            <p className="muted">{message}</p>
          </div>
          <div className="module-actions">
            {homeTo ? <Link className="button primary" to={homeTo}>Ir a mi panel</Link> : null}
            <button className="button ghost" onClick={() => void signOut(auth)} type="button">
              <LogOut size={17} />
              Cerrar sesión
            </button>
          </div>
        </article>
      </section>
    </main>
  )
}

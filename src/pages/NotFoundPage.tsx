import { Link } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'

export function NotFoundPage() {
  return (
    <main className="login-page">
      <section className="login-card" style={{ textAlign: 'center' }}>
        <BrandLogo />
        <p className="eyebrow">Ruta no encontrada</p>
        <h1 style={{ margin: 0 }}>Esta pagina no existe</h1>
        <p className="muted">La app ya esta preparada para recuperar rutas internas en GitHub Pages.</p>
        <Link className="button primary" to="/">
          Volver al inicio
        </Link>
      </section>
    </main>
  )
}

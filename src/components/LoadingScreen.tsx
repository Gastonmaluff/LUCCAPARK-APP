import { BrandLogo } from './BrandLogo'

export function LoadingScreen() {
  return (
    <main className="login-page" aria-live="polite">
      <section className="login-card" style={{ textAlign: 'center' }}>
        <BrandLogo />
        <div>
          <p className="eyebrow">Sistema Lucca Park</p>
          <h1 style={{ margin: '6px 0 0' }}>Cargando sistema...</h1>
        </div>
      </section>
    </main>
  )
}

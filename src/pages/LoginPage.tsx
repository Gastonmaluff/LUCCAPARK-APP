import { Lock, Mail } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'

export function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <BrandLogo />
        <div>
          <p className="eyebrow">Acceso interno</p>
          <h1 style={{ margin: '4px 0' }}>Ingresar al sistema</h1>
          <p className="muted">Firebase Auth queda preparado para activar roles en Fase 2.</p>
        </div>
        <form className="form-grid">
          <label className="field">
            <span>
              <Mail size={16} /> Email
            </span>
            <input placeholder="admin@luccapark.com" type="email" />
          </label>
          <label className="field">
            <span>
              <Lock size={16} /> Contrasena
            </span>
            <input placeholder="••••••••" type="password" />
          </label>
          <button
            className="button primary"
            onClick={() => window.alert('Login demo. Firebase Auth se activara en la siguiente fase.')}
            type="button"
          >
            Entrar
          </button>
        </form>
      </section>
    </main>
  )
}

import { signInWithEmailAndPassword } from 'firebase/auth'
import { Lock, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { auth } from '../config/firebase'
import { useAuthUser } from '../hooks/useAuthUser'

const readableAuthError = (message: string) => {
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
    return 'Email o contrasena incorrectos.'
  }

  if (message.includes('auth/user-not-found')) {
    return 'No existe un usuario con ese email.'
  }

  if (message.includes('auth/too-many-requests')) {
    return 'Demasiados intentos. Probá de nuevo en unos minutos.'
  }

  return 'No se pudo iniciar sesion. Revisá Firebase Auth y las credenciales.'
}

export function LoginPage() {
  const { isCheckingAuth, user } = useAuthUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin/dashboard'

  if (!isCheckingAuth && user) {
    return <Navigate replace to={from} />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate(from, { replace: true })
    } catch (loginError) {
      setError(readableAuthError(loginError instanceof Error ? loginError.message : ''))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <BrandLogo />
        <div>
          <p className="eyebrow">Acceso interno</p>
          <h1 style={{ margin: '4px 0' }}>Ingresar al sistema</h1>
          <p className="muted">Usá el usuario creado en Firebase Authentication para operar recepción, admin y TV.</p>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          {error ? <div className="form-alert error">{error}</div> : null}
          <label className="field">
            <span>
              <Mail size={16} /> Email
            </span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@luccapark.com"
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>
              <Lock size={16} /> Contrasena
            </span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              type="password"
              value={password}
            />
          </label>
          <button className="button primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Ingresando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}

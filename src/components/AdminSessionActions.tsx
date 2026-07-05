import { signOut, type User } from 'firebase/auth'
import { LogOut, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../config/firebase'
import type { UserProfileStatus } from '../hooks/useUserProfile'
import type { AppUserProfile, UserRole } from '../types'

const roleLabels: Record<UserRole, string> = {
  admin: 'Dueño / Administrador',
  socio: 'Socio',
  encargado_eventos: 'Encargado de eventos',
  recepcion: 'Recepción',
  cantina: 'Cantina',
}

interface AdminSessionActionsProps {
  profile: AppUserProfile | null
  profileStatus: UserProfileStatus
  user: User | null
}

export function AdminSessionActions({ profile, profileStatus, user }: AdminSessionActionsProps) {
  const navigate = useNavigate()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentSessionName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Usuario'
  const currentSessionEmail = profile?.email || user?.email || 'Sin email disponible'
  const currentSessionRole = profile?.role ? roleLabels[profile.role] : 'Perfil pendiente'
  const currentSessionStatus = profileStatus === 'ready' ? 'Activa' : profileStatus === 'loading' ? 'Validando' : 'Revisar'

  useEffect(() => {
    if (!isAccountOpen) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSigningOut) {
        setIsAccountOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isAccountOpen, isSigningOut])

  const openAccountModal = () => {
    setError(null)
    setIsAccountOpen(true)
  }

  const closeAccountModal = () => {
    if (isSigningOut) return
    setIsAccountOpen(false)
  }

  const handleSignOut = async () => {
    setError(null)
    setIsSigningOut(true)
    try {
      await signOut(auth)
      setIsAccountOpen(false)
      navigate('/login', { replace: true })
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'No se pudo cerrar sesion.')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="admin-session-actions">
      <button
        aria-expanded={isAccountOpen}
        aria-haspopup="dialog"
        aria-label="Cuenta y cerrar sesión"
        className="admin-account-trigger"
        onClick={openAccountModal}
        title="Cuenta y cerrar sesión"
        type="button"
      >
        <LogOut size={19} strokeWidth={2.6} />
      </button>
      {isAccountOpen ? (
        <div className="account-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeAccountModal()}>
          <section aria-label="Cuenta y cerrar sesión" aria-modal="true" className="account-modal" role="dialog">
            <div className="account-modal-header">
              <span className="account-modal-avatar">{currentSessionName.slice(0, 1).toUpperCase()}</span>
              <button
                aria-label="Cerrar panel de cuenta"
                className="account-modal-close"
                disabled={isSigningOut}
                onClick={closeAccountModal}
                ref={closeButtonRef}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <div className="account-modal-user">
              <strong>{currentSessionName}</strong>
              <span>{currentSessionEmail}</span>
            </div>
            <div className="account-modal-meta">
              <span>
                <small>Rol</small>
                <strong>{currentSessionRole}</strong>
              </span>
              <span>
                <small>Estado</small>
                <strong>{currentSessionStatus}</strong>
              </span>
            </div>
            {error ? <div className="form-alert error account-modal-error" role="alert">{error}</div> : null}
            <button className="button danger account-modal-signout" disabled={isSigningOut} onClick={handleSignOut} type="button">
              <LogOut size={17} />
              {isSigningOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </button>
          </section>
        </div>
      ) : null}
    </div>
  )
}

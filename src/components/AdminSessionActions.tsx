import { signOut, type User } from 'firebase/auth'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../config/firebase'
import type { UserProfileStatus } from '../hooks/useUserProfile'
import type { AppUserProfile, UserRole } from '../types'

const roleLabels: Record<UserRole, string> = {
  admin: 'Dueno / Administrador',
  socio: 'Socio',
  encargado_eventos: 'Encargado de eventos',
  recepcion: 'Recepcion',
  cantina: 'Cantina',
}

interface AdminSessionActionsProps {
  profile: AppUserProfile | null
  profileStatus: UserProfileStatus
  user: User | null
}

export function AdminSessionActions({ profile, profileStatus, user }: AdminSessionActionsProps) {
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentSessionName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Usuario'
  const currentSessionEmail = profile?.email || user?.email || 'Sin email disponible'
  const currentSessionRole = profile?.role ? roleLabels[profile.role] : 'Perfil pendiente'
  const currentSessionStatus = profileStatus === 'ready' ? 'Activa' : profileStatus === 'loading' ? 'Validando' : 'Revisar'

  const handleSignOut = async () => {
    setError(null)
    setIsSigningOut(true)
    try {
      await signOut(auth)
      navigate('/login', { replace: true })
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'No se pudo cerrar sesion.')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="admin-session-actions">
      <div className="admin-session-card" aria-label="Sesion abierta actualmente">
        <span className="session-avatar">{currentSessionName.slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{currentSessionName}</strong>
          <small>{currentSessionEmail}</small>
          <small>{currentSessionRole} · {currentSessionStatus}</small>
        </span>
      </div>
      <button
        aria-label="Cerrar sesion"
        className="button danger admin-logout-button"
        disabled={isSigningOut}
        onClick={handleSignOut}
        title="Cerrar sesion"
        type="button"
      >
        <LogOut size={17} />
        <span>{isSigningOut ? 'Cerrando...' : 'Cerrar sesion'}</span>
      </button>
      {error ? <small className="admin-session-error" role="alert">{error}</small> : null}
    </div>
  )
}

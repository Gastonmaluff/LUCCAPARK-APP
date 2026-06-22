import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { canAccessPath, getDefaultRouteForRole } from '../auth/accessControl'
import { useUserProfile } from '../hooks/useUserProfile'
import { AccessDenied } from './AccessDenied'
import { LoadingScreen } from './LoadingScreen'
import { useAuthUser } from '../hooks/useAuthUser'

export function ProtectedRoute() {
  const { isCheckingAuth, user } = useAuthUser()
  const { isLoadingProfile, profile, profileError, profileStatus } = useUserProfile()
  const location = useLocation()

  if (isCheckingAuth || (user && isLoadingProfile)) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }

  if (profileStatus === 'missing') {
    return <AccessDenied message="Tu cuenta existe en Firebase Authentication, pero no tiene un perfil habilitado en Lucca Park." title="Perfil no habilitado" />
  }

  if (profileStatus === 'inactive' || (profile && !profile.isActive)) {
    return <AccessDenied message="Tu cuenta fue desactivada. Contactá al dueño o administrador para recuperar el acceso." title="Cuenta desactivada" />
  }

  if (profileStatus === 'invalid') {
    return <AccessDenied message="El perfil no tiene un rol válido. Un administrador debe corregirlo antes de que puedas ingresar." title="Acceso no autorizado" />
  }

  if (profileStatus === 'error' || !profile) {
    return <AccessDenied message={profileError ? `No pudimos validar tu perfil: ${profileError}` : 'No pudimos validar tu perfil de acceso.'} title="No se pudo validar el acceso" />
  }

  if (!canAccessPath(profile.role, location.pathname)) {
    return (
      <AccessDenied
        homeTo={getDefaultRouteForRole(profile.role)}
        message="Tu rol no tiene permiso para ingresar a este módulo."
        title="Acceso no autorizado"
      />
    )
  }

  return <Outlet />
}

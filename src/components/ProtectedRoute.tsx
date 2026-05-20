import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingScreen } from './LoadingScreen'
import { useAuthUser } from '../hooks/useAuthUser'

export function ProtectedRoute() {
  const { isCheckingAuth, user } = useAuthUser()
  const location = useLocation()

  if (isCheckingAuth) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }

  return <Outlet />
}

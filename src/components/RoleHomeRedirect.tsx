import { Navigate } from 'react-router-dom'
import { getDefaultRouteForRole } from '../auth/accessControl'
import { LoadingScreen } from './LoadingScreen'
import { useUserProfile } from '../hooks/useUserProfile'

export function RoleHomeRedirect() {
  const { isLoadingProfile, profile } = useUserProfile()
  if (isLoadingProfile || !profile) return <LoadingScreen />
  return <Navigate replace to={getDefaultRouteForRole(profile.role)} />
}

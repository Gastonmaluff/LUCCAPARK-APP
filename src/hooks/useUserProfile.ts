import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../config/firebase'
import { useAuthUser } from './useAuthUser'
import type { AppUserProfile, UserRole } from '../types'

const bootstrapOwnerUid = 'SXaYNYcKFXP8FZDCk3DP38EyP903'

const roleLabel: Record<UserRole, string> = {
  admin: 'Admin / Dueño',
  socio: 'Socio',
  encargado_eventos: 'Encargado de eventos',
  recepcion: 'Recepcion',
  cantina: 'Cantina',
}

function buildFallbackProfile(user: User): AppUserProfile {
  const isBootstrapOwner = user.uid === bootstrapOwnerUid

  return {
    id: user.uid,
    uid: user.uid,
    displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Usuario',
    email: user.email ?? '',
    role: isBootstrapOwner ? 'admin' : 'recepcion',
    isActive: isBootstrapOwner,
  }
}

export function useUserProfile() {
  const { isCheckingAuth, user } = useAuthUser()
  const [profile, setProfile] = useState<AppUserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    if (isCheckingAuth) return undefined
    if (!user) {
      setProfile(null)
      setIsLoadingProfile(false)
      return undefined
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        const data = snapshot.data()
        if (!snapshot.exists()) {
          setProfile(buildFallbackProfile(user))
          setIsLoadingProfile(false)
          return
        }

        const isBootstrapOwner = user.uid === bootstrapOwnerUid
        setProfile({
          id: user.uid,
          uid: user.uid,
          displayName: String(data?.displayName ?? user.displayName ?? user.email?.split('@')[0] ?? 'Usuario'),
          email: String(data?.email ?? user.email ?? ''),
          role: isBootstrapOwner ? 'admin' : (data?.role as UserRole) ?? 'admin',
          isActive: isBootstrapOwner ? true : data?.isActive !== false,
        })
        setIsLoadingProfile(false)
      },
      () => {
        setProfile(buildFallbackProfile(user))
        setIsLoadingProfile(false)
      },
    )

    return unsubscribe
  }, [isCheckingAuth, user])

  const permissions = useMemo(() => {
    const role = profile?.role ?? 'recepcion'
    const isActive = profile?.isActive === true
    return {
      canViewFinance: isActive && (role === 'admin' || role === 'socio'),
      canRegisterExpenses: isActive && (role === 'admin' || role === 'socio' || role === 'encargado_eventos'),
      canManageTasks: isActive && (role === 'admin' || role === 'socio'),
      canAssignTasks: isActive && (role === 'admin' || role === 'socio'),
      canManageUsers: isActive && role === 'admin',
      roleLabel: roleLabel[role],
    }
  }, [profile?.isActive, profile?.role])

  return { isLoadingProfile, permissions, profile, user }
}

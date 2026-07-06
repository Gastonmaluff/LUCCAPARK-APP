import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { getRolePermissions, isUserRole } from '../auth/accessControl'
import { db } from '../config/firebase'
import { useAuthUser } from './useAuthUser'
import type { AppUserProfile } from '../types'

export type UserProfileStatus = 'loading' | 'ready' | 'missing' | 'invalid' | 'inactive' | 'error' | 'unauthenticated'

export function useUserProfile() {
  const { isCheckingAuth, user } = useAuthUser()
  const [profile, setProfile] = useState<AppUserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [profileStatus, setProfileStatus] = useState<UserProfileStatus>('loading')
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    if (isCheckingAuth) return undefined
    if (!user) {
      setProfile(null)
      setIsLoadingProfile(false)
      setProfileStatus('unauthenticated')
      setProfileError(null)
      return undefined
    }

    setProfile(null)
    setIsLoadingProfile(true)
    setProfileStatus('loading')
    setProfileError(null)

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        const data = snapshot.data()
        if (!snapshot.exists()) {
          setProfile(null)
          setIsLoadingProfile(false)
          setProfileStatus('missing')
          return
        }

        if (!isUserRole(data?.role)) {
          setProfile(null)
          setIsLoadingProfile(false)
          setProfileStatus('invalid')
          return
        }

        const nextProfile: AppUserProfile = {
          id: user.uid,
          uid: user.uid,
          displayName: String(data?.displayName ?? user.displayName ?? user.email?.split('@')[0] ?? 'Usuario'),
          email: String(data?.email ?? user.email ?? ''),
          role: data.role,
          isActive: data?.isActive === true,
        }
        setProfile(nextProfile)
        setIsLoadingProfile(false)
        setProfileStatus(nextProfile.isActive ? 'ready' : 'inactive')
      },
      (error) => {
        setProfile(null)
        setIsLoadingProfile(false)
        setProfileStatus('error')
        setProfileError(error.message)
      },
    )

    return unsubscribe
  }, [isCheckingAuth, user])

  const profileBelongsToCurrentUser = Boolean(user && profile?.uid === user.uid)
  const currentProfile = profileBelongsToCurrentUser ? profile : null
  const currentProfileStatus: UserProfileStatus =
    user && profile && !profileBelongsToCurrentUser ? 'loading' : profileStatus
  const currentIsLoadingProfile = isLoadingProfile || Boolean(user && profile && !profileBelongsToCurrentUser)

  const permissions = useMemo(() => {
    return getRolePermissions(currentProfile?.role ?? null, currentProfile?.isActive === true)
  }, [currentProfile?.isActive, currentProfile?.role])

  return {
    isCheckingAuth,
    isLoadingProfile: currentIsLoadingProfile,
    permissions,
    profile: currentProfile,
    profileError,
    profileStatus: currentProfileStatus,
    user,
  }
}

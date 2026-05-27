import { getDoc } from 'firebase/firestore'
import { auth } from '../config/firebase'
import { getDocumentRef } from './firestoreCollections'
import type { UserRole } from '../types'

export const getCurrentUserAudit = async () => {
  const user = auth.currentUser
  if (!user) {
    return { uid: null, name: '', email: '', role: '' as UserRole | '' }
  }

  const profileSnapshot = await getDoc(getDocumentRef('users', user.uid)).catch(() => null)
  const profile = profileSnapshot?.data()

  return {
    uid: user.uid,
    name: String(profile?.displayName ?? user.displayName ?? user.email ?? 'Usuario no identificado'),
    email: String(profile?.email ?? user.email ?? ''),
    role: (profile?.role as UserRole | undefined) ?? '',
  }
}

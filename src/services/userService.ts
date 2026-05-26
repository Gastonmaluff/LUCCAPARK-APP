import { serverTimestamp, setDoc } from 'firebase/firestore'
import { auth } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getDocumentRef } from './firestoreCollections'
import type { UserRole } from '../types'

interface SaveUserProfileInput {
  displayName: string
  email: string
  isActive: boolean
  role: UserRole
  uid: string
}

export const saveUserProfile = async (input: SaveUserProfileInput) => {
  await ensureReceptionSession()
  const uid = input.uid.trim()
  if (!uid) throw new Error('Carga el UID real del usuario.')

  await setDoc(
    getDocumentRef('users', uid),
    {
      displayName: input.displayName.trim() || input.email.trim() || 'Usuario',
      email: input.email.trim(),
      isActive: input.isActive,
      role: input.role,
      uid,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid ?? null,
    },
    { merge: true },
  )
}

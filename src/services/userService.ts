import { getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ensureReceptionSession } from './authSession'
import { getDocumentRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'
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
  const userAudit = await getCurrentUserAudit()
  const userRef = getDocumentRef('users', uid)
  const existingProfile = await getDoc(userRef).catch(() => null)

  await setDoc(
    userRef,
    {
      displayName: input.displayName.trim() || input.email.trim() || 'Usuario',
      email: input.email.trim(),
      isActive: input.isActive,
      role: input.role,
      uid,
      updatedAt: serverTimestamp(),
      updatedBy: userAudit.uid,
      updatedByName: userAudit.name,
      ...(existingProfile?.exists() ? {} : {
        createdAt: serverTimestamp(),
        createdByUid: userAudit.uid,
        createdByName: userAudit.name,
      }),
    },
    { merge: true },
  )
}

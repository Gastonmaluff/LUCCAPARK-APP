import { onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { getCollectionRef } from '../services/firestoreCollections'
import type { AppUserProfile, UserRole } from '../types'

export function useUsers(enabled = true) {
  const [users, setUsers] = useState<AppUserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setUsers([])
      setIsLoading(false)
      setError(null)
      return undefined
    }

    const unsubscribe = onSnapshot(
      getCollectionRef('users'),
      (snapshot) => {
        setUsers(snapshot.docs.map((item) => {
          const data = item.data()
          return {
            id: item.id,
            uid: String(data.uid ?? item.id),
            displayName: String(data.displayName ?? 'Usuario'),
            email: String(data.email ?? ''),
            role: (data.role as UserRole) ?? 'recepcion',
            isActive: data.isActive !== false,
          }
        }))
        setIsLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [enabled])

  return { error, isLoading, users }
}

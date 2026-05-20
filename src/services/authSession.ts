import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../config/firebase'

let sessionPromise: Promise<string | null> | null = null

export const ensureReceptionSession = () => {
  if (sessionPromise) {
    return sessionPromise
  }

  sessionPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user?.uid ?? null)
    })
  })

  return sessionPromise
}

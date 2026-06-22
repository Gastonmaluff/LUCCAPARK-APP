import { getAnalytics, isSupported } from 'firebase/analytics'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBntqq9tCyjfx5_mZnXOyoSsSkUIgFZ5qY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'luccapark-app.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'luccapark-app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'luccapark-app.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '709918214272',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:709918214272:web:e5f84f8d61c1984e5a7e65',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-GD9DLG5CVR',
}

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export const firebaseApiKey = firebaseConfig.apiKey
export const firebaseProjectId = firebaseConfig.projectId

export const analyticsPromise =
  typeof window === 'undefined'
    ? Promise.resolve(null)
    : isSupported().then((supported) => (supported ? getAnalytics(firebaseApp) : null))

export type FirebaseCollectionName =
  | 'users'
  | 'customers'
  | 'children'
  | 'visits'
  | 'activeVisits'
  | 'events'
  | 'eventGuests'
  | 'eventBudgets'
  | 'budgetGuestPackages'
  | 'budgetAddons'
  | 'budgetDecorations'
  | 'tvDisplaySettings'
  | 'landingContent'
  | 'canteenProducts'
  | 'canteenOrders'
  | 'canteenVoidRequests'
  | 'canteenInventoryMovements'
  | 'dailyClosings'
  | 'payments'
  | 'expenses'
  | 'financialClosures'
  | 'tasks'
  | 'settings'
  | 'activityLogs'
  | 'backups'
  | 'backupLocks'

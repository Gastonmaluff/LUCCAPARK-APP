import { collection, doc } from 'firebase/firestore'
import { db, type FirebaseCollectionName } from '../config/firebase'

export const firestoreCollections: Record<FirebaseCollectionName, FirebaseCollectionName> = {
  users: 'users',
  customers: 'customers',
  children: 'children',
  visits: 'visits',
  activeVisits: 'activeVisits',
  events: 'events',
  eventGuests: 'eventGuests',
  eventBudgets: 'eventBudgets',
  tvDisplaySettings: 'tvDisplaySettings',
  landingContent: 'landingContent',
  canteenProducts: 'canteenProducts',
  canteenOrders: 'canteenOrders',
  canteenInventoryMovements: 'canteenInventoryMovements',
  dailyClosings: 'dailyClosings',
  payments: 'payments',
  settings: 'settings',
}

export const getCollectionRef = (name: FirebaseCollectionName) =>
  collection(db, firestoreCollections[name])

export const getDocumentRef = (name: FirebaseCollectionName, id: string) =>
  doc(db, firestoreCollections[name], id)

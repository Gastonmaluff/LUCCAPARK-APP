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
  budgetGuestPackages: 'budgetGuestPackages',
  budgetAddons: 'budgetAddons',
  budgetDecorations: 'budgetDecorations',
  tvDisplaySettings: 'tvDisplaySettings',
  landingContent: 'landingContent',
  canteenCategories: 'canteenCategories',
  canteenProducts: 'canteenProducts',
  canteenOrders: 'canteenOrders',
  canteenVoidRequests: 'canteenVoidRequests',
  canteenInventoryMovements: 'canteenInventoryMovements',
  dailyClosings: 'dailyClosings',
  payments: 'payments',
  expenses: 'expenses',
  financialClosures: 'financialClosures',
  tasks: 'tasks',
  settings: 'settings',
  activityLogs: 'activityLogs',
  backups: 'backups',
  backupLocks: 'backupLocks',
  secureOperations: 'secureOperations',
}

export const getCollectionRef = (name: FirebaseCollectionName) =>
  collection(db, firestoreCollections[name])

export const getDocumentRef = (name: FirebaseCollectionName, id: string) =>
  doc(db, firestoreCollections[name], id)

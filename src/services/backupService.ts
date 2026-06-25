import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { logActivity } from './activityLogService'
import { firestoreCollections, getCollectionRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'

export type BackupType = 'manual' | 'automatic'
export type ExportableBackupType = 'manual'
export type BackupStatus = 'success' | 'error'

export interface BackupDocument {
  id: string
  data: Record<string, unknown>
}

export interface BackupJson {
  backupVersion: 1
  system: 'LUCCAPARKWEB'
  type: BackupType
  generatedAt: string
  generatedBy: {
    email: string
    name: string
    uid: string | null
  }
  collections: Record<string, BackupDocument[]>
  summary: {
    collections: Record<string, number>
    errors?: Record<string, string>
    totalDocuments: number
  }
}

export interface BackupMetadata {
  id: string
  collectionsSummary: Record<string, number>
  createdAt: Date | null
  createdByEmail: string
  createdByName: string
  createdByUid: string | null
  errorMessage?: string
  fileName: string
  fileSize: number
  status: BackupStatus
  storagePath: string
  totalDocuments: number
  type: BackupType
}

const backupCollections = [
  firestoreCollections.users,
  firestoreCollections.customers,
  firestoreCollections.children,
  firestoreCollections.visits,
  firestoreCollections.activeVisits,
  firestoreCollections.events,
  firestoreCollections.eventGuests,
  firestoreCollections.eventBudgets,
  firestoreCollections.budgetGuestPackages,
  firestoreCollections.budgetAddons,
  firestoreCollections.budgetDecorations,
  firestoreCollections.tvDisplaySettings,
  firestoreCollections.landingContent,
  firestoreCollections.canteenProducts,
  firestoreCollections.canteenOrders,
  firestoreCollections.canteenInventoryMovements,
  firestoreCollections.dailyClosings,
  firestoreCollections.payments,
  firestoreCollections.expenses,
  firestoreCollections.financialClosures,
  firestoreCollections.tasks,
  firestoreCollections.settings,
  firestoreCollections.activityLogs,
] as const

const sensitiveKeys = new Set(['password', 'pass', 'contraseña', 'contrasena', 'secret', 'token'])

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Timestamp) return { __type: 'timestamp', value: value.toDate().toISOString() }
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() }
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      if (sensitiveKeys.has(key.toLowerCase())) return acc
      acc[key] = serializeValue(entry)
      return acc
    }, {})
  }
  return value
}

const normalizeFileNamePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')

const buildFileName = (type: BackupType, generatedAt: string) =>
  `luccapark-${type}-${normalizeFileNamePart(generatedAt)}.json`

const blobFromBackup = (backup: BackupJson) =>
  new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })

const mapBackupMetadata = (id: string, data: DocumentData): BackupMetadata => ({
  id,
  collectionsSummary: (data.collectionsSummary as Record<string, number> | undefined) ?? {},
  createdAt: dateFromTimestamp(data.createdAt),
  createdByEmail: String(data.createdByEmail ?? ''),
  createdByName: String(data.createdByName ?? 'Usuario desconocido'),
  createdByUid: data.createdByUid ? String(data.createdByUid) : null,
  errorMessage: data.errorMessage ? String(data.errorMessage) : undefined,
  fileName: String(data.fileName ?? ''),
  fileSize: Number(data.fileSize ?? 0),
  status: (data.status as BackupStatus) ?? 'error',
  storagePath: String(data.storagePath ?? ''),
  totalDocuments: Number(data.totalDocuments ?? 0),
  type: (data.type as BackupType) ?? 'manual',
})

export const getBackupCollections = () => [...backupCollections]

export const subscribeBackups = (onNext: (backups: BackupMetadata[]) => void, onError: (message: string) => void) =>
  onSnapshot(
    query(getCollectionRef('backups'), orderBy('createdAt', 'desc'), limit(30)),
    (snapshot) => onNext(snapshot.docs.map((docSnapshot) => mapBackupMetadata(docSnapshot.id, docSnapshot.data()))),
    (error) => onError(error.message),
  )

export const buildBackupJson = async (type: ExportableBackupType): Promise<BackupJson> => {
  const generatedAt = new Date().toISOString()
  const userAudit = await getCurrentUserAudit()
  const collections: Record<string, BackupDocument[]> = {}
  const collectionsSummary: Record<string, number> = {}
  const errors: Record<string, string> = {}

  await Promise.all(
    backupCollections.map(async (collectionName) => {
      try {
        const snapshot = await getDocs(collection(db, collectionName))
        const documents = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          data: serializeValue(docSnapshot.data()) as Record<string, unknown>,
        }))
        collections[collectionName] = documents
        collectionsSummary[collectionName] = documents.length
      } catch (error) {
        collections[collectionName] = []
        collectionsSummary[collectionName] = 0
        errors[collectionName] = error instanceof Error ? error.message : 'No se pudo exportar la coleccion.'
      }
    }),
  )

  const totalDocuments = Object.values(collectionsSummary).reduce((sum, count) => sum + count, 0)

  return {
    backupVersion: 1,
    collections,
    generatedAt,
    generatedBy: {
      email: userAudit.email,
      name: userAudit.name || userAudit.email || 'Usuario desconocido',
      uid: userAudit.uid,
    },
    summary: {
      collections: collectionsSummary,
      ...(Object.keys(errors).length ? { errors } : {}),
      totalDocuments,
    },
    system: 'LUCCAPARKWEB',
    type,
  }
}

export const saveBackupToStorage = async (backup: BackupJson) => {
  if (backup.type !== 'manual') throw new Error('La exportación JSON automática desde la web está deshabilitada.')
  const fileName = buildFileName(backup.type, backup.generatedAt)
  const blob = blobFromBackup(backup)
  const storagePath = `backups/${backup.type}/${fileName}`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, blob, { contentType: 'application/json' })
  const downloadUrl = await getDownloadURL(storageRef)

  const metadataRef = doc(getCollectionRef('backups'))
  const status: BackupStatus = backup.summary.totalDocuments > 0 ? 'success' : 'error'
  await setDoc(metadataRef, {
    collectionsSummary: backup.summary.collections,
    createdAt: serverTimestamp(),
    createdByEmail: backup.generatedBy.email,
    createdByName: backup.generatedBy.name,
    createdByUid: backup.generatedBy.uid,
    errorMessage: backup.summary.errors ? JSON.stringify(backup.summary.errors) : '',
    fileName,
    fileSize: blob.size,
    status,
    storagePath,
    totalDocuments: backup.summary.totalDocuments,
    type: backup.type,
  })

  return { blob, downloadUrl, fileName, metadataId: metadataRef.id, storagePath }
}

export const generateBackup = async (type: ExportableBackupType) => {
  const backup = await buildBackupJson(type)
  const saved = await saveBackupToStorage(backup)

  void logActivity({
    action: 'create',
    description: 'Generó backup manual del sistema',
    entityId: saved.metadataId,
    entityName: saved.fileName,
    metadata: { totalDocuments: backup.summary.totalDocuments, type },
    module: 'Configuración',
  })

  return { backup, ...saved }
}

export const getBackupDownloadUrl = async (backup: BackupMetadata) => {
  if (!backup.storagePath) throw new Error('Este backup no tiene archivo asociado.')
  return getDownloadURL(ref(storage, backup.storagePath))
}

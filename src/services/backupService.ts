import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { logActivity } from './activityLogService'
import { firestoreCollections, getCollectionRef, getDocumentRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'

export type BackupType = 'manual' | 'automatic'
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

export interface AutomaticBackupState {
  checkedAt: Date | null
  errorMessage?: string
  lastSuccessAt: Date | null
  lockExpiresAt: Date | null
  status: 'idle' | 'running' | 'error'
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

const backupIntervalMs = 12 * 60 * 60 * 1000
const lockTimeoutMs = 20 * 60 * 1000
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

const mapAutomaticState = (data: DocumentData | undefined): AutomaticBackupState => ({
  checkedAt: dateFromTimestamp(data?.checkedAt),
  errorMessage: data?.errorMessage ? String(data.errorMessage) : undefined,
  lastSuccessAt: dateFromTimestamp(data?.lastSuccessAt),
  lockExpiresAt: dateFromTimestamp(data?.lockExpiresAt),
  status: (data?.status as AutomaticBackupState['status']) ?? 'idle',
})

export const getBackupCollections = () => [...backupCollections]

export const subscribeBackups = (onNext: (backups: BackupMetadata[]) => void, onError: (message: string) => void) =>
  onSnapshot(
    query(getCollectionRef('backups'), orderBy('createdAt', 'desc'), limit(30)),
    (snapshot) => onNext(snapshot.docs.map((docSnapshot) => mapBackupMetadata(docSnapshot.id, docSnapshot.data()))),
    (error) => onError(error.message),
  )

export const subscribeAutomaticBackupState = (
  onNext: (state: AutomaticBackupState) => void,
  onError: (message: string) => void,
) =>
  onSnapshot(
    getDocumentRef('backupLocks', 'automatic'),
    (snapshot) => onNext(mapAutomaticState(snapshot.exists() ? snapshot.data() : undefined)),
    (error) => onError(error.message),
  )

export const buildBackupJson = async (type: BackupType): Promise<BackupJson> => {
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

export const generateBackup = async (type: BackupType) => {
  const backup = await buildBackupJson(type)
  const saved = await saveBackupToStorage(backup)

  void logActivity({
    action: 'create',
    description: type === 'manual' ? 'Generó backup manual del sistema' : 'Generó backup automático del sistema',
    entityId: saved.metadataId,
    entityName: saved.fileName,
    metadata: { totalDocuments: backup.summary.totalDocuments, type },
    module: 'Configuración',
  })

  return { backup, ...saved }
}

export const runAutomaticBackupIfDue = async () => {
  const userAudit = await getCurrentUserAudit()
  const isAuthorized = userAudit.role === 'admin' || userAudit.role === 'socio'
  if (!isAuthorized && userAudit.uid !== 'SXaYNYcKFXP8FZDCk3DP38EyP903') return { status: 'unauthorized' as const }

  const lockRef = getDocumentRef('backupLocks', 'automatic')
  const now = new Date()
  const transactionResult = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(lockRef)
    const data = snapshot.exists() ? snapshot.data() : undefined
    const lastSuccessAt = dateFromTimestamp(data?.lastSuccessAt)
    const lockExpiresAt = dateFromTimestamp(data?.lockExpiresAt)

    if (lastSuccessAt && now.getTime() - lastSuccessAt.getTime() < backupIntervalMs) return 'fresh' as const
    if (data?.status === 'running' && lockExpiresAt && lockExpiresAt.getTime() > now.getTime()) return 'locked' as const

    transaction.set(
      lockRef,
      {
        checkedAt: serverTimestamp(),
        lockExpiresAt: Timestamp.fromDate(new Date(now.getTime() + lockTimeoutMs)),
        startedByEmail: userAudit.email,
        startedByName: userAudit.name,
        startedByUid: userAudit.uid,
        status: 'running',
      },
      { merge: true },
    )
    return 'run' as const
  })

  if (transactionResult !== 'run') return { status: transactionResult }

  try {
    const generated = await generateBackup('automatic')
    await setDoc(
      lockRef,
      {
        checkedAt: serverTimestamp(),
        errorMessage: '',
        lastSuccessAt: serverTimestamp(),
        lastSuccessMetadataId: generated.metadataId,
        lockExpiresAt: null,
        status: 'idle',
      },
      { merge: true },
    )
    return { status: 'generated' as const }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'No se pudo generar backup automatico.'
    await setDoc(
      lockRef,
      {
        checkedAt: serverTimestamp(),
        errorMessage,
        lockExpiresAt: null,
        status: 'error',
      },
      { merge: true },
    )
    void logActivity({
      action: 'create',
      description: 'Error al generar backup automático del sistema',
      metadata: { errorMessage },
      module: 'Configuración',
    })
    return { errorMessage, status: 'error' as const }
  }
}

export const getBackupDownloadUrl = async (backup: BackupMetadata) => {
  if (!backup.storagePath) throw new Error('Este backup no tiene archivo asociado.')
  return getDownloadURL(ref(storage, backup.storagePath))
}

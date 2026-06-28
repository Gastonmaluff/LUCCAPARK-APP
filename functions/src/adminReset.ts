import { getStorage } from 'firebase-admin/storage'
import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  db,
  digest,
  requireActor,
  serverTimestamp,
  stringValue,
  writeActivity,
} from './common'

const ADMIN_ROLES = ['admin'] as const
const CONFIRMATION_PHRASE = 'LIMPIAR DATOS DE PRUEBA'

const DELETE_COLLECTIONS = [
  'eventGuests',
  'payments',
  'canteenInventoryMovements',
  'canteenOrders',
  'visitGroups',
  'activeVisits',
  'visits',
  'children',
  'customers',
  'events',
  'eventBudgets',
  'canteenProducts',
  'canteenCategories',
  'expenses',
  'dailyClosings',
  'financialClosures',
  'tasks',
] as const

const AUTHORIZED_STORAGE_PREFIXES = [
  'canteen-products/',
  'financial-closures/',
] as const

const PRESERVED_COLLECTIONS = [
  'users',
  'settings',
  'landingContent',
  'tvDisplaySettings',
  'budgetGuestPackages',
  'budgetAddons',
  'budgetDecorations',
  'activityLogs',
  'backups',
  'backupLocks',
  'secureOperations',
  'systemFlags',
] as const

const fileFieldNames = [
  'storagePath',
  'fileStoragePath',
  'pdfStoragePath',
  'pdfPath',
  'downloadPath',
  'imageStoragePath',
  'imagePath',
  'imageUrl',
  'tvImageStoragePath',
  'receiptStoragePath',
  'proofStoragePath',
  'attachmentStoragePath',
]

interface ResetInput {
  mode?: unknown
  confirmation?: unknown
  operationId?: unknown
  collections?: unknown
  simulateFailure?: unknown
}

interface CollectionPreview {
  collection: string
  count: number
  ids: string[]
  proposal: 'delete'
  dependencies: string[]
}

interface FilePreview {
  collection: string
  documentId: string
  storagePath: string
}

interface ResetManifest {
  mode: 'dryRun' | 'execute'
  operationId?: string
  generatedAt: string
  collections: CollectionPreview[]
  files: FilePreview[]
  preservedCollections: readonly string[]
  totalDocuments: number
  totalFiles: number
  doubtfulDocuments: string[]
  orphanWarnings: string[]
  usersPreserved: string[]
  configurationPreserved: readonly string[]
}

const asInput = (value: unknown): ResetInput =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as ResetInput : {}

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

const collectStoragePaths = (collection: string, documentId: string, data: DocumentData): FilePreview[] => {
  const paths = new Set<string>()

  const inspect = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (
        trimmed
        && (
          fileFieldNames.includes(key)
          || AUTHORIZED_STORAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
        )
        && AUTHORIZED_STORAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
        && !trimmed.startsWith('http')
      ) {
        paths.add(trimmed)
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => inspect(entry, key))
      return
    }

    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, entry]) => inspect(entry, childKey))
    }
  }

  inspect(data)

  return [...paths].map((storagePath) => ({ collection, documentId, storagePath }))
}

const listAuthorizedStorageFiles = async (): Promise<FilePreview[]> => {
  if (isEmulatorProject() && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    return []
  }

  const bucket = getStorage().bucket()
  const files = new Map<string, FilePreview>()

  for (const prefix of AUTHORIZED_STORAGE_PREFIXES) {
    const [bucketFiles] = await bucket.getFiles({ prefix })
    bucketFiles.forEach((file) => {
      if (!file.name.endsWith('/')) {
        files.set(file.name, {
          collection: `storage:${prefix}`,
          documentId: file.name,
          storagePath: file.name,
        })
      }
    })
  }

  return [...files.values()]
}

const dependenciesFor = (collection: string) => {
  if (collection === 'events') return ['eventGuests', 'payments', 'canteenOrders']
  if (collection === 'visits') return ['activeVisits', 'payments', 'canteenOrders']
  if (collection === 'customers') return ['children', 'visits']
  if (collection === 'canteenProducts') return ['canteenInventoryMovements', 'canteenOrders']
  if (collection === 'eventBudgets') return ['events']
  return []
}

const buildManifest = async (mode: 'dryRun' | 'execute', operationId?: string): Promise<ResetManifest> => {
  const collections: CollectionPreview[] = []
  const files: FilePreview[] = []
  const usersSnapshot = await db.collection('users').get()

  for (const collection of DELETE_COLLECTIONS) {
    const snapshot = await db.collection(collection).get()
    const ids: string[] = []
    snapshot.docs.forEach((document) => {
      ids.push(document.id)
      files.push(...collectStoragePaths(collection, document.id, document.data()))
    })
    collections.push({
      collection,
      count: snapshot.size,
      ids,
      proposal: 'delete',
      dependencies: dependenciesFor(collection),
    })
  }

  for (const file of await listAuthorizedStorageFiles()) {
    if (!files.some((existing) => existing.storagePath === file.storagePath)) {
      files.push(file)
    }
  }

  const totalDocuments = collections.reduce((sum, item) => sum + item.count, 0)

  return {
    mode,
    operationId,
    generatedAt: new Date().toISOString(),
    collections,
    files,
    preservedCollections: PRESERVED_COLLECTIONS,
    totalDocuments,
    totalFiles: files.length,
    doubtfulDocuments: [],
    orphanWarnings: [
      'activityLogs y secureOperations pueden conservar referencias historicas a documentos eliminados como auditoria.',
    ],
    usersPreserved: usersSnapshot.docs.map((document) => document.id),
    configurationPreserved: PRESERVED_COLLECTIONS,
  }
}

const batchDeleteDocuments = async (collection: string, ids: string[]) => {
  for (let index = 0; index < ids.length; index += 400) {
    const batch = db.batch()
    ids.slice(index, index + 400).forEach((id) => batch.delete(db.collection(collection).doc(id)))
    await batch.commit()
  }
}

const deleteStorageFiles = async (files: FilePreview[]) => {
  const bucket = getStorage().bucket()
  for (const file of files) {
    if (AUTHORIZED_STORAGE_PREFIXES.some((prefix) => file.storagePath.startsWith(prefix))) {
      await bucket.file(file.storagePath).delete({ ignoreNotFound: true })
    }
  }
}

const isEmulatorProject = () =>
  process.env.FUNCTIONS_EMULATOR === 'true' || (process.env.GCLOUD_PROJECT ?? '').startsWith('demo-')

export const resetOperationalTestDataSecure = async (uid: string | null | undefined, rawInput: unknown) => {
  const input = asInput(rawInput)
  const mode = stringValue(input.mode) || 'dryRun'

  if (getStringArray(input.collections).length > 0) {
    throw new HttpsError('invalid-argument', 'No se aceptan colecciones dinamicas para esta operacion.')
  }

  if (mode !== 'dryRun' && mode !== 'execute') {
    throw new HttpsError('invalid-argument', 'Selecciona un modo de limpieza valido.')
  }

  const actor = await requireActor(uid, ADMIN_ROLES)

  if (mode === 'dryRun') {
    return buildManifest('dryRun')
  }

  const confirmation = stringValue(input.confirmation)
  if (confirmation !== CONFIRMATION_PHRASE) {
    throw new HttpsError('failed-precondition', `Escribi exactamente: ${CONFIRMATION_PHRASE}`)
  }

  const operationId = stringValue(input.operationId)
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(operationId)) {
    throw new HttpsError('invalid-argument', 'La operacion requiere un operationId valido.')
  }

  const operationRef = db.collection('secureOperations').doc(digest(`reset-operational-test-data:${operationId}`))
  const operationSnapshot = await operationRef.get()
  if (operationSnapshot.exists) {
    const previous = operationSnapshot.data() ?? {}
    if (previous.operationType !== 'reset_operational_test_data') {
      throw new HttpsError('already-exists', 'El operationId ya fue utilizado para otra operacion.')
    }
    return previous.result
  }

  const maintenanceRef = db.collection('systemFlags').doc('maintenance')
  const manifest = await buildManifest('execute', operationId)

  await operationRef.create({
    operationType: 'reset_operational_test_data',
    status: 'running',
    operationId,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid,
    createdByName: actor.name,
  })

  await maintenanceRef.set({
    active: true,
    reason: 'reset_operational_test_data',
    operationId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  }, { merge: true })

  try {
    if (input.simulateFailure === true && isEmulatorProject()) {
      throw new Error('Simulated reset failure')
    }

    for (const collection of manifest.collections) {
      await batchDeleteDocuments(collection.collection, collection.ids)
    }

    await deleteStorageFiles(manifest.files)

    const finalManifest = await buildManifest('execute', operationId)
    const result = {
      ...manifest,
      remainingDocuments: finalManifest.totalDocuments,
      status: finalManifest.totalDocuments === 0 ? 'completed' : 'completed_with_warnings',
    }

    await db.runTransaction(async (transaction) => {
      transaction.update(operationRef, {
        status: result.status,
        result,
        completedAt: serverTimestamp(),
      })
      transaction.set(maintenanceRef, {
        active: false,
        reason: '',
        operationId,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      }, { merge: true })
      writeActivity(transaction, actor, {
        action: 'cleanup',
        module: 'Administracion',
        description: `Limpio datos operativos de prueba (${manifest.totalDocuments} documentos).`,
        entityId: operationId,
        metadata: {
          totalDocuments: manifest.totalDocuments,
          totalFiles: manifest.totalFiles,
          remainingDocuments: finalManifest.totalDocuments,
        },
      })
    })

    return result
  } catch (error) {
    await operationRef.set({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Error desconocido',
      failedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    await maintenanceRef.set({
      active: false,
      reason: '',
      operationId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    }, { merge: true })
    throw new HttpsError('internal', 'La limpieza se detuvo antes de completarse.')
  }
}

export const resetOperationalTestDataConfig = {
  deleteCollections: DELETE_COLLECTIONS,
  authorizedStoragePrefixes: AUTHORIZED_STORAGE_PREFIXES,
  preservedCollections: PRESERVED_COLLECTIONS,
  confirmationPhrase: CONFIRMATION_PHRASE,
}

import { createHash, randomUUID } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type Transaction,
} from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

if (getApps().length === 0) initializeApp()

export const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

export const region = 'southamerica-east1'

export type UserRole = 'admin' | 'socio' | 'encargado_eventos' | 'recepcion' | 'cantina'

export interface Actor {
  uid: string
  name: string
  email: string
  role: UserRole
}

export interface IdempotentOptions<T> {
  uid: string | null | undefined
  roles: readonly UserRole[]
  operationType: string
  entityId: string
  idempotencyKey: unknown
  fingerprint: unknown
  handler: (transaction: Transaction, actor: Actor) => Promise<T>
}

const knownRoles = new Set<UserRole>(['admin', 'socio', 'encargado_eventos', 'recepcion', 'cantina'])

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')

const requireIdempotencyKey = (value: unknown) => {
  const key = stringValue(value)
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(key)) {
    throw new HttpsError('invalid-argument', 'La operacion requiere una clave de idempotencia valida.')
  }
  return key
}

const actorFromProfile = (uid: string, data: DocumentData, roles: readonly UserRole[]): Actor => {
  const role = stringValue(data.role) as UserRole
  if (data.isActive !== true || !knownRoles.has(role)) {
    throw new HttpsError('permission-denied', 'Tu perfil no esta activo o no tiene un rol valido.')
  }
  if (!roles.includes(role)) {
    throw new HttpsError('permission-denied', 'Tu rol no permite realizar esta operacion.')
  }
  return {
    uid,
    role,
    name: stringValue(data.displayName) || stringValue(data.email) || 'Usuario',
    email: stringValue(data.email),
  }
}

export const requireActor = async (uid: string | null | undefined, roles: readonly UserRole[]): Promise<Actor> => {
  if (!uid) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesion para continuar.')
  const profileSnapshot = await db.collection('users').doc(uid).get()
  if (!profileSnapshot.exists) {
    throw new HttpsError('permission-denied', 'No existe un perfil autorizado para esta cuenta.')
  }
  return actorFromProfile(uid, profileSnapshot.data() ?? {}, roles)
}

export const assertSystemOperational = async (transaction: Transaction) => {
  const maintenanceSnapshot = await transaction.get(db.collection('systemFlags').doc('maintenance'))
  const maintenance = maintenanceSnapshot.data() ?? {}
  if (maintenance.active === true) {
    throw new HttpsError('failed-precondition', 'El sistema esta en mantenimiento administrativo. Intenta nuevamente en unos minutos.')
  }
}

export const executeIdempotent = async <T>(options: IdempotentOptions<T>): Promise<T> => {
  if (!options.uid) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesion para continuar.')
  const key = requireIdempotencyKey(options.idempotencyKey)
  const uid = options.uid
  const fingerprint = digest({
    operationType: options.operationType,
    entityId: options.entityId,
    payload: options.fingerprint,
  })
  const operationId = digest(`${uid}:${key}`)
  const operationRef = db.collection('secureOperations').doc(operationId)
  const profileRef = db.collection('users').doc(uid)

  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, operationSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(operationRef),
    ])

    await assertSystemOperational(transaction)

    if (!profileSnapshot.exists) {
      throw new HttpsError('permission-denied', 'No existe un perfil autorizado para esta cuenta.')
    }
    const actor = actorFromProfile(uid, profileSnapshot.data() ?? {}, options.roles)

    if (operationSnapshot.exists) {
      const previous = operationSnapshot.data() ?? {}
      if (
        previous.operationType !== options.operationType
        || previous.entityId !== options.entityId
        || previous.fingerprint !== fingerprint
      ) {
        throw new HttpsError('already-exists', 'La clave de idempotencia ya fue usada para otra operacion.')
      }
      return previous.result as T
    }

    const result = await options.handler(transaction, actor)
    transaction.create(operationRef, {
      id: operationId,
      idempotencyKeyHash: digest(key),
      operationType: options.operationType,
      entityId: options.entityId,
      fingerprint,
      status: 'completed',
      result,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      createdByRole: actor.role,
    })
    return result
  })
}

export const writeActivity = (
  transaction: Transaction,
  actor: Actor,
  input: {
    action: string
    module: string
    description: string
    entityId: string
    entityName?: string
    metadata?: Record<string, unknown>
  },
) => {
  const logRef = db.collection('activityLogs').doc()
  transaction.create(logRef, {
    id: logRef.id,
    action: input.action,
    module: input.module,
    description: input.description,
    entityId: input.entityId,
    entityName: input.entityName ?? '',
    metadata: input.metadata ?? {},
    userId: actor.uid,
    userName: actor.name,
    userEmail: actor.email,
    userRole: actor.role,
    createdAt: FieldValue.serverTimestamp(),
    source: 'secure_backend',
  })
}

export const stringValue = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export const optionalString = (value: unknown, maxLength = 500) => stringValue(value).slice(0, maxLength)

export const requiredString = (value: unknown, label: string, maxLength = 200) => {
  const parsed = optionalString(value, maxLength)
  if (!parsed) throw new HttpsError('invalid-argument', `${label} es obligatorio.`)
  return parsed
}

export const nonNegativeMoney = (value: unknown, label: string) => {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new HttpsError('invalid-argument', `${label} debe ser un monto entero no negativo.`)
  }
  return number
}

export const positiveMoney = (value: unknown, label: string) => {
  const number = nonNegativeMoney(value, label)
  if (number <= 0) throw new HttpsError('invalid-argument', `${label} debe ser mayor a cero.`)
  return number
}

export const positiveQuantity = (value: unknown, label = 'La cantidad') => {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new HttpsError('invalid-argument', `${label} debe ser un entero mayor a cero.`)
  }
  return number
}

export const validPaymentMethod = (value: unknown) => {
  const method = stringValue(value)
  if (!['cash', 'transfer', 'card', 'qr', 'other'].includes(method)) {
    throw new HttpsError('invalid-argument', 'Selecciona un metodo de pago valido.')
  }
  return method
}

export const validCardType = (paymentMethod: string, value: unknown) => {
  const cardType = stringValue(value)
  if (paymentMethod === 'card' && !['debit', 'credit'].includes(cardType)) {
    throw new HttpsError('invalid-argument', 'Selecciona si la tarjeta es debito o credito.')
  }
  return paymentMethod === 'card' ? cardType : ''
}

export const timestampFromUnknown = (value: unknown, fallback = Timestamp.now()) => {
  if (value instanceof Timestamp) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return Timestamp.fromDate(date)
  }
  return fallback
}

export const newDocumentId = (collection: string) => db.collection(collection).doc().id || randomUUID()

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(asRecord) : []

export const serverTimestamp = () => FieldValue.serverTimestamp()

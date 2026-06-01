import { Timestamp, addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { getCurrentUserAudit } from './userAudit'

export type ActivityAction = 'create' | 'update' | 'creation' | 'edition' | 'deletion' | 'approval' | 'cancellation' | 'status_change'

export type ActivityModule =
  | 'Recepción'
  | 'Reservas'
  | 'Presupuestos'
  | 'Decoración'
  | 'Finanzas'
  | 'Cantina'
  | 'Clientes'
  | 'Configuración'

export interface ActivityLogInput {
  action: ActivityAction
  module: ActivityModule
  description: string
  entityId?: string
  entityName?: string
  metadata?: Record<string, unknown>
}

export interface ActivityLogRecord extends ActivityLogInput {
  id: string
  createdAt: Date | null
  userEmail: string
  userId: string | null
  userName: string
}

const activityLogsRef = () => collection(db, 'activityLogs')

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const displayUserName = (name?: string, email?: string) => {
  const trimmedName = String(name ?? '').trim()
  if (trimmedName) return trimmedName
  const trimmedEmail = String(email ?? '').trim()
  return trimmedEmail || 'Usuario desconocido'
}

export const logActivity = async (input: ActivityLogInput) => {
  try {
    const userAudit = await getCurrentUserAudit()
    await addDoc(activityLogsRef(), {
      action: input.action,
      createdAt: serverTimestamp(),
      description: input.description,
      entityId: input.entityId ?? '',
      entityName: input.entityName ?? '',
      metadata: input.metadata ?? {},
      module: input.module,
      userEmail: userAudit.email ?? '',
      userId: userAudit.uid ?? null,
      userName: displayUserName(userAudit.name, userAudit.email),
    })
  } catch (error) {
    console.warn('[ActivityLog] No se pudo registrar la actividad.', error)
  }
}

export const subscribeActivityLogs = (
  onNext: (logs: ActivityLogRecord[]) => void,
  onError: (message: string) => void,
  maxItems = 20,
) =>
  onSnapshot(
    query(activityLogsRef(), orderBy('createdAt', 'desc'), limit(maxItems)),
    (snapshot) => {
      onNext(
        snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data()
          return {
            action: (data.action as ActivityAction) ?? 'edition',
            createdAt: dateFromTimestamp(data.createdAt),
            description: String(data.description ?? ''),
            entityId: String(data.entityId ?? ''),
            entityName: String(data.entityName ?? ''),
            id: docSnapshot.id,
            metadata: (data.metadata as Record<string, unknown> | undefined) ?? {},
            module: (data.module as ActivityModule) ?? 'Configuración',
            userEmail: String(data.userEmail ?? ''),
            userId: data.userId ? String(data.userId) : null,
            userName: displayUserName(String(data.userName ?? ''), String(data.userEmail ?? '')),
          }
        }),
      )
    },
    (error) => onError(error.message),
  )

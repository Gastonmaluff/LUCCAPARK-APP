import { GoogleAuth } from 'google-auth-library'
import { HttpsError } from 'firebase-functions/v2/https'
import { asRecord, requireActor, type UserRole } from './common'

const BACKUP_STATUS_ROLES: readonly UserRole[] = ['admin', 'socio']
const FIRESTORE_API = 'https://firestore.googleapis.com/v1'
const DEFAULT_DATABASE = '(default)'

interface FirestoreDatabase {
  name?: string
  uid?: string
  locationId?: string
}

interface BackupSchedule {
  name?: string
  createTime?: string
  updateTime?: string
  retention?: string
  dailyRecurrence?: Record<string, never>
  weeklyRecurrence?: { day?: string }
}

interface BackupResource {
  name?: string
  database?: string
  databaseUid?: string
  snapshotTime?: string
  expireTime?: string
  state?: string
}

interface ListBackupSchedulesResponse {
  backupSchedules?: BackupSchedule[]
}

interface ListBackupsResponse {
  backups?: BackupResource[]
  unreachable?: string[]
}

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] })

const encodePathPart = (value: string) => encodeURIComponent(value)

const parseRetentionDays = (retention: string | undefined) => {
  if (!retention) return null
  const seconds = Number(retention.replace(/s$/, ''))
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.round(seconds / 86400)
}

const scheduleFrequency = (schedule: BackupSchedule | undefined) => {
  if (!schedule) return 'none'
  if (schedule.dailyRecurrence) return 'daily'
  if (schedule.weeklyRecurrence) return 'weekly'
  return 'unknown'
}

const latestReadyBackup = (backups: BackupResource[]) =>
  backups
    .filter((backup) => backup.state === 'READY' && backup.snapshotTime)
    .sort((left, right) => Date.parse(right.snapshotTime ?? '') - Date.parse(left.snapshotTime ?? ''))[0] ?? null

const requestFirestoreAdmin = async <T>(url: string): Promise<T> => {
  const client = await auth.getClient()
  const response = await client.request<T>({ method: 'GET', url })
  return response.data
}

export const getNativeBackupStatusSecure = async (uid: string | null | undefined, data: unknown) => {
  await requireActor(uid, BACKUP_STATUS_ROLES)

  const input = asRecord(data)
  const requestedDatabase = typeof input.databaseId === 'string' && /^[a-zA-Z0-9()_-]{1,80}$/.test(input.databaseId)
    ? input.databaseId
    : DEFAULT_DATABASE
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || await auth.getProjectId()
  if (!projectId) throw new HttpsError('failed-precondition', 'No se pudo resolver el proyecto de Google Cloud.')

  const databasePath = `projects/${projectId}/databases/${encodePathPart(requestedDatabase)}`
  const database = await requestFirestoreAdmin<FirestoreDatabase>(`${FIRESTORE_API}/${databasePath}`)
  const databaseName = database.name ?? `projects/${projectId}/databases/${requestedDatabase}`
  const databaseUid = database.uid ?? ''
  const locationId = database.locationId ?? ''

  const [schedulesResponse, backupsResponse] = await Promise.all([
    requestFirestoreAdmin<ListBackupSchedulesResponse>(`${FIRESTORE_API}/${databasePath}/backupSchedules`),
    requestFirestoreAdmin<ListBackupsResponse>(`${FIRESTORE_API}/projects/${projectId}/locations/${encodePathPart(locationId || '-')}/backups`),
  ])

  const schedules = schedulesResponse.backupSchedules ?? []
  const activeSchedule = schedules.find((schedule) => schedule.dailyRecurrence) ?? schedules[0]
  const relevantBackups = (backupsResponse.backups ?? []).filter((backup) =>
    databaseUid ? backup.databaseUid === databaseUid : backup.database === databaseName,
  )
  const latestBackup = latestReadyBackup(relevantBackups)

  return {
    checkedAt: new Date().toISOString(),
    databaseId: requestedDatabase,
    databaseName,
    databaseUid,
    frequency: scheduleFrequency(activeSchedule),
    isActive: schedules.length > 0,
    latestBackup: latestBackup
      ? {
          expireTime: latestBackup.expireTime ?? null,
          name: latestBackup.name ?? '',
          snapshotTime: latestBackup.snapshotTime ?? null,
          state: latestBackup.state ?? '',
        }
      : null,
    locationId,
    retentionDays: parseRetentionDays(activeSchedule?.retention),
    scheduleName: activeSchedule?.name ?? '',
    scheduleUpdatedAt: activeSchedule?.updateTime ?? activeSchedule?.createTime ?? null,
    unreachableLocations: backupsResponse.unreachable ?? [],
  }
}

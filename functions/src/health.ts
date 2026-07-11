import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import { db, region } from './common'

export type HealthStatus = 'ok' | 'warn' | 'error'

export interface ComponentHealth {
  status: 'ok' | 'error'
  responseMs: number
  errorCode?: string
}

export interface HealthReport {
  status: HealthStatus
  database: ComponentHealth
  authentication: ComponentHealth
  functions: ComponentHealth
  storage?: ComponentHealth
  version: string
  checkedAt: string
}

export interface HealthDependencies {
  database: () => Promise<void>
  authentication: () => Promise<void>
  storage?: () => Promise<void>
  logError?: (component: string, error: unknown) => void
}

interface HealthOptions {
  timeoutMs?: number
  version?: string
  now?: () => number
  checkedAt?: () => string
}

class ComponentTimeoutError extends Error {}

const packageVersion = '0.1.0'

export const deployedVersion = () =>
  process.env.GIT_COMMIT_SHA
  || process.env.APP_VERSION
  || process.env.K_REVISION
  || packageVersion

const errorCode = (component: string, error: unknown) => {
  const suffix = error instanceof ComponentTimeoutError ? 'TIMEOUT' : 'UNAVAILABLE'
  return `${component.toUpperCase()}_${suffix}`
}

const withTimeout = async (operation: () => Promise<void>, timeoutMs: number) => {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ComponentTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const checkComponent = async (
  component: string,
  operation: () => Promise<void>,
  timeoutMs: number,
  now: () => number,
  logError: (componentName: string, error: unknown) => void,
): Promise<ComponentHealth> => {
  const startedAt = now()
  try {
    await withTimeout(operation, timeoutMs)
    return { status: 'ok', responseMs: Math.max(0, now() - startedAt) }
  } catch (error) {
    logError(component, error)
    return {
      status: 'error',
      responseMs: Math.max(0, now() - startedAt),
      errorCode: errorCode(component, error),
    }
  }
}

export const buildHealthReport = async (
  dependencies: HealthDependencies,
  options: HealthOptions = {},
): Promise<HealthReport> => {
  const timeoutMs = options.timeoutMs ?? 5000
  const now = options.now ?? Date.now
  const checkedAt = options.checkedAt ?? (() => new Date().toISOString())
  const logError = dependencies.logError ?? (() => undefined)
  const functionStartedAt = now()

  const [database, authentication, storage] = await Promise.all([
    checkComponent('database', dependencies.database, timeoutMs, now, logError),
    checkComponent('authentication', dependencies.authentication, timeoutMs, now, logError),
    dependencies.storage
      ? checkComponent('storage', dependencies.storage, timeoutMs, now, logError)
      : Promise.resolve(undefined),
  ])

  const functions: ComponentHealth = {
    status: 'ok',
    responseMs: Math.max(0, now() - functionStartedAt),
  }
  const criticalFailure = database.status === 'error' || authentication.status === 'error'
  const status: HealthStatus = criticalFailure ? 'error' : storage?.status === 'error' ? 'warn' : 'ok'

  return {
    status,
    database,
    authentication,
    functions,
    ...(storage ? { storage } : {}),
    version: options.version ?? deployedVersion(),
    checkedAt: checkedAt(),
  }
}

const isAlreadyExistsError = (error: unknown) => {
  const code = (error as { code?: string | number } | null)?.code
  return code === 6 || code === '6' || code === 'already-exists'
}

const checkFirestore = async () => {
  const healthRef = db.collection('_health').doc('status')
  let snapshot = await healthRef.get()
  if (!snapshot.exists) {
    try {
      await healthRef.create({
        component: 'firestore',
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error
    }
    snapshot = await healthRef.get()
  }
  if (!snapshot.exists) throw new Error('Health document is unavailable')
}

const productionDependencies: HealthDependencies = {
  database: checkFirestore,
  authentication: async () => {
    await getAuth().listUsers(1)
  },
  storage: async () => {
    await getStorage().bucket().getMetadata()
  },
  logError: (component, error) => logger.error(`[healthCheck] ${component} check failed`, error),
}

export const healthCheckHandler = async (
  request: { method: string },
  response: {
    status: (code: number) => { json: (body: unknown) => void }
    set: (headers: Record<string, string>) => void
  },
) => {
  response.set({
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })

  if (request.method !== 'GET') {
    response.status(405).json({ status: 'error', errorCode: 'METHOD_NOT_ALLOWED' })
    return
  }

  try {
    response.status(200).json(await buildHealthReport(productionDependencies))
  } catch (error) {
    logger.error('[healthCheck] Unable to build health response', error)
    response.status(500).json({
      status: 'error',
      functions: { status: 'error', responseMs: 0, errorCode: 'HEALTH_RESPONSE_UNAVAILABLE' },
      version: deployedVersion(),
      checkedAt: new Date().toISOString(),
    })
  }
}

export const healthCheckEndpoint = onRequest(
  { region, timeoutSeconds: 15, memory: '256MiB', invoker: 'public' },
  healthCheckHandler,
)

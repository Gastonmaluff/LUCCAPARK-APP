import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'
import { ensureReceptionSession } from './authSession'

const retryKeys = new Map<string, string>()

const randomKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `secure-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

const errorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return 'No se pudo completar la operacion segura.'
  return error.message
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^functions\/[a-z-]+:\s*/i, '')
    .trim() || 'No se pudo completar la operacion segura.'
}

export const callSecureFunction = async <T>(
  name: string,
  payload: Record<string, unknown>,
  retryScope: string,
): Promise<T> => {
  await ensureReceptionSession()
  const keyScope = `${name}:${retryScope}`
  const idempotencyKey = retryKeys.get(keyScope) ?? randomKey()
  retryKeys.set(keyScope, idempotencyKey)

  try {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name)
    const response = await callable({ ...payload, idempotencyKey })
    retryKeys.delete(keyScope)
    return response.data
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error })
  }
}

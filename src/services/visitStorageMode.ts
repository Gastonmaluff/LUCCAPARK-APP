export type VisitStorageMode = 'firestore' | 'local'

let modePromise: Promise<VisitStorageMode> | null = null

export const resetVisitStorageMode = () => {
  modePromise = null
}

export const getVisitStorageMode = () => {
  if (modePromise) {
    return modePromise
  }

  const configuredMode = import.meta.env.VITE_VISIT_STORAGE_MODE
  modePromise = Promise.resolve(configuredMode === 'local' ? 'local' : 'firestore')

  return modePromise
}

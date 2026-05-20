import type { VisitStorageMode } from '../../services/visitStorageMode'

export function StorageModeNotice({ mode }: { mode: VisitStorageMode | null }) {
  if (mode !== 'local') {
    return null
  }

  return (
    <div className="form-alert warning">
      Firestore todavia no esta creado en el proyecto Firebase. La recepcion funciona en modo local temporal en este navegador.
    </div>
  )
}

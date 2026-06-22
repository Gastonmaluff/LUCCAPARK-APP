import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Download, ShieldCheck, Upload } from 'lucide-react'
import { useUserProfile } from '../../hooks/useUserProfile'
import {
  generateBackup,
  getBackupCollections,
  getBackupDownloadUrl,
  restoreBackupJson,
  subscribeAutomaticBackupState,
  subscribeBackups,
  validateBackupJson,
  type AutomaticBackupState,
  type BackupJson,
  type BackupMetadata,
} from '../../services/backupService'
import { StatusPill } from '../StatusPill'

const formatDateTime = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date)
    : 'Sin fecha'

const formatNumber = (value: number) => new Intl.NumberFormat('es-PY').format(value)

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const downloadRemoteBackup = async (backup: BackupMetadata) => {
  const url = await getBackupDownloadUrl(backup)
  const link = document.createElement('a')
  link.href = url
  link.download = backup.fileName
  link.target = '_blank'
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const backupStatusTone = (status: BackupMetadata['status']) => (status === 'success' ? 'available' : 'blocked')

export function BackupSettingsPanel() {
  const { isLoadingProfile, profile } = useUserProfile()
  const [isOpen, setIsOpen] = useState(false)
  const [openSections, setOpenSections] = useState({ automatic: false, manual: true, restore: false })
  const [backups, setBackups] = useState<BackupMetadata[]>([])
  const [backupsError, setBackupsError] = useState<string | null>(null)
  const [automaticState, setAutomaticState] = useState<AutomaticBackupState>({ checkedAt: null, lastSuccessAt: null, lockExpiresAt: null, status: 'idle' })
  const [automaticError, setAutomaticError] = useState<string | null>(null)
  const [isGeneratingManual, setIsGeneratingManual] = useState(false)
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)
  const [restoreBackup, setRestoreBackup] = useState<BackupJson | null>(null)
  const [restoreConfirmChecked, setRestoreConfirmChecked] = useState(false)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const canManageBackups = profile?.role === 'admin' || profile?.role === 'socio'
  const manualBackups = useMemo(() => backups.filter((backup) => backup.type === 'manual'), [backups])
  const automaticBackups = useMemo(() => backups.filter((backup) => backup.type === 'automatic'), [backups])
  const lastAutomatic = automaticBackups.find((backup) => backup.status === 'success')
  const nextAutomatic = automaticState.lastSuccessAt
    ? new Date(automaticState.lastSuccessAt.getTime() + 12 * 60 * 60 * 1000)
    : null

  useEffect(() => {
    if (isLoadingProfile) return undefined
    if (!canManageBackups) {
      setBackups([])
      setBackupsError(null)
      setAutomaticError(null)
      return undefined
    }

    const unsubscribeBackups = subscribeBackups(
      (nextBackups) => {
        setBackups(nextBackups)
        setBackupsError(null)
      },
      setBackupsError,
    )
    const unsubscribeAutomatic = subscribeAutomaticBackupState(
      (nextState) => {
        setAutomaticState(nextState)
        setAutomaticError(null)
      },
      setAutomaticError,
    )
    return () => {
      unsubscribeBackups()
      unsubscribeAutomatic()
    }
  }, [canManageBackups, isLoadingProfile])

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const handleGenerateManualBackup = async () => {
    setManualMessage(null)
    setIsGeneratingManual(true)
    try {
      const result = await generateBackup('manual')
      downloadBlob(result.blob, result.fileName)
      setManualMessage(`Backup generado correctamente: ${result.backup.summary.totalDocuments} documentos.`)
    } catch (error) {
      setManualMessage(error instanceof Error ? error.message : 'No se pudo generar el backup manual.')
    } finally {
      setIsGeneratingManual(false)
    }
  }

  const handleRestoreFile = async (file: File | null) => {
    setRestoreBackup(null)
    setRestoreMessage(null)
    setRestoreConfirmChecked(false)
    setRestoreConfirmText('')
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      setRestoreBackup(validateBackupJson(parsed))
    } catch (error) {
      setRestoreMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo JSON.')
    }
  }

  const handleRestore = async () => {
    if (!restoreBackup) return
    setIsRestoring(true)
    setRestoreMessage(null)
    try {
      const result = await restoreBackupJson(restoreBackup)
      setRestoreMessage(`Restauracion completada. Documentos procesados: ${result.totalRestored}.`)
    } catch (error) {
      setRestoreMessage(error instanceof Error ? error.message : 'No se pudo restaurar el backup.')
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <article className="panel settings-backup-panel">
      <button className="finance-collapsible-header" onClick={() => setIsOpen((current) => !current)} type="button">
        <span className="finance-collapsible-title">
          {isOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
          <ShieldCheck color="var(--orange)" size={20} />
          <span>
            <strong>Backup de seguridad</strong>
            <small>Copias de respaldo y restauración de datos del sistema.</small>
          </span>
        </span>
        <strong>{backups.length} backups</strong>
      </button>

      {isOpen ? (
        <div className="settings-backup-body">
          {backupsError ? <div className="form-alert error">No se pudieron cargar backups: {backupsError}</div> : null}
          <BackupSubsection isOpen={openSections.manual} onToggle={() => toggleSection('manual')} title="Backup manual">
            <div className="backup-action-row">
              <div>
                <h3>Generar backup manual</h3>
                <p className="muted">Exporta las colecciones principales en un JSON descargable y guarda una copia en Storage.</p>
              </div>
              <button className="button primary" disabled={!canManageBackups || isGeneratingManual} onClick={handleGenerateManualBackup} type="button">
                <Download size={17} />
                {isGeneratingManual ? 'Generando...' : 'Generar backup manual'}
              </button>
            </div>
            {!canManageBackups ? <div className="form-alert error">Solo administradores o socios pueden gestionar backups.</div> : null}
            {manualMessage ? <div className={manualMessage.includes('No se') ? 'form-alert error' : 'form-alert success'}>{manualMessage}</div> : null}
            <BackupList backups={manualBackups} />
          </BackupSubsection>

          <BackupSubsection isOpen={openSections.automatic} onToggle={() => toggleSection('automatic')} title="Backup automático">
            <div className="backup-auto-status">
              <StatusPill tone={automaticState.status === 'error' ? 'blocked' : automaticState.status === 'running' ? 'warning' : 'available'}>
                Activo por uso del sistema
              </StatusPill>
              <p>
                El sistema genera un backup automático cuando un usuario autorizado ingresa, siempre que hayan pasado más de 12 horas desde el último backup automático exitoso.
              </p>
              {automaticError ? <div className="form-alert error">No se pudo leer estado automático: {automaticError}</div> : null}
              {automaticState.errorMessage ? <div className="form-alert error">{automaticState.errorMessage}</div> : null}
            </div>
            <div className="backup-native-card">
              <div className="backup-native-card-heading">
                <div>
                  <h3>Backup nativo de Firestore</h3>
                  <p className="muted">Administrado por Firebase/Google Cloud.</p>
                </div>
                <StatusPill tone="available">Activo</StatusPill>
              </div>
              <p>
                Además del backup manual y el backup automático por uso del sistema, este proyecto tiene activo Firestore Scheduled Backups: copia diaria de la base de datos con retención de 30 días.
              </p>
              <div className="backup-native-facts">
                <span><small>Frecuencia</small><strong>Diaria</strong></span>
                <span><small>Retención</small><strong>30 días</strong></span>
                <span><small>Base de datos</small><strong>(default)</strong></span>
              </div>
              <p className="backup-native-note">
                Estos backups nativos se restauran desde Firebase o Google Cloud; el botón Restaurar desde JSON solo usa backups generados por el sistema.
              </p>
            </div>
            <div className="backup-summary-grid">
              <span><small>Último automático</small><strong>{formatDateTime(lastAutomatic?.createdAt ?? automaticState.lastSuccessAt)}</strong></span>
              <span><small>Próximo estimado</small><strong>{formatDateTime(nextAutomatic)}</strong></span>
              <span><small>Estado interno</small><strong>{automaticState.status}</strong></span>
            </div>
            <BackupList backups={automaticBackups} />
          </BackupSubsection>

          <BackupSubsection isOpen={openSections.restore} onToggle={() => toggleSection('restore')} title="Restaurar desde JSON">
            <div className="form-alert warning">
              Esta restauración no borra datos actuales que no estén en el backup; solo crea o sobrescribe documentos incluidos.
            </div>
            {!isAdmin ? <div className="form-alert error">Solo un usuario administrador puede restaurar backups.</div> : null}
            <label className="field">
              <span>Archivo JSON</span>
              <input accept="application/json,.json" onChange={(event) => void handleRestoreFile(event.currentTarget.files?.[0] ?? null)} type="file" />
            </label>
            {restoreBackup ? <RestoreSummary backup={restoreBackup} /> : null}
            <label className="checkbox-option">
              <input checked={restoreConfirmChecked} onChange={(event) => setRestoreConfirmChecked(event.target.checked)} type="checkbox" />
              Entiendo que esta acción puede sobrescribir datos actuales.
            </label>
            <label className="field">
              <span>Escribí RESTAURAR para confirmar</span>
              <input onChange={(event) => setRestoreConfirmText(event.target.value)} value={restoreConfirmText} />
            </label>
            {restoreMessage ? <div className={restoreMessage.includes('No se') || restoreMessage.includes('Solo') ? 'form-alert error' : 'form-alert success'}>{restoreMessage}</div> : null}
            <div className="module-actions">
              <button
                className="button primary"
                disabled={!isAdmin || !restoreBackup || !restoreConfirmChecked || restoreConfirmText !== 'RESTAURAR' || isRestoring}
                onClick={handleRestore}
                type="button"
              >
                <Upload size={17} />
                {isRestoring ? 'Restaurando...' : 'Restaurar backup'}
              </button>
            </div>
          </BackupSubsection>
        </div>
      ) : null}
    </article>
  )
}

function BackupSubsection({ children, isOpen, onToggle, title }: { children: ReactNode; isOpen: boolean; onToggle: () => void; title: string }) {
  return (
    <section className="backup-subsection">
      <button className="public-editor-section-toggle" onClick={onToggle} type="button">
        <span>{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<strong>{title}</strong></span>
      </button>
      {isOpen ? <div className="backup-subsection-body">{children}</div> : null}
    </section>
  )
}

function BackupList({ backups }: { backups: BackupMetadata[] }) {
  if (backups.length === 0) return <div className="empty-state">Todavía no hay backups para mostrar.</div>

  return (
    <div className="backup-list">
      {backups.map((backup) => (
        <article className="backup-card" key={backup.id}>
          <div>
            <small>{formatDateTime(backup.createdAt)}</small>
            <strong>{backup.fileName || 'Backup sin archivo'}</strong>
            <p className="muted">
              Usuario: {backup.createdByName} · Documentos: {formatNumber(backup.totalDocuments)} · Tamaño: {formatNumber(backup.fileSize)} bytes
            </p>
          </div>
          <div className="backup-card-actions">
            <StatusPill tone={backupStatusTone(backup.status)}>{backup.status === 'success' ? 'Correcto' : 'Error'}</StatusPill>
            {backup.storagePath ? (
              <button className="button ghost small-button" onClick={() => void downloadRemoteBackup(backup)} type="button">
                <Download size={15} />
                Descargar JSON
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function RestoreSummary({ backup }: { backup: BackupJson }) {
  const collections = Object.entries(backup.summary.collections)
  return (
    <div className="restore-summary">
      <h3>Resumen del backup</h3>
      <p className="muted">Fecha: {backup.generatedAt}</p>
      <p className="muted">Generado por: {backup.generatedBy.name || backup.generatedBy.email || 'Usuario desconocido'}</p>
      <div className="backup-summary-grid">
        <span><small>Total documentos</small><strong>{backup.summary.totalDocuments}</strong></span>
        <span><small>Colecciones</small><strong>{collections.length}</strong></span>
        <span><small>Versión</small><strong>{backup.backupVersion}</strong></span>
      </div>
      <div className="restore-collections">
        {collections.map(([collectionName, count]) => (
          <span key={collectionName}>{collectionName}: {count}</span>
        ))}
      </div>
      <p className="muted">Colecciones configuradas para exportar: {getBackupCollections().join(', ')}</p>
    </div>
  )
}

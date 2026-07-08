import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { useUserProfile } from '../../hooks/useUserProfile'
import {
  generateBackup,
  getBackupDownloadUrl,
  getNativeBackupStatus,
  subscribeBackups,
  type BackupMetadata,
  type NativeBackupStatus,
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

const formatIsoDateTime = (value: string | null | undefined) => {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : formatDateTime(date)
}

const formatNumber = (value: number) => new Intl.NumberFormat('es-PY').format(value)

const frequencyLabel = (frequency: NativeBackupStatus['frequency'] | undefined) => {
  if (frequency === 'daily') return 'Diaria'
  if (frequency === 'weekly') return 'Semanal'
  if (frequency === 'none') return 'Sin schedule'
  return 'Sin dato'
}

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
  const [isGeneratingManual, setIsGeneratingManual] = useState(false)
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const [nativeStatus, setNativeStatus] = useState<NativeBackupStatus | null>(null)
  const [nativeStatusError, setNativeStatusError] = useState<string | null>(null)
  const [isLoadingNativeStatus, setIsLoadingNativeStatus] = useState(false)
  const canManageBackups = profile?.role === 'admin' || profile?.role === 'socio'
  const manualBackups = useMemo(() => backups.filter((backup) => backup.type === 'manual'), [backups])

  useEffect(() => {
    if (isLoadingProfile) return undefined
    if (!canManageBackups) {
      setBackups([])
      setBackupsError(null)
      return undefined
    }

    const unsubscribeBackups = subscribeBackups(
      (nextBackups) => {
        setBackups(nextBackups)
        setBackupsError(null)
      },
      setBackupsError,
    )
    return unsubscribeBackups
  }, [canManageBackups, isLoadingProfile])

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const loadNativeStatus = useCallback(async () => {
    if (!canManageBackups) return
    setIsLoadingNativeStatus(true)
    setNativeStatusError(null)
    try {
      setNativeStatus(await getNativeBackupStatus())
    } catch (error) {
      setNativeStatusError(error instanceof Error ? error.message : 'No se pudo verificar el backup nativo.')
    } finally {
      setIsLoadingNativeStatus(false)
    }
  }, [canManageBackups])

  useEffect(() => {
    if (!isOpen || isLoadingProfile || !canManageBackups) return
    void loadNativeStatus()
  }, [canManageBackups, isLoadingProfile, isOpen, loadNativeStatus])

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
        <strong>{manualBackups.length} backups JSON</strong>
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
              <StatusPill tone={nativeStatus?.isActive ? 'available' : nativeStatus ? 'warning' : 'info'}>
                {isLoadingNativeStatus ? 'Verificando...' : nativeStatus?.isActive ? 'Scheduled Backups activo' : 'No verificado'}
              </StatusPill>
              <p>
                La copia automática oficial la realiza Firestore Scheduled Backups de forma diaria. La recuperación completa es un procedimiento administrativo desde Firebase o Google Cloud.
              </p>
              <button className="button ghost small-button" disabled={!canManageBackups || isLoadingNativeStatus} onClick={() => void loadNativeStatus()} type="button">
                <RefreshCw size={15} />
                Actualizar estado
              </button>
            </div>
            {nativeStatusError ? <div className="form-alert error">No se pudo verificar el backup nativo: {nativeStatusError}</div> : null}
            <div className="backup-native-card">
              <div className="backup-native-card-heading">
                <div>
                  <h3>Backup nativo de Firestore</h3>
                  <p className="muted">Administrado por Firebase/Google Cloud.</p>
                </div>
                <StatusPill tone={nativeStatus?.isActive ? 'available' : nativeStatus ? 'warning' : 'info'}>
                  {nativeStatus?.isActive ? 'Activo' : nativeStatus ? 'Sin schedule' : 'Verificando'}
                </StatusPill>
              </div>
              <p>
                Este indicador consulta el estado nativo de Firestore Scheduled Backups. La exportación JSON manual queda disponible como respaldo auxiliar descargable.
              </p>
              <div className="backup-native-facts">
                <span><small>Frecuencia</small><strong>{frequencyLabel(nativeStatus?.frequency)}</strong></span>
                <span><small>Retención</small><strong>{nativeStatus?.retentionDays ? `${nativeStatus.retentionDays} días` : 'Sin dato'}</strong></span>
                <span><small>Base de datos</small><strong>{nativeStatus?.databaseId ?? '(default)'}</strong></span>
                <span><small>Último backup nativo</small><strong>{formatIsoDateTime(nativeStatus?.latestBackup?.snapshotTime)}</strong></span>
                <span><small>Estado última copia</small><strong>{nativeStatus?.latestBackup?.state || 'Sin dato'}</strong></span>
                <span><small>Verificado</small><strong>{formatIsoDateTime(nativeStatus?.checkedAt)}</strong></span>
              </div>
              <p className="backup-native-note">
                Los backups nativos se restauran mediante las herramientas administrativas de Firebase o Google Cloud. Los JSON automáticos anteriores ya no se usan como indicador del backup diario.
              </p>
            </div>
          </BackupSubsection>

          <BackupSubsection isOpen={openSections.restore} onToggle={() => toggleSection('restore')} title="Restaurar desde JSON">
            <div className="form-alert warning">
              La restauración directa desde JSON está deshabilitada para proteger la integridad de pagos, stock, visitas y reservas.
            </div>
            <div className="backup-native-card">
              <div className="backup-native-card-heading">
                <div>
                  <h3>Recuperación administrativa</h3>
                  <p className="muted">Procedimiento exclusivo para el administrador técnico.</p>
                </div>
                <StatusPill tone="warning">No disponible en la web</StatusPill>
              </div>
              <p>
                La restauración completa es un procedimiento administrativo realizado mediante Firestore Scheduled Backups.
                Los archivos JSON continúan disponibles para descarga, auditoría y recuperación asistida.
              </p>
              <p className="backup-native-note">
                Un backup JSON contiene datos y referencias, pero no restaura Firebase Authentication ni los archivos físicos de Storage.
              </p>
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

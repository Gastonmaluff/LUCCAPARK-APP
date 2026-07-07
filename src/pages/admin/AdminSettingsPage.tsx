import { useEffect, useState, type ReactNode } from 'react'
import { Baby, ChevronDown, ChevronRight, Eye, History, ImagePlus, Plus, Save, SlidersHorizontal, Trash2, Users } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { BackupSettingsPanel } from '../../components/settings/BackupSettingsPanel'
import { parseGoogleMapsInput } from '../../config/app'
import { usePublicPageConfig } from '../../hooks/usePublicPageConfig'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useVisitPricing } from '../../hooks/useVisitPricing'
import { useUsers } from '../../hooks/useUsers'
import { logActivity } from '../../services/activityLogService'
import { subscribeActivityLogs, type ActivityAction, type ActivityLogRecord } from '../../services/activityLogService'
import {
  savePublicPageConfig,
  uploadPublicPageImage,
  type PublicBirthdayPackage,
  type PublicInstallationItem,
  type PublicPageConfig,
} from '../../services/publicPageService'
import { saveUserProfile } from '../../services/userService'
import { saveBabyFreeEntrySettings, saveVisitPricing } from '../../services/visitPricingService'
import { formatGuarani } from '../../utils/money'
import type { UserRole } from '../../types'

const roleOptions: Array<{ label: string; value: UserRole; detail: string }> = [
  { detail: 'Acceso total al sistema, usuarios y configuracion.', label: 'Dueno / Administrador', value: 'admin' },
  { detail: 'Acceso a operacion y finanzas, sin administracion de usuarios.', label: 'Socio', value: 'socio' },
  { detail: 'Reservas, tareas y gastos asociados a eventos.', label: 'Encargado de eventos', value: 'encargado_eventos' },
  { detail: 'Ingresos, visitas activas y cobros de salida.', label: 'Recepcion', value: 'recepcion' },
  { detail: 'Cuentas, productos y cobros de cantina.', label: 'Cantina', value: 'cantina' },
]

const emptyForm = { displayName: '', email: '', isActive: true, role: 'recepcion' as UserRole, uid: '' }

const activityActionLabels: Record<ActivityAction, string> = {
  approval: 'Aprobacion',
  cancellation: 'Cancelacion',
  create: 'Creacion',
  creation: 'Creacion',
  deletion: 'Eliminacion',
  edition: 'Edicion',
  status_change: 'Cambio de estado',
  update: 'Edicion',
}

const activityTone = (action: ActivityAction) => {
  if (action === 'create' || action === 'creation' || action === 'approval') return 'available'
  if (action === 'deletion' || action === 'cancellation') return 'blocked'
  if (action === 'status_change') return 'warning'
  return 'info'
}

const formatActivityDate = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date)
    : 'Sin fecha'

const createEditorId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const updateInstallationItem = (
  config: PublicPageConfig,
  itemId: string,
  patch: Partial<PublicInstallationItem>,
): PublicPageConfig => ({
  ...config,
  installations: {
    ...config.installations,
    items: config.installations.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  },
})

const updateBirthdayPackage = (
  config: PublicPageConfig,
  packageId: string,
  patch: Partial<PublicBirthdayPackage>,
): PublicPageConfig => ({
  ...config,
  birthday: {
    ...config.birthday,
    packages: config.birthday.packages.map((item) => (item.id === packageId ? { ...item, ...patch } : item)),
  },
})

export function AdminSettingsPage() {
  const { permissions } = useUserProfile()
  const usersResult = useUsers(permissions.canManageUsers)
  const publicPage = usePublicPageConfig()
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingUser, setIsEditingUser] = useState(false)
  const [detailUid, setDetailUid] = useState<string | null>(null)
  const [isUsersOpen, setIsUsersOpen] = useState(false)
  const [isActivityOpen, setIsActivityOpen] = useState(false)
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)
  const [isActivityLoading, setIsActivityLoading] = useState(true)
  const [isPublicEditorOpen, setIsPublicEditorOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeActivityLogs(
      (logs) => {
        setActivityLogs(logs)
        setActivityError(null)
        setIsActivityLoading(false)
      },
      (errorMessage) => {
        setActivityError(errorMessage)
        setIsActivityLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const saveUser = async () => {
    setMessage(null)
    setIsSaving(true)
    try {
      await saveUserProfile(form)
      setMessage('Funcionario vinculado correctamente. La sesion del administrador sigue activa.')
      setForm(emptyForm)
      setIsEditingUser(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el usuario.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <AdminModuleHeader
        eyebrow="Sistema"
        title="Configuracion"
        description="Administracion de usuarios, historial y contenido visible del sitio publico."
      />

      {permissions.canManageUsers ? (
        <article className="panel users-permissions-panel">
          <button className="finance-collapsible-header" onClick={() => setIsUsersOpen((current) => !current)} type="button">
            <span className="finance-collapsible-title">
              {isUsersOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
              <Users color="var(--orange)" size={20} />
              <span>
                <strong>Usuarios y permisos</strong>
                <small>Administra quien puede acceder al sistema y que puede realizar.</small>
              </span>
            </span>
            <strong>{usersResult.users.filter((user) => user.isActive).length} activos</strong>
          </button>
          {isUsersOpen ? (
            <div className="settings-users-body">
              <div className="finance-section-action-row">
                <button
                  className="button primary"
                  onClick={() => {
                    setForm(emptyForm)
                    setIsEditingUser(true)
                  }}
                  type="button"
                >
                  <Plus size={17} />
                  Agregar usuario
                </button>
              </div>
              <div className="form-alert info">
                Creación automática requiere Cloud Function segura. El flujo actual por UID queda disponible como fallback.
              </div>
              <details className="user-help-box">
                <summary>Como crear un usuario?</summary>
                <ol>
                  <li>Crear la cuenta en Firebase Authentication.</li>
                  <li>Copiar el UID.</li>
                  <li>Volver aqui y presionar Agregar usuario.</li>
                  <li>Cargar UID, nombre, email y rol.</li>
                  <li>Guardar. El funcionario podra iniciar sesion desde su dispositivo.</li>
                </ol>
              </details>
              {message ? <div className={message.includes('No se') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}
              {usersResult.error ? <div className="form-alert error">No se pudieron cargar usuarios: {usersResult.error}</div> : null}
              <div className="user-permission-grid">
                <div className="module-list">
                  {usersResult.isLoading ? <div className="empty-state">Cargando usuarios...</div> : null}
                  {!usersResult.isLoading && usersResult.users.length === 0 ? <div className="empty-state">Todavia no hay funcionarios vinculados.</div> : null}
                  {usersResult.users.map((user) => (
                    <article className="user-profile-card" key={user.uid}>
                      <div>
                        <strong>{user.displayName}</strong>
                        <small>{user.email || 'Sin email cargado'}</small>
                        {detailUid === user.uid ? <small className="technical-id">UID: {user.uid}</small> : null}
                      </div>
                      <div className="user-card-meta">
                        <StatusPill tone={user.isActive ? 'available' : 'blocked'}>{user.isActive ? 'Activo' : 'Inactivo'}</StatusPill>
                        <StatusPill tone="info">{roleOptions.find((role) => role.value === user.role)?.label ?? user.role}</StatusPill>
                      </div>
                      <div className="user-card-actions">
                        <button
                          className="button ghost small-button"
                          onClick={() => {
                            setForm({ displayName: user.displayName, email: user.email, isActive: user.isActive, role: user.role, uid: user.uid })
                            setIsEditingUser(true)
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                        <button className="button ghost small-button" onClick={() => setDetailUid((current) => (current === user.uid ? null : user.uid))} type="button">
                          <Eye size={14} />
                          Ver detalle
                        </button>
                        <button
                          className="button secondary small-button"
                          onClick={() => saveUserProfile({ displayName: user.displayName, email: user.email, isActive: !user.isActive, role: user.role, uid: user.uid })}
                          type="button"
                        >
                          {user.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="user-editor">
                  <div>
                    <p className="eyebrow">{form.uid ? 'Editar usuario' : 'Nuevo vinculo'}</p>
                    <h3>{form.displayName || 'Usuario del sistema'}</h3>
                  </div>
                  {!isEditingUser ? <div className="empty-state">Selecciona un usuario o toca Agregar usuario.</div> : null}
                  {isEditingUser ? (
                    <>
                      <label className="field">
                        <span>Nombre</span>
                        <input onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} value={form.displayName} />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} value={form.email} />
                      </label>
                      <label className="field">
                        <span>Rol</span>
                        <select onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))} value={form.role}>
                          {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                        </select>
                      </label>
                      <details className="advanced-user-box" open={!form.uid}>
                        <summary>Configuracion tecnica</summary>
                        <label className="field">
                          <span>UID real</span>
                          <input onChange={(event) => setForm((current) => ({ ...current, uid: event.target.value }))} value={form.uid} />
                          <small>Este identificador se obtiene desde Firebase Authentication.</small>
                        </label>
                      </details>
                      <label className="checkbox-option">
                        <input checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
                        Usuario activo
                      </label>
                      <div className="role-detail-list">
                        {roleOptions.map((role) => (
                          <span key={role.value}>
                            <strong>{role.label}</strong>
                            <small>{role.detail}</small>
                          </span>
                        ))}
                      </div>
                      <button className="button primary" disabled={isSaving} onClick={saveUser} type="button">
                        {isSaving ? 'Guardando...' : 'Guardar usuario'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      <article className="panel settings-activity-panel">
        <button className="finance-collapsible-header" onClick={() => setIsActivityOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isActivityOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <History color="var(--turquoise)" size={20} />
            <span>
              <strong>Historial de actividad</strong>
              <small>Registro de cambios importantes realizados por los usuarios.</small>
            </span>
          </span>
          <strong>{activityLogs.length} recientes</strong>
        </button>
        {isActivityOpen ? (
          <div className="settings-activity-body">
            {isActivityLoading ? <div className="empty-state">Cargando actividad...</div> : null}
            {activityError ? <div className="form-alert error">No se pudo cargar el historial: {activityError}</div> : null}
            {!isActivityLoading && !activityError && activityLogs.length === 0 ? (
              <div className="empty-state">Todavia no hay actividad registrada.</div>
            ) : null}
            <div className="settings-activity-list">
              {activityLogs.map((log) => (
                <article className="settings-activity-card" key={log.id}>
                  <div className="settings-activity-main">
                    <small>{formatActivityDate(log.createdAt)}</small>
                    <strong>{log.userName}</strong>
                    <p>{log.description || 'Actividad registrada'}</p>
                    {log.entityName ? <small>Relacionado: {log.entityName}</small> : null}
                  </div>
                  <div className="settings-activity-meta">
                    <StatusPill tone={activityTone(log.action)}>{activityActionLabels[log.action] ?? log.action}</StatusPill>
                    <span>Modulo: {log.module}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </article>

      <article className="panel settings-public-page-panel">
        <button className="finance-collapsible-header" onClick={() => setIsPublicEditorOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isPublicEditorOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <ImagePlus color="var(--green)" size={20} />
            <span>
              <strong>Editar pagina publica</strong>
              <small>Configura los textos, imagenes y secciones visibles del sitio publico.</small>
            </span>
          </span>
          <strong>{publicPage.isLoading ? 'Cargando' : 'Contenido'}</strong>
        </button>
        {isPublicEditorOpen ? (
          <PublicPageEditor config={publicPage.config} error={publicPage.error} isLoading={publicPage.isLoading} />
        ) : null}
      </article>
      {permissions.canManageOperationalSettings ? <OperationalSettingsPanel /> : null}
      <BackupSettingsPanel />
    </>
  )
}

function OperationalSettingsPanel() {
  const pricing = useVisitPricing()
  const [isOpen, setIsOpen] = useState(false)
  const [hourlyRate, setHourlyRate] = useState('')
  const [rateStatus, setRateStatus] = useState<string | null>(null)
  const [isSavingRate, setIsSavingRate] = useState(false)
  const [babyEnabled, setBabyEnabled] = useState(false)
  const [babyMonths, setBabyMonths] = useState('')
  const [babyStatus, setBabyStatus] = useState<string | null>(null)
  const [isSavingBaby, setIsSavingBaby] = useState(false)

  useEffect(() => {
    setHourlyRate(pricing.config.unlimitedHourlyRate ? String(pricing.config.unlimitedHourlyRate) : '')
  }, [pricing.config.unlimitedHourlyRate])

  useEffect(() => {
    setBabyEnabled(pricing.config.babyFreeEntryEnabled)
    setBabyMonths(pricing.config.babyFreeMaxAgeMonths ? String(pricing.config.babyFreeMaxAgeMonths) : '')
  }, [pricing.config.babyFreeEntryEnabled, pricing.config.babyFreeMaxAgeMonths])

  const savePricing = async () => {
    setRateStatus(null)
    setIsSavingRate(true)
    try {
      await saveVisitPricing({ unlimitedHourlyRate: Number(hourlyRate) })
      setRateStatus('Tarifa del plan libre guardada.')
      void logActivity({ action: 'update', description: 'Actualizó la tarifa por hora del plan libre', entityName: 'Ajustes operativos', module: 'Configuración', metadata: { unlimitedHourlyRate: Number(hourlyRate) } })
    } catch (saveError) {
      setRateStatus(saveError instanceof Error ? saveError.message : 'No se pudo guardar la tarifa.')
    } finally {
      setIsSavingRate(false)
    }
  }

  const saveBaby = async () => {
    setBabyStatus(null)
    setIsSavingBaby(true)
    try {
      const trimmed = babyMonths.trim()
      if (babyEnabled && !/^\d+$/.test(trimmed)) {
        throw new Error('Indica la edad maxima en meses (numero entero, sin decimales).')
      }
      const maxAgeMonths = trimmed === '' ? null : Number(trimmed)
      await saveBabyFreeEntrySettings({ enabled: babyEnabled, maxAgeMonths })
      setBabyStatus('Configuración de entrada gratuita por bebé guardada.')
      void logActivity({ action: 'update', description: `Configuró entrada gratuita por bebé (${babyEnabled ? `hasta ${maxAgeMonths} meses` : 'desactivada'})`, entityName: 'Ajustes operativos', module: 'Configuración', metadata: { babyFreeEntryEnabled: babyEnabled, babyFreeMaxAgeMonths: maxAgeMonths } })
    } catch (saveError) {
      setBabyStatus(saveError instanceof Error ? saveError.message : 'No se pudo guardar la configuración.')
    } finally {
      setIsSavingBaby(false)
    }
  }

  const previewMonths = Number(babyMonths)
  const babyPreview = babyEnabled && /^\d+$/.test(babyMonths.trim()) && previewMonths > 0
    ? `Entrada gratuita automática hasta los ${previewMonths} meses${previewMonths % 12 === 0 ? ` (${previewMonths / 12} año${previewMonths / 12 === 1 ? '' : 's'})` : ''}.`
    : babyEnabled
      ? 'Configuración pendiente: indica una edad válida en meses.'
      : 'Regla automática desactivada. Recepción puede aplicar la entrada gratuita manualmente con motivo.'

  return (
    <article className="panel settings-operational-panel">
      <button className="finance-collapsible-header" onClick={() => setIsOpen((current) => !current)} type="button">
        <span className="finance-collapsible-title">
          {isOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
          <SlidersHorizontal color="var(--turquoise)" size={20} />
          <span>
            <strong>Ajustes operativos</strong>
            <small>Parámetros de operación diaria: tarifa del plan libre y entrada gratuita por bebé.</small>
          </span>
        </span>
        <strong>{pricing.config.unlimitedHourlyRate ? formatGuarani(pricing.config.unlimitedHourlyRate) : 'Sin tarifa'}</strong>
      </button>
      {isOpen ? (
        <div className="settings-operational-body">
          {pricing.error ? <div className="form-alert error">No se pudo cargar la configuración: {pricing.error}</div> : null}

          <section className="operational-setting-block">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Recepción</p>
                <h3>Tarifa por hora del plan libre</h3>
                <p className="muted">Se usa como precio por hora al finalizar visitas Libre / sin límite.</p>
              </div>
              <strong>{pricing.config.unlimitedHourlyRate ? formatGuarani(pricing.config.unlimitedHourlyRate) : 'Sin tarifa'}</strong>
            </div>
            {rateStatus ? <div className={rateStatus.includes('No se') ? 'form-alert error' : 'form-alert success'}>{rateStatus}</div> : null}
            <div className="form-inline">
              <label className="field">
                <span>Tarifa por hora</span>
                <input
                  disabled={isSavingRate || pricing.isLoading}
                  min={1}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  placeholder="Ej. 30000"
                  type="number"
                  value={hourlyRate}
                />
              </label>
              <button className="button primary" disabled={isSavingRate || pricing.isLoading} onClick={savePricing} type="button">
                <Save size={16} />
                {isSavingRate ? 'Guardando...' : 'Guardar tarifa'}
              </button>
            </div>
          </section>

          <section className="operational-setting-block">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Recepción</p>
                <h3>Edad máxima para entrada gratuita de bebés</h3>
                <p className="muted">Cuando el niño está dentro del límite, se aplica automáticamente la entrada gratuita por bebé (solo afecta el cargo del parque).</p>
              </div>
              <Baby color="var(--orange)" size={22} />
            </div>
            {babyStatus ? <div className={babyStatus.includes('No se') || babyStatus.includes('Indica') ? 'form-alert error' : 'form-alert success'}>{babyStatus}</div> : null}
            <label className="checkbox-option">
              <input checked={babyEnabled} disabled={isSavingBaby || pricing.isLoading} onChange={(event) => setBabyEnabled(event.target.checked)} type="checkbox" />
              Activar detección automática por edad
            </label>
            <div className="form-inline">
              <label className="field">
                <span>Edad máxima (en meses)</span>
                <input
                  disabled={isSavingBaby || pricing.isLoading || !babyEnabled}
                  min={1}
                  onChange={(event) => setBabyMonths(event.target.value)}
                  placeholder="Ej. 24"
                  step={1}
                  type="number"
                  value={babyMonths}
                />
                <small>Se almacena en meses para un cálculo preciso (12, 18, 24, 36...).</small>
              </label>
              <button className="button primary" disabled={isSavingBaby || pricing.isLoading} onClick={saveBaby} type="button">
                <Save size={16} />
                {isSavingBaby ? 'Guardando...' : 'Guardar edad'}
              </button>
            </div>
            <div className="form-alert info">{babyPreview}</div>
          </section>
        </div>
      ) : null}
    </article>
  )
}

function PublicPageEditor({ config, error, isLoading }: { config: PublicPageConfig; error: string | null; isLoading: boolean }) {
  const [draft, setDraft] = useState<PublicPageConfig>(config)
  const [openSections, setOpenSections] = useState({ birthday: false, contact: false, home: true, installations: false })
  const [status, setStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  useEffect(() => {
    setDraft(config)
  }, [config])

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const persist = async (
    nextConfig: PublicPageConfig,
    activity: { action: ActivityAction; description: string; entityName?: string; metadata?: Record<string, unknown> },
  ) => {
    setStatus(null)
    setIsSaving(true)
    try {
      await savePublicPageConfig(nextConfig)
      setDraft(nextConfig)
      setStatus('Cambios guardados.')
      void logActivity({
        action: activity.action,
        description: activity.description,
        entityName: activity.entityName ?? 'Pagina publica',
        metadata: activity.metadata,
        module: 'Configuración',
      })
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los cambios.')
    } finally {
      setIsSaving(false)
    }
  }

  const uploadHeroImage = async (file: File | null) => {
    if (!file) return
    setStatus(null)
    setUploadingKey('hero')
    try {
      const imageUrl = await uploadPublicPageImage(file, 'hero', 'main')
      const nextConfig = { ...draft, home: { ...draft.home, heroImageUrl: imageUrl } }
      await persist(nextConfig, { action: 'update', description: 'Edito imagen principal de Inicio', entityName: 'Inicio' })
    } catch (uploadError) {
      setStatus(uploadError instanceof Error ? uploadError.message : 'No se pudo subir la imagen.')
    } finally {
      setUploadingKey(null)
    }
  }

  const uploadInstallationImage = async (item: PublicInstallationItem, file: File | null) => {
    if (!file) return
    setStatus(null)
    setUploadingKey(item.id)
    try {
      const imageUrl = await uploadPublicPageImage(file, 'installations', item.id)
      const nextConfig = updateInstallationItem(draft, item.id, { imageUrl })
      await persist(nextConfig, { action: 'update', description: `Edito imagen de instalacion ${item.title}`, entityName: item.title })
    } catch (uploadError) {
      setStatus(uploadError instanceof Error ? uploadError.message : 'No se pudo subir la imagen.')
    } finally {
      setUploadingKey(null)
    }
  }

  const addInstallation = async () => {
    const item: PublicInstallationItem = { accent: 'orange', id: createEditorId('installation'), imageUrl: '', isActive: true, title: 'Nueva instalacion' }
    const nextConfig = { ...draft, installations: { ...draft.installations, items: [...draft.installations.items, item] } }
    await persist(nextConfig, { action: 'create', description: 'Creo una instalacion en la pagina publica', entityName: item.title })
  }

  const deleteInstallation = async (item: PublicInstallationItem) => {
    if (!window.confirm(`Eliminar instalacion "${item.title}"?`)) return
    const nextConfig = { ...draft, installations: { ...draft.installations, items: draft.installations.items.filter((current) => current.id !== item.id) } }
    await persist(nextConfig, { action: 'deletion', description: `Elimino instalacion ${item.title}`, entityName: item.title })
  }

  const addPackage = async () => {
    const birthdayPackage: PublicBirthdayPackage = {
      buttonText: 'Consultar',
      description: 'Descripcion principal',
      features: ['Incluye juegos', 'Acompanamiento del equipo'],
      id: createEditorId('package'),
      isActive: true,
      name: 'Nuevo paquete',
      priceText: 'Consultar',
      secondaryText: 'Descripcion secundaria',
      summary: 'Frase corta',
    }
    const nextConfig = { ...draft, birthday: { ...draft.birthday, packages: [...draft.birthday.packages, birthdayPackage] } }
    await persist(nextConfig, { action: 'create', description: 'Creó un paquete de cumpleaños en la página pública', entityName: birthdayPackage.name })
  }

  const deletePackage = async (birthdayPackage: PublicBirthdayPackage) => {
    if (!window.confirm(`Eliminar paquete "${birthdayPackage.name}"?`)) return
    const nextConfig = { ...draft, birthday: { ...draft.birthday, packages: draft.birthday.packages.filter((current) => current.id !== birthdayPackage.id) } }
    await persist(nextConfig, { action: 'deletion', description: `Eliminó paquete de cumpleaños ${birthdayPackage.name}`, entityName: birthdayPackage.name })
  }

  const saveHome = () => persist(draft, { action: 'update', description: 'Editó Inicio de la página pública', entityName: 'Inicio' })
  const saveInstallations = () => persist(draft, { action: 'update', description: 'Editó Instalaciones de la página pública', entityName: 'Instalaciones' })
  const saveBirthday = () => persist(draft, { action: 'update', description: 'Editó Cumpleaños de la página pública', entityName: 'Cumpleaños' })
  const saveContact = () => {
    const mapsInput = draft.contact.googleMapsEmbedUrl || draft.contact.googleMapsUrl
    const mapsFields = parseGoogleMapsInput(mapsInput)
    const preservedExternalUrl =
      mapsFields.googleMapsEmbedUrl && draft.contact.googleMapsUrl && draft.contact.googleMapsUrl !== mapsInput
        ? draft.contact.googleMapsUrl
        : mapsFields.googleMapsUrl
    const nextConfig = {
      ...draft,
      contact: {
        ...draft.contact,
        googleMapsEmbedUrl: mapsFields.googleMapsEmbedUrl,
        googleMapsUrl: preservedExternalUrl,
      },
    }
    return persist(nextConfig, {
      action: 'update',
      description:
        nextConfig.contact.googleMapsUrl !== config.contact.googleMapsUrl ||
        nextConfig.contact.googleMapsEmbedUrl !== config.contact.googleMapsEmbedUrl
          ? 'Cambió link de Google Maps público'
          : draft.contact.whatsappNumber !== config.contact.whatsappNumber
            ? 'Cambió número de WhatsApp público'
            : 'Editó Contacto de la página pública',
      entityName: 'Contacto',
      metadata: {
        googleMapsAnterior: config.contact.googleMapsUrl,
        googleMapsEmbedAnterior: config.contact.googleMapsEmbedUrl,
        googleMapsEmbedNuevo: nextConfig.contact.googleMapsEmbedUrl,
        googleMapsNuevo: nextConfig.contact.googleMapsUrl,
        whatsappAnterior: config.contact.whatsappNumber,
        whatsappNuevo: draft.contact.whatsappNumber,
      },
    })
  }

  if (isLoading) return <div className="settings-public-page-body"><div className="empty-state">Cargando contenido publico...</div></div>

  return (
    <div className="settings-public-page-body">
      {error ? <div className="form-alert error">No se pudo cargar la pagina publica: {error}</div> : null}
      {status ? <div className={status.includes('No se') ? 'form-alert error' : 'form-alert success'}>{status}</div> : null}

      <PublicEditorSection isOpen={openSections.home} onToggle={() => toggleSection('home')} title="Inicio">
        <div className="public-editor-grid">
          <label className="field">
            <span>Texto pequeno superior</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, home: { ...current.home, eyebrow: event.target.value } }))} value={draft.home.eyebrow} />
          </label>
          <label className="field">
            <span>Titulo principal</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, home: { ...current.home, title: event.target.value } }))} value={draft.home.title} />
          </label>
          <label className="field public-editor-full">
            <span>Descripcion</span>
            <textarea onChange={(event) => setDraft((current) => ({ ...current, home: { ...current.home, description: event.target.value } }))} rows={3} value={draft.home.description} />
          </label>
          <label className="field">
            <span>Imagen principal del hero</span>
            <input accept="image/*" disabled={uploadingKey === 'hero'} onChange={(event) => void uploadHeroImage(event.currentTarget.files?.[0] ?? null)} type="file" />
          </label>
          {draft.home.heroImageUrl ? <img alt="Hero actual" className="public-editor-preview" src={draft.home.heroImageUrl} /> : null}
        </div>
        <button className="button primary" disabled={isSaving} onClick={saveHome} type="button">
          <Save size={16} />
          Guardar Inicio
        </button>
      </PublicEditorSection>

      <PublicEditorSection isOpen={openSections.installations} onToggle={() => toggleSection('installations')} title="Instalaciones">
        <div className="public-editor-grid">
          <label className="field">
            <span>Titulo</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, installations: { ...current.installations, title: event.target.value } }))} value={draft.installations.title} />
          </label>
          <label className="field public-editor-full">
            <span>Descripcion</span>
            <textarea onChange={(event) => setDraft((current) => ({ ...current, installations: { ...current.installations, description: event.target.value } }))} rows={3} value={draft.installations.description} />
          </label>
        </div>
        <div className="public-editor-actions">
          <button className="button secondary" disabled={isSaving} onClick={addInstallation} type="button">
            <Plus size={16} />
            Agregar instalacion
          </button>
          <button className="button primary" disabled={isSaving} onClick={saveInstallations} type="button">
            <Save size={16} />
            Guardar Instalaciones
          </button>
        </div>
        <div className="public-editor-list">
          {draft.installations.items.map((item) => (
            <article className="public-editor-card" key={item.id}>
              <div className="public-editor-card-header">
                <strong>{item.title}</strong>
                <button className="button ghost small-button danger-button" onClick={() => void deleteInstallation(item)} type="button">
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
              <div className="public-editor-grid">
                <label className="field">
                  <span>Titulo</span>
                  <input onChange={(event) => setDraft((current) => updateInstallationItem(current, item.id, { title: event.target.value }))} value={item.title} />
                </label>
                <label className="field">
                  <span>Acento</span>
                  <select onChange={(event) => setDraft((current) => updateInstallationItem(current, item.id, { accent: event.target.value }))} value={item.accent}>
                    <option value="orange">Naranja</option>
                    <option value="green">Verde</option>
                    <option value="turquoise">Turquesa</option>
                    <option value="yellow">Amarillo</option>
                  </select>
                </label>
                <label className="field">
                  <span>Imagen</span>
                  <input accept="image/*" disabled={uploadingKey === item.id} onChange={(event) => void uploadInstallationImage(item, event.currentTarget.files?.[0] ?? null)} type="file" />
                </label>
                <label className="checkbox-option">
                  <input checked={item.isActive} onChange={(event) => setDraft((current) => updateInstallationItem(current, item.id, { isActive: event.target.checked }))} type="checkbox" />
                  Activa
                </label>
              </div>
              {item.imageUrl ? <img alt={item.title} className="public-editor-preview" src={item.imageUrl} /> : null}
            </article>
          ))}
        </div>
      </PublicEditorSection>

      <PublicEditorSection isOpen={openSections.birthday} onToggle={() => toggleSection('birthday')} title="Cumpleaños">
        <div className="public-editor-grid">
          <label className="field">
            <span>Titulo</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, birthday: { ...current.birthday, title: event.target.value } }))} value={draft.birthday.title} />
          </label>
          <label className="field public-editor-full">
            <span>Descripcion</span>
            <textarea onChange={(event) => setDraft((current) => ({ ...current, birthday: { ...current.birthday, description: event.target.value } }))} rows={3} value={draft.birthday.description} />
          </label>
        </div>
        <div className="public-editor-actions">
          <button className="button secondary" disabled={isSaving} onClick={addPackage} type="button">
            <Plus size={16} />
            Crear paquete
          </button>
          <button className="button primary" disabled={isSaving} onClick={saveBirthday} type="button">
            <Save size={16} />
            Guardar Cumpleaños
          </button>
        </div>
        <div className="public-editor-list">
          {draft.birthday.packages.map((birthdayPackage) => (
            <article className="public-editor-card" key={birthdayPackage.id}>
              <div className="public-editor-card-header">
                <strong>{birthdayPackage.name}</strong>
                <button className="button ghost small-button danger-button" onClick={() => void deletePackage(birthdayPackage)} type="button">
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
              <div className="public-editor-grid">
                <label className="field">
                  <span>Nombre del paquete</span>
                  <input onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { name: event.target.value }))} value={birthdayPackage.name} />
                </label>
                <label className="field">
                  <span>Frase corta</span>
                  <input onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { summary: event.target.value }))} value={birthdayPackage.summary} />
                </label>
                <label className="field">
                  <span>Duracion o descripcion principal</span>
                  <input onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { description: event.target.value }))} value={birthdayPackage.description} />
                </label>
                <label className="field">
                  <span>Descripcion secundaria</span>
                  <input onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { secondaryText: event.target.value }))} value={birthdayPackage.secondaryText} />
                </label>
                <label className="field">
                  <span>Texto del boton</span>
                  <input onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { buttonText: event.target.value }))} value={birthdayPackage.buttonText} />
                </label>
                <label className="field">
                  <span>Precio o texto de consulta</span>
                  <input onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { priceText: event.target.value }))} value={birthdayPackage.priceText} />
                </label>
                <label className="field public-editor-full">
                  <span>Incluye / caracteristicas</span>
                  <textarea
                    onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { features: event.target.value.split('\n').map((feature) => feature.trim()).filter(Boolean) }))}
                    rows={4}
                    value={birthdayPackage.features.join('\n')}
                  />
                </label>
                <label className="checkbox-option">
                  <input checked={birthdayPackage.isActive} onChange={(event) => setDraft((current) => updateBirthdayPackage(current, birthdayPackage.id, { isActive: event.target.checked }))} type="checkbox" />
                  Activo
                </label>
              </div>
            </article>
          ))}
        </div>
      </PublicEditorSection>

      <PublicEditorSection isOpen={openSections.contact} onToggle={() => toggleSection('contact')} title="Contacto">
        <div className="public-editor-grid">
          <label className="field">
            <span>Titulo</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, contact: { ...current.contact, title: event.target.value } }))} value={draft.contact.title} />
          </label>
          <label className="field">
            <span>Número de WhatsApp</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, contact: { ...current.contact, whatsappNumber: event.target.value } }))} value={draft.contact.whatsappNumber} />
          </label>
          <label className="field public-editor-full">
            <span>Ubicación / Google Maps</span>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, contact: { ...current.contact, googleMapsEmbedUrl: '', googleMapsUrl: event.target.value } }))}
              placeholder="Pegá un link normal, compartido o iframe de Google Maps"
              value={draft.contact.googleMapsEmbedUrl || draft.contact.googleMapsUrl}
            />
            <small>Podés pegar un link de Google Maps o el código iframe de insertar mapa.</small>
          </label>
          <label className="field public-editor-full">
            <span>Descripcion</span>
            <textarea onChange={(event) => setDraft((current) => ({ ...current, contact: { ...current.contact, description: event.target.value } }))} rows={3} value={draft.contact.description} />
          </label>
          <label className="field public-editor-full">
            <span>Mensaje por defecto de WhatsApp</span>
            <textarea onChange={(event) => setDraft((current) => ({ ...current, contact: { ...current.contact, whatsappMessage: event.target.value } }))} rows={3} value={draft.contact.whatsappMessage} />
          </label>
        </div>
        <button className="button primary" disabled={isSaving} onClick={saveContact} type="button">
          <Save size={16} />
          Guardar Contacto
        </button>
      </PublicEditorSection>
    </div>
  )
}

function PublicEditorSection({ children, isOpen, onToggle, title }: { children: ReactNode; isOpen: boolean; onToggle: () => void; title: string }) {
  return (
    <section className="public-editor-section">
      <button className="public-editor-section-toggle" onClick={onToggle} type="button">
        <span>
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <strong>{title}</strong>
        </span>
      </button>
      {isOpen ? <div className="public-editor-section-body">{children}</div> : null}
    </section>
  )
}

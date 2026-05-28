import { useState } from 'react'
import { ChevronDown, ChevronRight, Clock, Eye, MessageCircle, MonitorPlay, Palette, Plus, Save, Settings, Users } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { appConfig } from '../../config/app'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useUsers } from '../../hooks/useUsers'
import { saveUserProfile } from '../../services/userService'
import type { UserRole } from '../../types'

const roleOptions: Array<{ label: string; value: UserRole; detail: string }> = [
  { detail: 'Acceso total al sistema, usuarios y configuración.', label: 'Dueño / Administrador', value: 'admin' },
  { detail: 'Acceso a operación y finanzas, sin administración de usuarios.', label: 'Socio', value: 'socio' },
  { detail: 'Reservas, tareas y gastos asociados a eventos.', label: 'Encargado de eventos', value: 'encargado_eventos' },
  { detail: 'Ingresos, visitas activas y cobros de salida.', label: 'Recepción', value: 'recepcion' },
  { detail: 'Cuentas, productos y cobros de cantina.', label: 'Cantina', value: 'cantina' },
]

const emptyForm = { displayName: '', email: '', isActive: true, role: 'recepcion' as UserRole, uid: '' }

export function AdminSettingsPage() {
  const { permissions } = useUserProfile()
  const usersResult = useUsers(permissions.canManageUsers)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingUser, setIsEditingUser] = useState(false)
  const [detailUid, setDetailUid] = useState<string | null>(null)
  const [isUsersOpen, setIsUsersOpen] = useState(false)

  const saveUser = async () => {
    setMessage(null)
    setIsSaving(true)
    try {
      await saveUserProfile(form)
      setMessage('Funcionario vinculado correctamente. La sesión del administrador sigue activa.')
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
        title="Configuración"
        description="Datos base, parámetros del parque y administración de usuarios."
        action={
          <button className="button primary" onClick={() => window.alert('Los datos comerciales se mantienen en configuración local por ahora.')} type="button">
            <Save size={18} />
            Guardar ajustes
          </button>
        }
      />
      <div className="settings-grid">
        <article className="panel">
          <h2 className="panel-title">
            <Settings color="var(--orange)" />
            Datos del parque
          </h2>
          <form className="form-grid" style={{ marginTop: 18 }}>
            <label className="field">
              <span>Nombre comercial</span>
              <input defaultValue="Lucca Park" />
            </label>
            <label className="field">
              <span>Dirección</span>
              <input defaultValue={appConfig.address} />
            </label>
          </form>
        </article>
        <article className="panel">
          <h2 className="panel-title">
            <MessageCircle color="var(--green)" />
            WhatsApp
          </h2>
          <form className="form-grid" style={{ marginTop: 18 }}>
            <label className="field">
              <span>Número</span>
              <input defaultValue={appConfig.whatsappNumber} />
            </label>
            <label className="field">
              <span>Mensaje por defecto</span>
              <textarea defaultValue="Hola, quiero consultar disponibilidad para un cumple." rows={3} />
            </label>
          </form>
        </article>
        <article className="panel">
          <h2 className="panel-title">
            <Clock color="var(--turquoise)" />
            Horarios y planes
          </h2>
          <ul className="task-list" style={{ marginTop: 18 }}>
            <li>Plan 1 hora</li>
            <li>Plan 2 horas</li>
            <li>Plan libre</li>
            <li>Horarios de eventos configurables</li>
          </ul>
        </article>
        <article className="panel">
          <h2 className="panel-title">
            <MonitorPlay color="var(--yellow)" />
            TV y visual
          </h2>
          <ul className="task-list" style={{ marginTop: 18 }}>
            <li>Modo normal con temporizadores</li>
            <li>Modo evento con imagen full screen</li>
            <li>Configuración simple por evento</li>
            <li><Palette size={16} /> Colores base Lucca Park</li>
          </ul>
        </article>
      </div>

      {permissions.canManageUsers ? (
        <article className="panel users-permissions-panel">
          <button className="finance-collapsible-header" onClick={() => setIsUsersOpen((current) => !current)} type="button">
            <span className="finance-collapsible-title">
              {isUsersOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
              <Users color="var(--orange)" size={20} />
              <span>
                <strong>Usuarios y permisos</strong>
                <small>Administrá quién puede acceder al sistema y qué puede realizar.</small>
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
          <details className="user-help-box">
            <summary>¿Cómo crear un usuario?</summary>
            <ol>
              <li>Crear la cuenta en Firebase Authentication.</li>
              <li>Copiar el UID.</li>
              <li>Volver aquí y presionar Agregar usuario.</li>
              <li>Cargar UID, nombre, email y rol.</li>
              <li>Guardar. El funcionario podrá iniciar sesión desde su dispositivo.</li>
            </ol>
          </details>
          {message ? <div className={message.includes('No se') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}
          {usersResult.error ? <div className="form-alert error">No se pudieron cargar usuarios: {usersResult.error}</div> : null}
          <div className="user-permission-grid">
            <div className="module-list">
              {usersResult.isLoading ? <div className="empty-state">Cargando usuarios...</div> : null}
              {!usersResult.isLoading && usersResult.users.length === 0 ? <div className="empty-state">Todavía no hay funcionarios vinculados.</div> : null}
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
                <p className="eyebrow">{form.uid ? 'Editar usuario' : 'Nuevo vínculo'}</p>
                <h3>{form.displayName || 'Usuario del sistema'}</h3>
              </div>
              {!isEditingUser ? <div className="empty-state">Seleccioná un usuario o tocá Agregar usuario.</div> : null}
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
                    <summary>Configuración técnica</summary>
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
    </>
  )
}

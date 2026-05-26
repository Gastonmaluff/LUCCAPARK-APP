import { useState } from 'react'
import { Clock, MessageCircle, MonitorPlay, Palette, Save, Settings, Users } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { appConfig } from '../../config/app'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useUsers } from '../../hooks/useUsers'
import { saveUserProfile } from '../../services/userService'
import type { UserRole } from '../../types'

const roleOptions: Array<{ label: string; value: UserRole; detail: string }> = [
  { detail: 'Acceso total.', label: 'Dueno / Administrador', value: 'admin' },
  { detail: 'Operacion y finanzas, sin usuarios.', label: 'Socio', value: 'socio' },
  { detail: 'Reservas, tareas y gastos asociados.', label: 'Encargado de eventos', value: 'encargado_eventos' },
  { detail: 'Ingresos, visitas y cobros de salida.', label: 'Recepcion', value: 'recepcion' },
  { detail: 'Cantina, cuentas, productos y cobros.', label: 'Cantina', value: 'cantina' },
]

export function AdminSettingsPage() {
  const { permissions } = useUserProfile()
  const usersResult = useUsers(permissions.canManageUsers)
  const [form, setForm] = useState({ displayName: '', email: '', isActive: true, role: 'recepcion' as UserRole, uid: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const saveUser = async () => {
    setMessage(null)
    setIsSaving(true)
    try {
      await saveUserProfile(form)
      setMessage('Usuario guardado correctamente.')
      setForm({ displayName: '', email: '', isActive: true, role: 'recepcion', uid: '' })
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
        description="Datos base, parametros del parque y administracion de usuarios."
        action={
          <button className="button primary" onClick={() => window.alert('Los datos comerciales se mantienen en configuracion local por ahora.')} type="button">
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
              <span>Direccion</span>
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
              <span>Numero</span>
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
            <li>Configuracion simple por evento</li>
            <li><Palette size={16} /> Colores base Lucca Park</li>
          </ul>
        </article>
      </div>

      {permissions.canManageUsers ? (
        <article className="panel users-permissions-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Users color="var(--orange)" />
              Usuarios y permisos
            </h2>
            <StatusPill tone="available">Solo admin</StatusPill>
          </div>
          {message ? <div className={message.includes('No se') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}
          {usersResult.error ? <div className="form-alert error">No se pudieron cargar usuarios: {usersResult.error}</div> : null}
          <div className="user-permission-grid">
            <div className="module-list">
              {usersResult.isLoading ? <div className="empty-state">Cargando usuarios...</div> : null}
              {usersResult.users.map((user) => (
                <button
                  className="module-row user-row-button"
                  key={user.uid}
                  onClick={() => setForm({ displayName: user.displayName, email: user.email, isActive: user.isActive, role: user.role, uid: user.uid })}
                  type="button"
                >
                  <span>
                    <strong>{user.displayName}</strong>
                    <small>{user.email || user.uid}</small>
                  </span>
                  <StatusPill tone={user.isActive ? 'available' : 'blocked'}>{user.isActive ? 'Activo' : 'Inactivo'}</StatusPill>
                  <StatusPill tone="info">{roleOptions.find((role) => role.value === user.role)?.label ?? user.role}</StatusPill>
                </button>
              ))}
            </div>
            <div className="user-editor">
              <label className="field">
                <span>UID real</span>
                <input onChange={(event) => setForm((current) => ({ ...current, uid: event.target.value }))} value={form.uid} />
              </label>
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
              <label className="checkbox-option">
                <input checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
                Usuario activo
              </label>
              <div className="role-detail-list">
                {roleOptions.map((role) => (
                  <span key={role.value}><strong>{role.label}</strong>{role.detail}</span>
                ))}
              </div>
              <button className="button primary" disabled={isSaving} onClick={saveUser} type="button">
                {isSaving ? 'Guardando...' : 'Guardar usuario'}
              </button>
            </div>
          </div>
        </article>
      ) : null}
    </>
  )
}

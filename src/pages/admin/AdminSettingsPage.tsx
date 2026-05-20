import { Clock, MessageCircle, MonitorPlay, Palette, Save, Settings } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { appConfig } from '../../config/app'

export function AdminSettingsPage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Sistema"
        title="Configuracion"
        description="Datos base del parque y parametros editables que luego iran a Firestore."
        action={
          <button
            className="button primary"
            onClick={() => window.alert('Configuracion demo. Luego se guardara en la coleccion settings.')}
            type="button"
          >
            <Save size={18} />
            Guardar demo
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
            <li>Modo evento con banner</li>
            <li>Mostrar u ocultar contador de invitados</li>
            <li>
              <Palette size={16} /> Colores base Lucca Park
            </li>
          </ul>
        </article>
      </div>
    </>
  )
}

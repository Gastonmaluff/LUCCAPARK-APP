import { Baby, ClipboardList, ExternalLink, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { demoEvents, demoVisits } from '../../data/demoData'

export function AdminReceptionPage() {
  const [mode, setMode] = useState<'visit' | 'event'>('visit')
  const activeEvent = demoEvents[0]

  return (
    <>
      <AdminModuleHeader
        eyebrow="Operacion"
        title="Recepcion administrativa"
        description="Control demo desde admin. El portal rapido de la recepcionista vive separado en /recepcion."
        action={
          <Link className="button primary" to="/recepcion">
            <ExternalLink size={18} />
            Abrir portal rapido
          </Link>
        }
      />

      <div className="reception-grid">
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <ClipboardList color="var(--orange)" />
              Modo de registro
            </h2>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Modo admin recepcion">
            <button className={mode === 'visit' ? 'active' : ''} type="button" onClick={() => setMode('visit')}>
              Visita normal
            </button>
            <button className={mode === 'event' ? 'active' : ''} type="button" onClick={() => setMode('event')}>
              Evento privado
            </button>
          </div>
          <form className="form-grid" style={{ marginTop: 18 }}>
            <label className="field">
              <span>Nombre del nino</span>
              <input placeholder="Ej. Mateo Rios" />
            </label>
            <label className="field">
              <span>Responsable</span>
              <input placeholder="Nombre del responsable" />
            </label>
            {mode === 'visit' ? (
              <label className="field">
                <span>Plan</span>
                <select>
                  <option>1 hora</option>
                  <option>2 horas</option>
                  <option>Libre</option>
                </select>
              </label>
            ) : (
              <label className="field">
                <span>Evento activo</span>
                <select>
                  <option>{activeEvent.name}</option>
                </select>
              </label>
            )}
            <button
              className="button primary"
              onClick={() => window.alert('Registro demo. En Fase 2 se guardara en Firestore.')}
              type="button"
            >
              <Plus size={18} />
              Guardar demo
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              {mode === 'visit' ? <Baby color="var(--green)" /> : <Users color="var(--turquoise)" />}
              {mode === 'visit' ? 'Visitas activas' : activeEvent.name}
            </h2>
            <StatusPill tone="info">{mode === 'visit' ? 'Con temporizador' : 'Sin temporizador'}</StatusPill>
          </div>
          {mode === 'visit' ? (
            <div className="visit-list">
              {demoVisits.map((visit) => (
                <div className="visit-card visit-row" key={visit.childName}>
                  <strong>{visit.childName}</strong>
                  <span className={`timer ${visit.tone}`}>{visit.remaining}</span>
                  <StatusPill tone={visit.paymentStatus === 'paid' ? 'paid' : visit.paymentStatus === 'payAtExit' ? 'warning' : 'danger'}>
                    {visit.paymentStatus === 'paid' ? 'Pagado' : visit.paymentStatus === 'payAtExit' ? 'Paga al salir' : 'Pendiente'}
                  </StatusPill>
                </div>
              ))}
            </div>
          ) : (
            <div className="event-card">
              <div>
                <strong>{activeEvent.client}</strong>
                <p className="muted">
                  {activeEvent.date} - {activeEvent.time}
                </p>
                <div className="progress">
                  <span style={{ width: '95%' }} />
                </div>
              </div>
              <StatusPill tone="warning">
                {activeEvent.checkedIn} / {activeEvent.capacity}
              </StatusPill>
            </div>
          )}
        </article>
      </div>
    </>
  )
}

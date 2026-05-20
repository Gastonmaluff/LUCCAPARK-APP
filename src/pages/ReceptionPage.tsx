import { Baby, CalendarCheck, ClipboardList, CreditCard, Plus, RefreshCw, Users } from 'lucide-react'
import { useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { MetricCard } from '../components/MetricCard'
import { StatusPill } from '../components/StatusPill'
import { demoEvents, demoVisits } from '../data/demoData'

export function ReceptionPage() {
  const [mode, setMode] = useState<'visit' | 'event'>('visit')
  const activeEvent = demoEvents[0]
  const overCapacity = Math.max(0, activeEvent.checkedIn - activeEvent.capacity)

  return (
    <main className="internal-page">
      <section className="internal-shell">
        <header className="admin-topbar">
          <BrandLogo className="compact" />
          <div className="mode-switch" role="tablist" aria-label="Modo de recepcion">
            <button className={mode === 'visit' ? 'active' : ''} type="button" onClick={() => setMode('visit')}>
              Visita normal
            </button>
            <button className={mode === 'event' ? 'active' : ''} type="button" onClick={() => setMode('event')}>
              Evento privado
            </button>
          </div>
          <button className="button ghost" type="button">
            <RefreshCw size={17} />
            Actualizar
          </button>
        </header>

        <div className="metric-grid">
          <MetricCard label="Ninos dentro ahora" value="28" detail="/ 120 capacidad" icon={<Baby />} color="var(--green)" />
          <MetricCard label="Pagos pendientes" value="5" detail="visitas activas" icon={<CreditCard />} color="var(--orange)" />
          <MetricCard label="Salidas proximas" value="3" detail="en 10 minutos" icon={<CalendarCheck />} color="var(--yellow)" />
          <MetricCard label="Evento activo" value={mode === 'event' ? '38/40' : 'No'} detail="control de cupo" icon={<Users />} color="var(--turquoise)" />
        </div>

        <div className="reception-grid">
          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <ClipboardList color="var(--orange)" />
                {mode === 'visit' ? 'Registrar ingreso' : 'Registrar invitado'}
              </h2>
            </div>
            <form className="form-grid">
              {mode === 'event' ? (
                <label className="field">
                  <span>Evento activo del dia</span>
                  <select>
                    <option>{activeEvent.name}</option>
                  </select>
                </label>
              ) : null}
              <label className="field">
                <span>Nombre del nino</span>
                <input placeholder="Ej. Mateo Rios" />
              </label>
              <label className="field">
                <span>Responsable</span>
                <input placeholder="Nombre del responsable" />
              </label>
              <label className="field">
                <span>Telefono</span>
                <input placeholder="Ej. 0981 000 000" />
              </label>
              <label className="field">
                <span>Edad o rango</span>
                <select>
                  <option>Seleccionar edad</option>
                  <option>2 a 4 anos</option>
                  <option>5 a 8 anos</option>
                  <option>9 anos o mas</option>
                </select>
              </label>
              {mode === 'visit' ? (
                <>
                  <label className="field">
                    <span>Plan contratado</span>
                    <select>
                      <option>1 hora</option>
                      <option>2 horas</option>
                      <option>Libre</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Estado de pago</span>
                    <select>
                      <option>Pagado al ingresar</option>
                      <option>Paga al salir</option>
                      <option>Pendiente</option>
                    </select>
                  </label>
                </>
              ) : null}
              <label className="field">
                <span>Observaciones</span>
                <textarea placeholder="Agregar alguna observacion..." rows={3} />
              </label>
              <button className="button primary" type="button">
                <Plus size={18} />
                {mode === 'visit' ? 'Registrar ingreso' : 'Registrar invitado'}
              </button>
            </form>
          </article>

          <article className="panel">
            {mode === 'visit' ? (
              <>
                <div className="panel-header">
                  <h2 className="panel-title">
                    <Baby color="var(--orange)" />
                    Visitas activas
                  </h2>
                  <StatusPill tone="info">Modo temporizador</StatusPill>
                </div>
                <div className="visit-list">
                  {demoVisits.map((visit) => (
                    <div className="visit-card visit-row" key={visit.childName}>
                      <div className="visit-name">
                        <span className="avatar">
                          <Baby />
                        </span>
                        <div>
                          <strong>{visit.childName}</strong>
                          <p className="muted">{visit.responsible}</p>
                        </div>
                      </div>
                      <div>
                        <p className="muted">Ingreso</p>
                        <strong>{visit.checkIn}</strong>
                      </div>
                      <div>
                        <p className="muted">Tiempo restante</p>
                        <strong className={`timer ${visit.tone}`}>{visit.remaining}</strong>
                      </div>
                      <StatusPill tone={visit.paymentStatus === 'paid' ? 'paid' : visit.paymentStatus === 'payAtExit' ? 'warning' : 'danger'}>
                        {visit.paymentStatus === 'paid' ? 'Pagado' : visit.paymentStatus === 'payAtExit' ? 'Paga al salir' : 'Pendiente'}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="panel-header">
                  <h2 className="panel-title">
                    <Users color="var(--turquoise)" />
                    {activeEvent.name}
                  </h2>
                  <StatusPill tone={overCapacity > 0 ? 'danger' : activeEvent.checkedIn >= activeEvent.capacity ? 'warning' : 'available'}>
                    {activeEvent.checkedIn} / {activeEvent.capacity} ninos
                  </StatusPill>
                </div>
                <div className="event-card">
                  <div>
                    <strong>{activeEvent.client}</strong>
                    <p className="muted">
                      {activeEvent.date} · {activeEvent.time}
                    </p>
                    <div className="progress">
                      <span style={{ width: `${Math.min(100, (activeEvent.checkedIn / activeEvent.capacity) * 100)}%` }} />
                    </div>
                  </div>
                  <StatusPill tone="info">Sin temporizador individual</StatusPill>
                </div>
                <div className="empty-state" style={{ marginTop: 14 }}>
                  {overCapacity > 0
                    ? 'Se supero el cupo contratado. Revisar cobro adicional.'
                    : 'Al alcanzar o superar el cupo se mostrara una alerta para cobro adicional.'}
                </div>
              </>
            )}
          </article>
        </div>
      </section>
    </main>
  )
}

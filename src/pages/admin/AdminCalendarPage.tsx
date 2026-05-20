import { CalendarPlus, Info } from 'lucide-react'
import { useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { demoCalendarDays, demoEvents } from '../../data/demoData'
import type { CalendarDay } from '../../types'

const labels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

const statusLabel = {
  available: 'Disponible',
  reserved: 'Reservado',
  blocked: 'Evento privado',
  consult: 'Consultar',
} as const

export function AdminCalendarPage() {
  const [selectedDay, setSelectedDay] = useState<CalendarDay>(demoCalendarDays.find((day) => day.status) ?? demoCalendarDays[0])
  const selectedStatus = selectedDay.status ? statusLabel[selectedDay.status] : 'Sin eventos'

  return (
    <>
      <AdminModuleHeader
        eyebrow="Agenda"
        title="Calendario administrativo"
        description="Calendario visual preparado para reservas, bloqueos y eventos privados."
        action={
          <button
            className="button primary"
            onClick={() => window.alert('Crear evento demo. Luego abrira el formulario real de reserva.')}
            type="button"
          >
            <CalendarPlus size={18} />
            Crear evento
          </button>
        }
      />
      <div className="availability-layout">
        <article className="availability-card calendar">
          <div className="calendar-top">
            <button
              className="button ghost"
              onClick={() => window.alert('Cambio de mes demo. Luego se cargaran meses reales.')}
              type="button"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <strong>Mayo 2025</strong>
            <button
              className="button ghost"
              onClick={() => window.alert('Cambio de mes demo. Luego se cargaran meses reales.')}
              type="button"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>
          <div className="calendar-grid" aria-label="Calendario administrativo demo">
            {labels.map((label) => (
              <strong className="calendar-cell" key={label}>
                {label}
              </strong>
            ))}
            {demoCalendarDays.map((date, index) => (
              <button
                className={[
                  'calendar-cell',
                  'calendar-button',
                  date.faded ? 'faded' : '',
                  date.status ? `status-${date.status}` : '',
                  selectedDay.day === date.day && selectedDay.status === date.status ? 'selected' : '',
                ].join(' ')}
                key={`${date.day}-${index}`}
                onClick={() => setSelectedDay(date)}
                type="button"
              >
                {date.day}
              </button>
            ))}
          </div>
        </article>
        <aside className="side-stack">
          <article className="availability-card">
            <p className="eyebrow">Dia seleccionado</p>
            <h3>{selectedDay.day} de mayo</h3>
            <StatusPill tone={selectedDay.status === 'available' ? 'available' : selectedDay.status === 'reserved' ? 'reserved' : selectedDay.status === 'blocked' ? 'blocked' : 'info'}>
              {selectedStatus}
            </StatusPill>
            <p className="muted">
              {selectedDay.status
                ? 'Informacion demo lista para reemplazar por eventos de Firestore.'
                : 'No hay reservas cargadas para este dia demo.'}
            </p>
          </article>
          <article className="availability-card">
            <p className="eyebrow">
              <Info size={16} /> Evento relacionado
            </p>
            <h3>{demoEvents[0].name}</h3>
            <p className="muted">
              {demoEvents[0].client} - {demoEvents[0].time}
            </p>
            <div className="progress">
              <span style={{ width: '95%' }} />
            </div>
            <p className="muted">
              {demoEvents[0].checkedIn} / {demoEvents[0].capacity} invitados registrados
            </p>
          </article>
        </aside>
      </div>
    </>
  )
}

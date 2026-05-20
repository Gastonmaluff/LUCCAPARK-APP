import { demoCalendarDays } from '../data/demoData'

const labels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export function CalendarPreview() {
  return (
    <article className="availability-card calendar">
      <div className="calendar-top">
        <button
          className="button ghost"
          onClick={() => window.alert('Cambio de mes demo. Luego se cargaran meses desde Firestore.')}
          type="button"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <strong>Mayo 2025</strong>
        <button
          className="button ghost"
          onClick={() => window.alert('Cambio de mes demo. Luego se cargaran meses desde Firestore.')}
          type="button"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>
      <div className="calendar-grid" aria-label="Calendario demo de disponibilidad">
        {labels.map((label) => (
          <strong className="calendar-cell" key={label}>
            {label}
          </strong>
        ))}
        {demoCalendarDays.map((date, index) => (
          <span
            className={[
              'calendar-cell',
              date.faded ? 'faded' : '',
              date.status ? `status-${date.status}` : '',
            ].join(' ')}
            key={`${date.day}-${index}`}
          >
            {date.day}
          </span>
        ))}
      </div>
      <div className="calendar-legend">
        <span className="legend-item">
          <i className="legend-dot" style={{ background: 'var(--green)' }} /> Disponible
        </span>
        <span className="legend-item">
          <i className="legend-dot" style={{ background: 'var(--orange)' }} /> Reservado
        </span>
        <span className="legend-item">
          <i className="legend-dot" style={{ background: 'var(--red)' }} /> Evento privado
        </span>
        <span className="legend-item">
          <i className="legend-dot" style={{ background: 'var(--turquoise)' }} /> Consultar
        </span>
      </div>
    </article>
  )
}

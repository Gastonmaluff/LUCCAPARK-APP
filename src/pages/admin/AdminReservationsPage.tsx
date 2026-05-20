import { CalendarPlus, Filter } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { demoReservations } from '../../data/demoData'

const statusTone = {
  consulta: 'info',
  reservado: 'reserved',
  confirmado: 'available',
  cancelado: 'danger',
} as const

export function AdminReservationsPage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Eventos"
        title="Reservas"
        description="Listado base para consultas, reservas, senas y estados de eventos."
        action={
          <button
            className="button primary"
            onClick={() => window.alert('Nueva reserva demo. El formulario real se implementara con Firestore.')}
            type="button"
          >
            <CalendarPlus size={18} />
            Nueva reserva
          </button>
        }
      />
      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <Filter color="var(--turquoise)" />
            Reservas demo
          </h2>
          <StatusPill tone="info">Datos temporales</StatusPill>
        </div>
        <div className="module-list">
          {demoReservations.map((reservation) => (
            <div className="module-row" key={reservation.id}>
              <div>
                <strong>{reservation.childName}</strong>
                <p className="muted">
                  {reservation.client} - {reservation.date} - {reservation.time}
                </p>
              </div>
              <span>{reservation.packageName}</span>
              <StatusPill tone={statusTone[reservation.status]}>{reservation.status}</StatusPill>
            </div>
          ))}
        </div>
      </article>
    </>
  )
}

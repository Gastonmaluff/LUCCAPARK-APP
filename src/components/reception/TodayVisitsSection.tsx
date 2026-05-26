import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { StatusPill } from '../StatusPill'
import { useTodayVisits } from '../../hooks/useTodayVisits'
import { formatShortTime } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import type { CanteenOrder } from '../../types'

export function TodayVisitsSection({ canteenOrders = [] }: { canteenOrders?: CanteenOrder[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const { error, isLoading, visits } = useTodayVisits()
  const collectedToday = visits.reduce((sum, visit) => {
    const parkPaid = visit.paymentStatus === 'paid' ? visit.amountCharged ?? visit.defaultAmount ?? 0 : 0
    const canteenPaid = canteenOrders
      .filter((order) => order.visitId === visit.id && order.status === 'paid')
      .reduce((orderSum, order) => orderSum + order.total, 0)
    return sum + parkPaid + canteenPaid
  }, 0)

  return (
    <article className="panel today-visits-panel">
      <button className="collapsible-header" onClick={() => setIsOpen((current) => !current)} type="button">
        <span className="today-visits-title">
          <span className="today-visits-icon"><CalendarDays size={18} /></span>
          <span>
            <strong>Visitas de hoy</strong>
            <small>Al tocar, desplegar historial del dia</small>
          </span>
        </span>
        <span className="today-visits-summary">
          <StatusPill tone="info">{visits.length} registros</StatusPill>
          <StatusPill tone="available">{formatGuarani(collectedToday)} cobrados</StatusPill>
          {isOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
        </span>
      </button>

      {isOpen ? (
        <div className="today-visits-body">
          {isLoading ? <div className="empty-state">Cargando visitas del dia...</div> : null}
          {error ? <div className="form-alert error">No se pudieron cargar visitas de hoy: {error}</div> : null}
          {!isLoading && !error && visits.length === 0 ? <div className="empty-state">Todavia no hay visitas registradas hoy.</div> : null}
          <div className="module-list">
            {visits.map((visit) => (
              <div className="module-row today-visit-row" key={visit.id}>
                <div>
                  <strong>{visit.childName}</strong>
                  <p className="muted">{visit.customerName}</p>
                </div>
                <span>
                  Entrada <strong>{formatShortTime(visit.startedAt)}</strong>
                </span>
                <span>
                  Salida <strong>{formatShortTime(visit.endedAt)}</strong>
                </span>
                <span>{visit.planName}</span>
                <strong>{visit.amountCharged ?? visit.defaultAmount ? formatGuarani(visit.amountCharged ?? visit.defaultAmount ?? 0) : 'Sin monto'}</strong>
                <StatusPill tone={visit.paymentStatus === 'paid' ? 'available' : 'warning'}>
                  {visit.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                </StatusPill>
                <StatusPill tone={visit.status === 'finished' ? 'info' : 'available'}>
                  {visit.status === 'finished' ? 'Finalizada' : 'Activa'}
                </StatusPill>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

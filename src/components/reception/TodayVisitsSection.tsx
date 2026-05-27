import { CalendarDays, ChevronDown, ChevronRight, Eye, X } from 'lucide-react'
import { useState } from 'react'
import { StatusPill } from '../StatusPill'
import { useTodayVisits } from '../../hooks/useTodayVisits'
import { formatShortTime } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import { getRealDurationMinutes } from '../../utils/visitTime'
import type { CanteenOrder, PaymentMethod } from '../../types'
import type { TodayVisitRecord } from '../../hooks/useTodayVisits'

const paymentMethodLabel = (method?: PaymentMethod) => {
  if (method === 'cash') return 'Efectivo'
  if (method === 'transfer') return 'Transferencia'
  if (method === 'qr') return 'QR'
  if (method === 'card') return 'Tarjeta'
  if (method === 'other') return 'Otro'
  return 'Sin método'
}

const formatDuration = (visit: TodayVisitRecord) => {
  const minutes = visit.endedAt ? getRealDurationMinutes(visit.startedAt, visit.endedAt) : visit.durationMinutes ?? 0
  if (!minutes) return 'Sin duración'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function TodayVisitsSection({ canteenOrders = [] }: { canteenOrders?: CanteenOrder[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedVisit, setSelectedVisit] = useState<TodayVisitRecord | null>(null)
  const { error, isLoading, visits } = useTodayVisits()
  const finishedVisits = visits.filter((visit) => visit.status === 'finished')
  const collectedToday = finishedVisits.reduce((sum, visit) => {
    const parkPaid = visit.paymentStatus === 'paid' ? visit.amountCharged ?? visit.defaultAmount ?? 0 : 0
    const canteenPaid = canteenOrders
      .filter((order) => order.visitId === visit.id && order.status === 'paid')
      .reduce((orderSum, order) => orderSum + order.total, 0)
    return sum + parkPaid + canteenPaid
  }, 0)

  return (
    <article className="panel today-visits-panel">
      <button className="today-visits-header" onClick={() => setIsOpen((current) => !current)} type="button">
        <span className="today-visits-title">
          <span className="today-visits-icon"><CalendarDays size={18} /></span>
          <span>
            <strong>Visitas de hoy</strong>
            <small>Historial de ingresos finalizados durante la jornada</small>
          </span>
        </span>
        <span className="today-visits-summary">
          <StatusPill tone="info">{finishedVisits.length} registros</StatusPill>
          <StatusPill tone="available">{formatGuarani(collectedToday)} cobrados</StatusPill>
          {isOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
        </span>
      </button>

      {isOpen ? (
        <div className="today-visits-body">
          {isLoading ? <div className="empty-state">Cargando visitas del dia...</div> : null}
          {error ? <div className="form-alert error">No se pudieron cargar visitas de hoy: {error}</div> : null}
          {!isLoading && !error && finishedVisits.length === 0 ? <div className="empty-state">Todavía no hay visitas finalizadas hoy.</div> : null}
          <div className="today-visits-list">
            {finishedVisits.map((visit) => (
              <div className="today-visit-row" key={visit.id}>
                <div>
                  <strong>{visit.childName}</strong>
                  <p className="muted">{visit.customerName}</p>
                </div>
                <span><small>Ingreso</small><strong>{formatShortTime(visit.startedAt)}</strong></span>
                <span><small>Salida</small><strong>{formatShortTime(visit.endedAt)}</strong></span>
                <span><small>Duración</small><strong>{formatDuration(visit)}</strong></span>
                <strong>{visit.amountCharged ?? visit.defaultAmount ? formatGuarani(visit.amountCharged ?? visit.defaultAmount ?? 0) : 'Sin monto'}</strong>
                <StatusPill tone={visit.paymentStatus === 'paid' ? 'available' : 'warning'}>{paymentMethodLabel(visit.paymentMethod)}</StatusPill>
                <button className="button ghost small-button" onClick={() => setSelectedVisit(visit)} type="button">
                  <Eye size={15} />
                  Ver detalle
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {selectedVisit ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card closed-order-detail-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Visita finalizada</p>
                <h2>{selectedVisit.childName}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelectedVisit(null)} type="button" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="checkout-detail-list">
              <div className="checkout-line"><span>Responsable</span><strong>{selectedVisit.customerName}</strong></div>
              <div className="checkout-line"><span>Ingreso</span><strong>{formatShortTime(selectedVisit.startedAt)}</strong></div>
              <div className="checkout-line"><span>Salida</span><strong>{formatShortTime(selectedVisit.endedAt)}</strong></div>
              <div className="checkout-line"><span>Duración</span><strong>{formatDuration(selectedVisit)}</strong></div>
              <div className="checkout-line"><span>Plan</span><strong>{selectedVisit.planName}</strong></div>
              <div className="checkout-line"><span>Método</span><strong>{paymentMethodLabel(selectedVisit.paymentMethod)}</strong></div>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  )
}

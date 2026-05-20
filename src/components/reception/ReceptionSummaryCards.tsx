import { AlertTriangle, Baby, Clock, CreditCard } from 'lucide-react'
import type { ActiveVisit } from '../../types'
import { getVisitTimeStatus } from '../../utils/visitTime'

interface ReceptionSummaryCardsProps {
  visits: ActiveVisit[]
  now: Date
}

export function ReceptionSummaryCards({ now, visits }: ReceptionSummaryCardsProps) {
  const childrenInside = visits.reduce((total, visit) => total + visit.childrenCount, 0)
  const pendingPayments = visits.filter((visit) => visit.paymentStatus !== 'paid').length
  const upcoming = visits.filter((visit) => getVisitTimeStatus(visit, now) === 'warning').length
  const expired = visits.filter((visit) => getVisitTimeStatus(visit, now) === 'expired').length

  return (
    <div className="reception-summary-grid">
      <article className="summary-card">
        <Baby color="var(--green)" />
        <div>
          <strong>{childrenInside}</strong>
          <span>Ninos dentro ahora</span>
        </div>
      </article>
      <article className="summary-card">
        <CreditCard color="var(--orange)" />
        <div>
          <strong>{pendingPayments}</strong>
          <span>Pagos pendientes</span>
        </div>
      </article>
      <article className="summary-card">
        <Clock color="var(--yellow)" />
        <div>
          <strong>{upcoming}</strong>
          <span>Salidas proximas</span>
        </div>
      </article>
      <article className="summary-card">
        <AlertTriangle color="var(--red)" />
        <div>
          <strong>{expired}</strong>
          <span>Vencidos</span>
        </div>
      </article>
    </div>
  )
}

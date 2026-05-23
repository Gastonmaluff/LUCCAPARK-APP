import { AlertTriangle, Baby, Clock, CreditCard } from 'lucide-react'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { formatGuarani } from '../../utils/money'
import { getVisitBillingSummary } from '../../utils/visitBilling'
import { getVisitTimeStatus } from '../../utils/visitTime'

interface ReceptionSummaryCardsProps {
  visits: ActiveVisit[]
  canteenOrders?: CanteenOrder[]
  now: Date
}

export function ReceptionSummaryCards({ canteenOrders = [], now, visits }: ReceptionSummaryCardsProps) {
  const childrenInside = visits.reduce((total, visit) => total + visit.childrenCount, 0)
  const pendingAmount = visits.reduce((sum, visit) => sum + getVisitBillingSummary(visit, canteenOrders).totalPendingAmount, 0)
  const upcoming = visits.filter((visit) => getVisitTimeStatus(visit, now) === 'warning').length
  const expired = visits.filter((visit) => getVisitTimeStatus(visit, now) === 'expired').length

  return (
    <div className="reception-summary-grid">
      <article className="summary-card compact green">
        <Baby color="var(--green)" />
        <div>
          <strong>{childrenInside}</strong>
          <span>Dentro ahora</span>
        </div>
      </article>
      <article className="summary-card compact orange">
        <CreditCard color="var(--orange)" />
        <div>
          <strong>{formatGuarani(pendingAmount)}</strong>
          <span>Pendiente de cobro</span>
        </div>
      </article>
      <article className="summary-card compact yellow">
        <Clock color="var(--yellow)" />
        <div>
          <strong>{upcoming}</strong>
          <span>Salen pronto</span>
        </div>
      </article>
      <article className="summary-card compact red">
        <AlertTriangle color="var(--red)" />
        <div>
          <strong>{expired}</strong>
          <span>Vencidos</span>
        </div>
      </article>
    </div>
  )
}

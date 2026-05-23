import { Baby } from 'lucide-react'
import { useState } from 'react'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { getVisitBillingSummary } from '../../utils/visitBilling'
import { getVisitTimeStatus } from '../../utils/visitTime'
import { VisitCard } from './VisitCard'
import { VisitConsumptionPanel } from './VisitConsumptionPanel'

interface ActiveVisitsListProps {
  visits: ActiveVisit[]
  isLoading: boolean
  error: string | null
  canteenOrders?: CanteenOrder[]
  canteenPath?: string
  now: Date
}

export function ActiveVisitsList({ canteenOrders = [], canteenPath = '/admin/cantina', error, isLoading, now, visits }: ActiveVisitsListProps) {
  const [openConsumptionVisitId, setOpenConsumptionVisitId] = useState<string | null>(null)
  const sortedVisits = [...visits].sort((a, b) => {
    const aStatus = getVisitTimeStatus(a, now)
    const bStatus = getVisitTimeStatus(b, now)
    const aBilling = getVisitBillingSummary(a, canteenOrders)
    const bBilling = getVisitBillingSummary(b, canteenOrders)
    const priority = (status: string, hasDebt: boolean) => {
      if (status === 'expired' && hasDebt) return 0
      if (status === 'warning') return 1
      if (status === 'expired') return 2
      if (status === 'unlimited') return 4
      return 3
    }
    return (
      priority(aStatus, aBilling.totalPendingAmount > 0) -
        priority(bStatus, bBilling.totalPendingAmount > 0) ||
      a.startedAt.getTime() - b.startedAt.getTime()
    )
  })

  if (isLoading) {
    return <div className="empty-state">Cargando visitas activas...</div>
  }

  if (error) {
    return <div className="form-alert error">No se pudieron cargar las visitas: {error}</div>
  }

  if (visits.length === 0) {
    return (
      <div className="empty-state empty-with-icon">
        <Baby color="var(--turquoise)" />
        <strong>No hay visitas activas en este momento</strong>
        <span>Cuando registres un ingreso, aparece aca y tambien en la TV.</span>
      </div>
    )
  }

  return (
    <div className="visit-list">
      {sortedVisits.map((visit) => (
        <div className="visit-card-group" key={visit.id}>
          <VisitCard
            canteenOrders={canteenOrders.filter((order) => order.visitId === visit.id)}
            now={now}
            onOpenConsumption={() => setOpenConsumptionVisitId((current) => (current === visit.id ? null : visit.id))}
            visit={visit}
          />
          {openConsumptionVisitId === visit.id ? (
            <VisitConsumptionPanel
              canteenPath={canteenPath}
              orders={canteenOrders.filter((order) => order.visitId === visit.id)}
              visit={visit}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

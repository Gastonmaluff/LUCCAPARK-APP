import { Baby } from 'lucide-react'
import { useState } from 'react'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { getVisitBillingSummary, getVisitGroupBillingSummary } from '../../utils/visitBilling'
import { getOrdersForVisit, getOrdersForVisitGroup, groupActiveVisits } from '../../utils/visitGroups'
import { getVisitTimeStatus } from '../../utils/visitTime'
import { VisitCard } from './VisitCard'
import { VisitConsumptionPanel } from './VisitConsumptionPanel'
import { VisitGroupCard } from './VisitGroupCard'

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
  const visitGroups = groupActiveVisits(visits)
  const sortedGroups = [...visitGroups].sort((a, b) => {
    const aPrimary = a.visits.find((visit) => getVisitTimeStatus(visit, now) === 'expired') ?? a.visits[0]
    const bPrimary = b.visits.find((visit) => getVisitTimeStatus(visit, now) === 'expired') ?? b.visits[0]
    const aStatus = a.visits.some((visit) => getVisitTimeStatus(visit, now) === 'expired')
      ? 'expired'
      : a.visits.some((visit) => getVisitTimeStatus(visit, now) === 'warning')
        ? 'warning'
        : getVisitTimeStatus(aPrimary, now)
    const bStatus = b.visits.some((visit) => getVisitTimeStatus(visit, now) === 'expired')
      ? 'expired'
      : b.visits.some((visit) => getVisitTimeStatus(visit, now) === 'warning')
        ? 'warning'
        : getVisitTimeStatus(bPrimary, now)
    const aBilling = a.isGrouped ? getVisitGroupBillingSummary(a.visits, canteenOrders) : getVisitBillingSummary(a.visits[0], canteenOrders)
    const bBilling = b.isGrouped ? getVisitGroupBillingSummary(b.visits, canteenOrders) : getVisitBillingSummary(b.visits[0], canteenOrders)
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
      aPrimary.startedAt.getTime() - bPrimary.startedAt.getTime()
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
      {sortedGroups.map((group) => {
        if (group.isGrouped) {
          return (
            <div className="visit-card-group" key={group.id}>
              <VisitGroupCard
                canteenOrders={getOrdersForVisitGroup(canteenOrders, group.visits)}
                canteenPath={canteenPath}
                now={now}
                visits={group.visits}
              />
            </div>
          )
        }

        const visit = group.visits[0]
        const visitOrders = getOrdersForVisit(canteenOrders, visit)
        return (
          <div className="visit-card-group" key={visit.id}>
            <VisitCard
              canteenOrders={visitOrders}
              now={now}
              onOpenConsumption={() => setOpenConsumptionVisitId((current) => (current === visit.id ? null : visit.id))}
              visit={visit}
            />
            {openConsumptionVisitId === visit.id ? (
              <VisitConsumptionPanel
                canteenPath={canteenPath}
                orders={visitOrders}
                visit={visit}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

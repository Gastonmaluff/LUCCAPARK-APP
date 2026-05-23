import { Baby } from 'lucide-react'
import { useState } from 'react'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { VisitCard } from './VisitCard'
import { VisitConsumptionPanel } from './VisitConsumptionPanel'

interface ActiveVisitsListProps {
  visits: ActiveVisit[]
  isLoading: boolean
  error: string | null
  canteenOrders?: CanteenOrder[]
  canteenPath?: string
}

export function ActiveVisitsList({ canteenOrders = [], canteenPath = '/admin/cantina', error, isLoading, visits }: ActiveVisitsListProps) {
  const [openConsumptionVisitId, setOpenConsumptionVisitId] = useState<string | null>(null)

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
      {visits.map((visit) => (
        <div className="visit-card-group" key={visit.id}>
          <VisitCard
            canteenOrders={canteenOrders.filter((order) => order.visitId === visit.id)}
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

import { Baby } from 'lucide-react'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { VisitCard } from './VisitCard'

interface ActiveVisitsListProps {
  visits: ActiveVisit[]
  isLoading: boolean
  error: string | null
  canteenOrders?: CanteenOrder[]
}

export function ActiveVisitsList({ canteenOrders = [], error, isLoading, visits }: ActiveVisitsListProps) {
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
        <VisitCard
          canteenOrders={canteenOrders.filter((order) => order.visitId === visit.id && order.status === 'open')}
          key={visit.id}
          visit={visit}
        />
      ))}
    </div>
  )
}

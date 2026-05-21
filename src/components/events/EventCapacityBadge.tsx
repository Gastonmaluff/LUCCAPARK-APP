import { Users } from 'lucide-react'
import { getEventCapacityStats } from '../../utils/eventCapacity'
import type { LuccaEvent } from '../../types'

interface EventCapacityBadgeProps {
  event: LuccaEvent
  guestCount?: number
  large?: boolean
}

const labelByStatus = {
  ok: 'Dentro del cupo',
  'near-limit': 'Cerca del cupo',
  'over-limit': 'Cupo superado',
} as const

export function EventCapacityBadge({ event, guestCount, large = false }: EventCapacityBadgeProps) {
  const stats = getEventCapacityStats(event, guestCount)

  return (
    <div className={`capacity-badge ${stats.capacityStatus} ${large ? 'large' : ''}`}>
      <Users size={large ? 30 : 20} />
      <div>
        <strong>
          {stats.registeredGuestsCount} / {stats.contractedChildrenCount}
        </strong>
        <span>{labelByStatus[stats.capacityStatus]}</span>
      </div>
    </div>
  )
}

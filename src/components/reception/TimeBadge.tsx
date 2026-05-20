import { useCurrentTime } from '../../hooks/useCurrentTime'
import type { ActiveVisit } from '../../types'
import { formatRemainingTime, getVisitTimeStatus } from '../../utils/visitTime'

interface TimeBadgeProps {
  visit: ActiveVisit
  large?: boolean
}

export function TimeBadge({ large = false, visit }: TimeBadgeProps) {
  const now = useCurrentTime(1000)
  const status = getVisitTimeStatus(visit, now)

  return (
    <span className={`time-badge ${status} ${large ? 'large' : ''}`}>
      {formatRemainingTime(visit, now)}
    </span>
  )
}

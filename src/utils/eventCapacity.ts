import { getLocalDateKey } from './date'
import type { EventCapacityStatus, LuccaEvent } from '../types'

export const getTodayDateKey = () => getLocalDateKey()

export const getExtraGuestsCount = (registeredGuestsCount: number, contractedChildrenCount: number) =>
  Math.max(0, registeredGuestsCount - contractedChildrenCount)

export const getIncludedRemainingCount = (registeredGuestsCount: number, contractedChildrenCount: number) =>
  Math.max(0, contractedChildrenCount - registeredGuestsCount)

export const calculateEventCapacityStatus = (
  registeredGuestsCount: number,
  contractedChildrenCount: number,
): EventCapacityStatus => {
  if (registeredGuestsCount > contractedChildrenCount) {
    return 'over-limit'
  }

  if (contractedChildrenCount - registeredGuestsCount <= 5) {
    return 'near-limit'
  }

  return 'ok'
}

export const getEventCapacityStats = (event: LuccaEvent, guestCount = event.registeredGuestsCount) => ({
  contractedChildrenCount: event.contractedChildrenCount,
  registeredGuestsCount: guestCount,
  includedRemaining: getIncludedRemainingCount(guestCount, event.contractedChildrenCount),
  extraGuestsCount: getExtraGuestsCount(guestCount, event.contractedChildrenCount),
  capacityStatus: calculateEventCapacityStatus(guestCount, event.contractedChildrenCount),
})

export const formatEventTimeRange = (event: Pick<LuccaEvent, 'startTime' | 'endTime'>) =>
  `${event.startTime} a ${event.endTime} hs`

export const isUpcomingEventStatus = (status: LuccaEvent['status']) =>
  ['inquiry', 'reserved', 'confirmed'].includes(status)

export const canStartEvent = (event: Pick<LuccaEvent, 'status' | 'date'>) =>
  isUpcomingEventStatus(event.status) && event.date === getTodayDateKey()

export const canCancelEvent = (event: Pick<LuccaEvent, 'status'>) => isUpcomingEventStatus(event.status)

export const isEventBlockingCalendar = (event: Pick<LuccaEvent, 'status'>) =>
  ['inquiry', 'reserved', 'confirmed', 'active'].includes(event.status)

export const isEventVisibleForReception = (event: LuccaEvent) =>
  event.status === 'active'

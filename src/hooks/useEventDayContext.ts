import { useMemo } from 'react'
import { useEvents } from './useEvents'
import { getTodayDateKey, isUpcomingEventStatus } from '../utils/eventCapacity'

export function useEventDayContext() {
  const result = useEvents()
  const todayKey = getTodayDateKey()

  const activeEvent = useMemo(
    () =>
      result.events
        .filter((event) => event.status === 'active')
        .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0] ?? null,
    [result.events],
  )

  const todayUpcomingEvent = useMemo(
    () =>
      result.events
        .filter((event) => event.date === todayKey && isUpcomingEventStatus(event.status))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null,
    [result.events, todayKey],
  )

  const featuredEvent = activeEvent ?? todayUpcomingEvent
  const mode = activeEvent ? 'active' : todayUpcomingEvent ? 'today' : 'normal'

  return {
    ...result,
    activeEvent,
    featuredEvent,
    mode,
    todayKey,
    todayUpcomingEvent,
  }
}

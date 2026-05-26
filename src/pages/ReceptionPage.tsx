import { useState } from 'react'
import { EventDayCallout } from '../components/events/EventDayCallout'
import { EventReceptionPanel } from '../components/events/EventReceptionPanel'
import { ReceptionWorkspace } from '../components/reception/ReceptionWorkspace'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useCanteenOrders } from '../hooks/useCanteen'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useEventDayContext } from '../hooks/useEventDayContext'
import { updateEventStatus } from '../services/eventService'

export function ReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { orders: canteenOrders } = useCanteenOrders()
  const { activeEvent, todayUpcomingEvent } = useEventDayContext()
  const now = useCurrentTime(1000)
  const [manualMode, setManualMode] = useState(false)
  const [eventActionError, setEventActionError] = useState<string | null>(null)
  const [isStartingEvent, setIsStartingEvent] = useState(false)

  const startTodayEvent = async () => {
    if (!todayUpcomingEvent) return
    setIsStartingEvent(true)
    setEventActionError(null)
    try {
      await updateEventStatus(todayUpcomingEvent.id, 'active')
    } catch (startError) {
      setEventActionError(startError instanceof Error ? startError.message : 'No se pudo empezar el evento.')
    } finally {
      setIsStartingEvent(false)
    }
  }

  return (
    <main className="internal-page">
      <section className="internal-shell">
        {activeEvent ? (
          <EventReceptionPanel canteenPath="/cantina" reservationsPath="/admin/reservas" />
        ) : (
          <>
            {eventActionError ? <div className="form-alert error">{eventActionError}</div> : null}
            {todayUpcomingEvent ? (
              <EventDayCallout
                detailTo={`/admin/reservas?eventId=${todayUpcomingEvent.id}`}
                event={todayUpcomingEvent}
                isBusy={isStartingEvent}
                onStart={startTodayEvent}
                operationTo="/recepcion"
                variant="today"
              />
            ) : null}
            <ReceptionWorkspace
              canteenOrders={canteenOrders}
              canteenPath="/cantina"
              eventModeActive={manualMode}
              error={error}
              isLoading={isLoading}
              now={now}
              onEventMode={() => setManualMode((current) => !current)}
              storageMode={storageMode}
              visits={visits}
            />
            {manualMode ? <EventReceptionPanel canteenPath="/cantina" reservationsPath="/admin/reservas" /> : null}
          </>
        )}
      </section>
    </main>
  )
}

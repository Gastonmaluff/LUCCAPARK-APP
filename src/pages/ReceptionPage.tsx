import { useState } from 'react'
import { EventReceptionPanel } from '../components/events/EventReceptionPanel'
import { ReceptionWorkspace } from '../components/reception/ReceptionWorkspace'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useCanteenOrders } from '../hooks/useCanteen'
import { useCurrentTime } from '../hooks/useCurrentTime'

export function ReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { orders: canteenOrders } = useCanteenOrders()
  const now = useCurrentTime(1000)
  const [mode, setMode] = useState<'normal' | 'event'>('normal')

  return (
    <main className="internal-page">
      <section className="internal-shell">
        <ReceptionWorkspace
          canteenOrders={canteenOrders}
          canteenPath="/cantina"
          eventModeActive={mode === 'event'}
          error={error}
          isLoading={isLoading}
          now={now}
          onEventMode={() => setMode((current) => (current === 'event' ? 'normal' : 'event'))}
          storageMode={storageMode}
          visits={visits}
        />
        {mode === 'event' ? <EventReceptionPanel /> : null}
      </section>
    </main>
  )
}

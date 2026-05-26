import { StatusPill } from '../StatusPill'
import type { EventStatus } from '../../types'
import type { ComponentProps } from 'react'

const statusLabel: Record<EventStatus, string> = {
  inquiry: 'Proxima / Reservada',
  reserved: 'Proxima / Reservada',
  confirmed: 'Proxima / Reservada',
  active: 'En curso',
  finished: 'Finalizada',
  cancelled: 'Cancelada',
}

const statusTone: Record<EventStatus, ComponentProps<typeof StatusPill>['tone']> = {
  inquiry: 'reserved',
  reserved: 'reserved',
  confirmed: 'reserved',
  active: 'available',
  finished: 'info',
  cancelled: 'danger',
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <StatusPill tone={statusTone[status]}>{statusLabel[status]}</StatusPill>
}

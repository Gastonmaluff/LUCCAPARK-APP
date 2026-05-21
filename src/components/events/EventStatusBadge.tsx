import { StatusPill } from '../StatusPill'
import type { EventStatus } from '../../types'
import type { ComponentProps } from 'react'

const statusLabel: Record<EventStatus, string> = {
  inquiry: 'Consulta',
  reserved: 'Reservado',
  confirmed: 'Confirmado',
  active: 'Activo',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}

const statusTone: Record<EventStatus, ComponentProps<typeof StatusPill>['tone']> = {
  inquiry: 'info',
  reserved: 'reserved',
  confirmed: 'available',
  active: 'available',
  finished: 'info',
  cancelled: 'danger',
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <StatusPill tone={statusTone[status]}>{statusLabel[status]}</StatusPill>
}

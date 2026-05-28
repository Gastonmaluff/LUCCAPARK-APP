import { CalendarDays, Clock, ExternalLink, PartyPopper, Play, Square, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../StatusPill'
import { formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'
import { getEventPendingAmount } from '../../utils/eventFinance'
import { formatGuarani } from '../../utils/money'
import type { LuccaEvent } from '../../types'

interface EventDayCalloutProps {
  event: LuccaEvent
  variant: 'today' | 'active'
  guestCount?: number
  canteenTotal?: number
  detailTo?: string
  operationTo?: string
  tvTo?: string
  onConfigureTv?: () => void
  isBusy?: boolean
  onFinish?: () => void
  onStart?: () => void
}

export function EventDayCallout({
  canteenTotal = 0,
  detailTo,
  event,
  guestCount,
  isBusy,
  onFinish,
  onStart,
  operationTo,
  onConfigureTv,
  tvTo,
  variant,
}: EventDayCalloutProps) {
  const stats = getEventCapacityStats(event, guestCount ?? event.registeredGuestsCount)
  const isActive = variant === 'active'
  const pendingAmount = getEventPendingAmount(event)

  return (
    <article className={`event-day-callout ${isActive ? 'active' : 'today'}`}>
      <div className="event-day-heading">
        <span className="event-day-icon">
          <PartyPopper size={22} />
        </span>
        <div>
          <p className="eyebrow">{isActive ? 'EVENTO EN CURSO' : 'EVENTO DE HOY'}</p>
          <h2>{event.title}</h2>
          <p className="muted">
            {event.customerName} - Hoy - {formatEventTimeRange(event)}
          </p>
        </div>
        <StatusPill tone={isActive ? 'available' : 'warning'}>{isActive ? 'En curso' : 'Proximo a comenzar'}</StatusPill>
      </div>

      <div className="event-day-metrics">
        <span>
          <Users size={18} />
          <small>Cupo contratado</small>
          <strong>{event.contractedChildrenCount} ninos</strong>
        </span>
        {isActive ? (
          <>
            <span>
              <CalendarDays size={18} />
              <small>Ingresaron</small>
              <strong>
                {stats.registeredGuestsCount} / {stats.contractedChildrenCount}
              </strong>
            </span>
            <span>
              <Clock size={18} />
              <small>Restantes incluidos</small>
              <strong>{stats.includedRemaining}</strong>
            </span>
            <span className={stats.extraGuestsCount > 0 ? 'metric-warning' : ''}>
              <Users size={18} />
              <small>Adicionales</small>
              <strong>{stats.extraGuestsCount}</strong>
            </span>
            <span>
              <CalendarDays size={18} />
              <small>Cantina</small>
              <strong>{formatGuarani(canteenTotal)}</strong>
            </span>
          </>
        ) : null}
        <span>
          <CalendarDays size={18} />
          <small>Saldo pendiente</small>
          <strong>{formatGuarani(pendingAmount)}</strong>
        </span>
      </div>

      <div className="event-day-actions">
        {operationTo ? (
          <Link className="button secondary" to={operationTo}>
            <ExternalLink size={17} />
            {isActive ? 'Registrar invitado' : 'Ver recepcion'}
          </Link>
        ) : null}
        {event.childId ? (
          <Link className="button ghost" to={`/admin/clientes?childId=${event.childId}`}>
            Ver perfil del niño
          </Link>
        ) : null}
        {detailTo ? (
          <Link className="button ghost" to={detailTo}>
            Ver detalle
          </Link>
        ) : null}
        {onConfigureTv && isActive ? (
          <button className="button ghost" onClick={onConfigureTv} type="button">
            Configurar TV
          </button>
        ) : tvTo && isActive ? (
          <Link className="button ghost" to={tvTo}>
            Configurar TV
          </Link>
        ) : null}
        {!isActive && onStart ? (
          <button className="button primary" disabled={isBusy} onClick={onStart} type="button">
            <Play size={18} />
            Empezar evento
          </button>
        ) : null}
        {isActive && onFinish ? (
          <button className="button danger" disabled={isBusy} onClick={onFinish} type="button">
            <Square size={18} />
            Finalizar evento
          </button>
        ) : null}
      </div>
    </article>
  )
}

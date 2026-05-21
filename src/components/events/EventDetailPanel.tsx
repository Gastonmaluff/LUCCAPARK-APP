import { useState } from 'react'
import { CheckCircle2, Monitor, PartyPopper, Power, Square } from 'lucide-react'
import { EventCapacityBadge } from './EventCapacityBadge'
import { EventGuestList } from './EventGuestList'
import { EventStatusBadge } from './EventStatusBadge'
import { StatusPill } from '../StatusPill'
import { updateEventStatus, updateEventTvSettings } from '../../services/eventService'
import { useEventGuests } from '../../hooks/useEvents'
import { formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'
import type { LuccaEvent, UpdateEventTvInput } from '../../types'

interface EventDetailPanelProps {
  event: LuccaEvent | null
}

export function EventDetailPanel({ event }: EventDetailPanelProps) {
  const { error, guests, isLoading } = useEventGuests(event?.id)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isSavingTv, setIsSavingTv] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tvDraft, setTvDraft] = useState<{ eventId: string; data: UpdateEventTvInput } | null>(null)

  if (!event) {
    return (
      <article className="panel">
        <div className="empty-state">Seleccioná una reserva para ver el detalle e invitados.</div>
      </article>
    )
  }

  const stats = getEventCapacityStats(event, guests.length || event.registeredGuestsCount)
  const eventTvSettings: UpdateEventTvInput = {
    tvModeEnabled: event.tvModeEnabled,
    tvTitle: event.tvTitle,
    tvMessage: event.tvMessage,
    tvBannerImageUrl: event.tvBannerImageUrl,
    showGuestCounterOnTv: event.showGuestCounterOnTv,
    showEventNameOnTv: event.showEventNameOnTv,
    hideSensitiveInfoOnTv: event.hideSensitiveInfoOnTv,
  }
  const tvForm = tvDraft?.eventId === event.id ? tvDraft.data : eventTvSettings

  const updateTvForm = <Field extends keyof UpdateEventTvInput>(field: Field, value: UpdateEventTvInput[Field]) => {
    setTvDraft({
      eventId: event.id,
      data: {
        ...tvForm,
        [field]: value,
      },
    })
  }

  const changeStatus = async (status: LuccaEvent['status']) => {
    setIsUpdatingStatus(true)
    setMessage(null)
    try {
      await updateEventStatus(event.id, status)
      setMessage('Estado actualizado.')
    } catch (statusError) {
      setMessage(statusError instanceof Error ? statusError.message : 'No se pudo actualizar el estado.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const saveTvSettings = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    setIsSavingTv(true)
    setMessage(null)
    try {
      await updateEventTvSettings(event.id, tvForm)
      setMessage('Configuracion de TV guardada.')
      setTvDraft(null)
    } catch (tvError) {
      setMessage(tvError instanceof Error ? tvError.message : 'No se pudo guardar la TV.')
    } finally {
      setIsSavingTv(false)
    }
  }

  return (
    <article className="panel event-detail-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <PartyPopper color="var(--orange)" />
          Detalle del evento
        </h2>
        <EventStatusBadge status={event.status} />
      </div>

      {message ? <div className="form-alert success">{message}</div> : null}

      <div className="event-detail-grid">
        <div>
          <p className="eyebrow">Evento</p>
          <h3>{event.title}</h3>
          <p className="muted">
            {event.customerName} · {event.date} · {formatEventTimeRange(event)}
          </p>
        </div>
        <EventCapacityBadge event={event} guestCount={guests.length || event.registeredGuestsCount} />
      </div>

      <div className="event-owner-summary">
        <strong>
          Entraron {stats.registeredGuestsCount} ninos de {stats.contractedChildrenCount} contratados
        </strong>
        <StatusPill tone={stats.extraGuestsCount > 0 ? 'danger' : stats.includedRemaining <= 5 ? 'warning' : 'available'}>
          Adicionales: {stats.extraGuestsCount}
        </StatusPill>
      </div>

      <div className="module-actions event-actions">
        <button className="button primary" disabled={isUpdatingStatus} onClick={() => changeStatus('active')} type="button">
          <Power size={18} />
          Activar evento
        </button>
        <button className="button ghost" disabled={isUpdatingStatus} onClick={() => changeStatus('finished')} type="button">
          <Square size={18} />
          Finalizar evento
        </button>
        <button className="button secondary" disabled={isUpdatingStatus} onClick={() => changeStatus('confirmed')} type="button">
          <CheckCircle2 size={18} />
          Confirmar
        </button>
      </div>

      <form className="tv-settings-form" onSubmit={saveTvSettings}>
        <div className="panel-header">
          <h3 className="panel-title">
            <Monitor color="var(--turquoise)" />
            Configuracion TV
          </h3>
          <StatusPill tone="info">Modo evento</StatusPill>
        </div>

        <label className="field">
          <span>Titulo TV</span>
          <input
            onChange={(changeEvent) => updateTvForm('tvTitle', changeEvent.target.value)}
            value={tvForm.tvTitle}
          />
        </label>
        <label className="field">
          <span>Mensaje TV</span>
          <input
            onChange={(changeEvent) => updateTvForm('tvMessage', changeEvent.target.value)}
            value={tvForm.tvMessage}
          />
        </label>
        <label className="field">
          <span>URL banner</span>
          <input
            onChange={(changeEvent) => updateTvForm('tvBannerImageUrl', changeEvent.target.value)}
            placeholder="https://..."
            value={tvForm.tvBannerImageUrl}
          />
        </label>

        <div className="settings-toggle-grid">
          <label>
            <input
              checked={tvForm.tvModeEnabled}
              onChange={(changeEvent) => updateTvForm('tvModeEnabled', changeEvent.target.checked)}
              type="checkbox"
            />
            Activar TV evento
          </label>
          <label>
            <input
              checked={tvForm.showEventNameOnTv}
              onChange={(changeEvent) => updateTvForm('showEventNameOnTv', changeEvent.target.checked)}
              type="checkbox"
            />
            Mostrar nombre
          </label>
          <label>
            <input
              checked={tvForm.showGuestCounterOnTv}
              onChange={(changeEvent) => updateTvForm('showGuestCounterOnTv', changeEvent.target.checked)}
              type="checkbox"
            />
            Mostrar contador
          </label>
          <label>
            <input
              checked={tvForm.hideSensitiveInfoOnTv}
              onChange={(changeEvent) => updateTvForm('hideSensitiveInfoOnTv', changeEvent.target.checked)}
              type="checkbox"
            />
            Ocultar datos sensibles
          </label>
        </div>

        <button className="button ghost" disabled={isSavingTv} type="submit">
          Guardar TV
        </button>
      </form>

      <div className="panel-header guests-detail-header">
        <h3 className="panel-title">Invitados del evento</h3>
        <StatusPill tone="info">{guests.length} registrados</StatusPill>
      </div>
      <EventGuestList error={error} guests={guests} isLoading={isLoading} />
    </article>
  )
}

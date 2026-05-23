import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { createEvent } from '../../services/eventService'
import { getTodayDateKey } from '../../utils/eventCapacity'
import { formatGuarani, toNumber } from '../../utils/money'
import type { CreateEventInput, EventStatus, EventType, LuccaEvent } from '../../types'

interface EventCreateFormProps {
  events?: LuccaEvent[]
  initialDate?: string
  onCancel?: () => void
  onCreated?: (eventId: string) => void
}

const buildInitialForm = (date = getTodayDateKey()): CreateEventInput => ({
  title: '',
  birthdayChildName: '',
  customerName: '',
  customerPhone: '',
  date,
  startTime: '15:00',
  endTime: '18:00',
  contractedChildrenCount: 40,
  status: 'reserved',
  eventType: 'birthday',
  totalAmount: null,
  depositAmount: null,
  pendingAmount: null,
  notes: '',
})

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

const hasTimeOverlap = (startA: string, endA: string, startB: string, endB: string) => {
  const start = toMinutes(startA)
  const end = toMinutes(endA)
  const otherStart = toMinutes(startB)
  const otherEnd = toMinutes(endB)
  return start < otherEnd && otherStart < end
}

export function EventCreateForm({ events = [], initialDate, onCancel, onCreated }: EventCreateFormProps) {
  const [form, setForm] = useState<CreateEventInput>(() => buildInitialForm(initialDate))
  const [allowOverlap, setAllowOverlap] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    setForm(buildInitialForm(initialDate))
    setAllowOverlap(false)
  }, [initialDate])

  const conflictingEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.date === form.date &&
          ['reserved', 'confirmed', 'active'].includes(event.status) &&
          hasTimeOverlap(form.startTime, form.endTime, event.startTime, event.endTime),
      ),
    [events, form.date, form.endTime, form.startTime],
  )

  const pendingAmount =
    form.totalAmount !== null && form.totalAmount !== undefined
      ? Math.max(0, Number(form.totalAmount) - Number(form.depositAmount ?? 0))
      : null

  const updateField = <Field extends keyof CreateEventInput>(field: Field, value: CreateEventInput[Field]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setAllowOverlap(false)
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.customerName.trim() || !form.date || !form.startTime || !form.endTime || Number(form.contractedChildrenCount) <= 0) {
      setError('Completa cliente, fecha, horario y cupo contratado.')
      return
    }

    if (!form.title.trim() && !form.birthdayChildName.trim()) {
      setError('Carga el nombre del evento o cumpleañero.')
      return
    }

    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) {
      setError('La hora de fin debe ser posterior al inicio.')
      return
    }

    if (conflictingEvents.length > 0 && !allowOverlap) {
      setError('Ya existe una reserva para este horario. Revisa el evento existente antes de confirmar una nueva reserva.')
      return
    }

    setIsSaving(true)
    try {
      const eventId = await createEvent({
        ...form,
        title: form.title.trim() || `Cumpleaños de ${form.birthdayChildName.trim()}`,
        birthdayChildName: form.birthdayChildName.trim() || form.title.trim(),
        contractedChildrenCount: Number(form.contractedChildrenCount || 1),
        totalAmount: form.totalAmount ?? null,
        depositAmount: form.depositAmount ?? null,
        pendingAmount,
      })
      setForm(buildInitialForm(initialDate))
      setSuccess('Reserva creada correctamente.')
      onCreated?.(eventId)
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'No se pudo crear la reserva.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="form-grid event-create-form" onSubmit={handleSubmit}>
      {error ? <div className="form-alert error">{error}</div> : null}
      {success ? <div className="form-alert success">{success}</div> : null}
      {conflictingEvents.length > 0 ? (
        <div className="form-alert warning">
          Horario con posible solapamiento: {conflictingEvents.map((event) => event.title).join(', ')}.
          <label className="inline-check conflict-check">
            <input checked={allowOverlap} onChange={(event) => setAllowOverlap(event.target.checked)} type="checkbox" />
            Entiendo y quiero guardar igual
          </label>
        </div>
      ) : null}

      <label className="field">
        <span>Nombre del evento o cumpleañero *</span>
        <input onChange={(event) => updateField('title', event.target.value)} placeholder="Cumpleaños de Mateo" value={form.title} />
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Tipo de evento</span>
          <select onChange={(event) => updateField('eventType', event.target.value as EventType)} value={form.eventType}>
            <option value="birthday">Cumpleaños</option>
            <option value="private_event">Evento privado</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label className="field">
          <span>Cupo contratado *</span>
          <input
            min={1}
            onChange={(event) => updateField('contractedChildrenCount', Number(event.target.value))}
            type="number"
            value={form.contractedChildrenCount}
          />
        </label>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Cliente / responsable *</span>
          <input onChange={(event) => updateField('customerName', event.target.value)} value={form.customerName} />
        </label>
        <label className="field">
          <span>Teléfono</span>
          <input onChange={(event) => updateField('customerPhone', event.target.value)} value={form.customerPhone} />
        </label>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Fecha *</span>
          <input onChange={(event) => updateField('date', event.target.value)} type="date" value={form.date} />
        </label>
        <label className="field">
          <span>Estado inicial</span>
          <select onChange={(event) => updateField('status', event.target.value as EventStatus)} value={form.status}>
            <option value="inquiry">Consulta</option>
            <option value="reserved">Reservado</option>
            <option value="confirmed">Confirmado</option>
          </select>
        </label>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Hora inicio *</span>
          <input onChange={(event) => updateField('startTime', event.target.value)} type="time" value={form.startTime} />
        </label>
        <label className="field">
          <span>Hora fin *</span>
          <input onChange={(event) => updateField('endTime', event.target.value)} type="time" value={form.endTime} />
        </label>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Monto total</span>
          <input
            min={0}
            onChange={(event) => updateField('totalAmount', event.target.value === '' ? null : toNumber(event.target.value))}
            placeholder="Opcional"
            type="number"
            value={form.totalAmount ?? ''}
          />
        </label>
        <label className="field">
          <span>Seña</span>
          <input
            min={0}
            onChange={(event) => updateField('depositAmount', event.target.value === '' ? null : toNumber(event.target.value))}
            placeholder="Opcional"
            type="number"
            value={form.depositAmount ?? ''}
          />
        </label>
      </div>

      <div className="event-balance-box">
        <span>Saldo pendiente</span>
        <strong>{pendingAmount === null ? 'Sin monto' : formatGuarani(pendingAmount)}</strong>
      </div>

      <label className="field">
        <span>Observaciones</span>
        <textarea onChange={(event) => updateField('notes', event.target.value)} rows={3} value={form.notes} />
      </label>

      <div className="module-actions">
        {onCancel ? (
          <button className="button ghost" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="button primary action-button" disabled={isSaving} type="submit">
          <CalendarPlus size={18} />
          {isSaving ? 'Guardando...' : 'Guardar reserva'}
        </button>
      </div>
    </form>
  )
}

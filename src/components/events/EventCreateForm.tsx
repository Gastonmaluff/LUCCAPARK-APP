import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { createEvent } from '../../services/eventService'
import { getTodayDateKey } from '../../utils/eventCapacity'
import type { CreateEventInput, EventStatus, EventType } from '../../types'

const initialForm: CreateEventInput = {
  title: '',
  birthdayChildName: '',
  customerName: '',
  customerPhone: '',
  date: getTodayDateKey(),
  startTime: '15:00',
  endTime: '18:00',
  contractedChildrenCount: 40,
  status: 'confirmed',
  eventType: 'birthday',
  notes: '',
}

export function EventCreateForm({ onCreated }: { onCreated?: (eventId: string) => void }) {
  const [form, setForm] = useState<CreateEventInput>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const updateField = <Field extends keyof CreateEventInput>(field: Field, value: CreateEventInput[Field]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.birthdayChildName.trim() || !form.customerName.trim() || !form.date || !form.startTime || !form.endTime) {
      setError('Completá cumpleañero, cliente, fecha y horario.')
      return
    }

    setIsSaving(true)
    try {
      const eventId = await createEvent({
        ...form,
        title: form.title.trim() || `Cumpleanos de ${form.birthdayChildName.trim()}`,
        contractedChildrenCount: Number(form.contractedChildrenCount || 1),
      })
      setForm(initialForm)
      setSuccess('Evento creado correctamente.')
      onCreated?.(eventId)
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'No se pudo crear el evento.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {error ? <div className="form-alert error">{error}</div> : null}
      {success ? <div className="form-alert success">{success}</div> : null}

      <label className="field">
        <span>Nombre del evento</span>
        <input
          onChange={(event) => updateField('title', event.target.value)}
          placeholder="Cumpleanos de Mateo"
          value={form.title}
        />
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Cumpleañero *</span>
          <input onChange={(event) => updateField('birthdayChildName', event.target.value)} value={form.birthdayChildName} />
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
          <span>Cliente *</span>
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
          <span>Estado</span>
          <select onChange={(event) => updateField('status', event.target.value as EventStatus)} value={form.status}>
            <option value="reserved">Reservado</option>
            <option value="confirmed">Confirmado</option>
            <option value="active">Activo</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </label>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Inicio *</span>
          <input onChange={(event) => updateField('startTime', event.target.value)} type="time" value={form.startTime} />
        </label>
        <label className="field">
          <span>Fin *</span>
          <input onChange={(event) => updateField('endTime', event.target.value)} type="time" value={form.endTime} />
        </label>
      </div>

      <label className="field">
        <span>Tipo</span>
        <select onChange={(event) => updateField('eventType', event.target.value as EventType)} value={form.eventType}>
          <option value="birthday">Cumpleaños</option>
          <option value="private_event">Evento privado</option>
          <option value="other">Otro</option>
        </select>
      </label>

      <label className="field">
        <span>Observaciones</span>
        <textarea onChange={(event) => updateField('notes', event.target.value)} rows={3} value={form.notes} />
      </label>

      <button className="button primary action-button" disabled={isSaving} type="submit">
        <CalendarPlus size={18} />
        {isSaving ? 'Creando...' : 'Crear evento'}
      </button>
    </form>
  )
}

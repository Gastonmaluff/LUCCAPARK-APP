import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { createEventGuest } from '../../services/eventService'
import type { LuccaEvent } from '../../types'

interface EventGuestFormProps {
  event: LuccaEvent
}

const initialForm = {
  childName: '',
  childBirthDate: '',
  childAgeRange: '',
  childGender: '',
  responsibleName: '',
  responsiblePhone: '',
  notes: '',
}

export function EventGuestForm({ event }: EventGuestFormProps) {
  const [form, setForm] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (eventSubmit: React.FormEvent<HTMLFormElement>) => {
    eventSubmit.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.childName.trim() || !form.responsibleName.trim()) {
      setError('Completá nombre del niño y responsable.')
      return
    }

    setIsSaving(true)
    try {
      await createEventGuest({ event, ...form })
      setForm(initialForm)
      setSuccess('Invitado registrado correctamente.')
    } catch (guestError) {
      setError(guestError instanceof Error ? guestError.message : 'No se pudo registrar el invitado.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {error ? <div className="form-alert error">{error}</div> : null}
      {success ? <div className="form-alert success">{success}</div> : null}

      <label className="field">
        <span>Nombre del niño *</span>
        <input
          onChange={(eventChange) => updateField('childName', eventChange.target.value)}
          placeholder="Ej. Valentina Gomez"
          value={form.childName}
        />
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Fecha nacimiento</span>
          <input
            onChange={(eventChange) => updateField('childBirthDate', eventChange.target.value)}
            type="date"
            value={form.childBirthDate}
          />
        </label>
        <label className="field">
          <span>Sexo</span>
          <select onChange={(eventChange) => updateField('childGender', eventChange.target.value)} value={form.childGender}>
            <option value="">Sin especificar</option>
            <option value="femenino">Femenino</option>
            <option value="masculino">Masculino</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>Edad o rango</span>
        <select onChange={(eventChange) => updateField('childAgeRange', eventChange.target.value)} value={form.childAgeRange}>
          <option value="">Seleccionar edad</option>
          <option value="2 a 4 anos">2 a 4 años</option>
          <option value="5 a 8 anos">5 a 8 años</option>
          <option value="9 anos o mas">9 años o más</option>
        </select>
      </label>

      <label className="field">
        <span>Responsable *</span>
        <input
          onChange={(eventChange) => updateField('responsibleName', eventChange.target.value)}
          placeholder="Nombre del responsable"
          value={form.responsibleName}
        />
      </label>

      <label className="field">
        <span>Teléfono</span>
        <input
          onChange={(eventChange) => updateField('responsiblePhone', eventChange.target.value)}
          placeholder="Ej. 0981 000 000"
          value={form.responsiblePhone}
        />
      </label>

      <label className="field">
        <span>Observaciones</span>
        <textarea
          onChange={(eventChange) => updateField('notes', eventChange.target.value)}
          placeholder="Alergias, cuidados, comentarios..."
          rows={3}
          value={form.notes}
        />
      </label>

      <button className="button primary action-button" disabled={isSaving} type="submit">
        <ClipboardCheck size={18} />
        {isSaving ? 'Registrando...' : 'Registrar invitado'}
      </button>
    </form>
  )
}

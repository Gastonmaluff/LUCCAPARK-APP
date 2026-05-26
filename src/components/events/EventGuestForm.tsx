import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { createEventGuest } from '../../services/eventService'
import { calculateAgeYears, formatAgeLabel, formatBirthDateInput, parseBirthDateDisplay } from '../../utils/birthDate'
import { formatParaguayanPhone, formatPersonName, phoneDigits } from '../../utils/textFormat'
import type { LuccaEvent } from '../../types'

interface EventGuestFormProps {
  event: LuccaEvent
  onCreated?: () => void
}

const initialForm = {
  childName: '',
  childBirthDateInput: '',
  childExactAge: '',
  childGender: '',
  responsibleName: '',
  responsiblePhone: '',
  notes: '',
}

export function EventGuestForm({ event, onCreated }: EventGuestFormProps) {
  const [form, setForm] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const birthDateResult = parseBirthDateDisplay(form.childBirthDateInput)
  const calculatedAge = calculateAgeYears(birthDateResult.iso)
  const ageLabel = formatAgeLabel(calculatedAge)

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  const handleBirthDateChange = (value: string) => {
    const formatted = formatBirthDateInput(value)
    setForm((current) => ({
      ...current,
      childBirthDateInput: formatted,
      childExactAge: formatted ? '' : current.childExactAge,
    }))
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (eventSubmit: React.FormEvent<HTMLFormElement>) => {
    eventSubmit.preventDefault()
    setError(null)
    setSuccess(null)

    const childName = formatPersonName(form.childName)
    const responsibleName = formatPersonName(form.responsibleName)
    const childBirthDate = birthDateResult.iso

    if (!childName || !responsibleName) {
      setError('Completa nombre del nino y responsable.')
      return
    }

    if (birthDateResult.error) {
      setError(birthDateResult.error)
      return
    }

    setIsSaving(true)
    try {
      await createEventGuest({
        event,
        childName,
        childBirthDate,
        childExactAge: childBirthDate ? null : form.childExactAge ? Number(form.childExactAge) : null,
        childAgeCalculated: calculatedAge,
        childAgeRange: '',
        childGender: form.childGender,
        responsibleName,
        responsiblePhone: phoneDigits(form.responsiblePhone),
        notes: form.notes,
      })
      setForm(initialForm)
      setSuccess('Invitado registrado correctamente.')
      onCreated?.()
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
        <span>Nombre del nino *</span>
        <input
          onBlur={() => updateField('childName', formatPersonName(form.childName))}
          onChange={(eventChange) => updateField('childName', eventChange.target.value)}
          placeholder="Ej. Valentina Gomez"
          value={form.childName}
        />
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Fecha nacimiento</span>
          <input
            inputMode="numeric"
            maxLength={10}
            onChange={(eventChange) => handleBirthDateChange(eventChange.target.value)}
            placeholder="DD/MM/AAAA"
            value={form.childBirthDateInput}
          />
          {birthDateResult.error ? <small className="field-error">{birthDateResult.error}</small> : null}
        </label>
        <label className="field">
          <span>{birthDateResult.iso ? 'Edad' : 'Edad exacta'}</span>
          <input
            disabled={Boolean(birthDateResult.iso)}
            min={0}
            onChange={(eventChange) => updateField('childExactAge', eventChange.target.value)}
            placeholder={birthDateResult.iso ? '' : 'Ej. 7'}
            type={birthDateResult.iso ? 'text' : 'number'}
            value={birthDateResult.iso ? ageLabel : form.childExactAge}
          />
        </label>
      </div>

      <label className="field">
        <span>Sexo</span>
        <select onChange={(eventChange) => updateField('childGender', eventChange.target.value)} value={form.childGender}>
          <option value="">Sin especificar</option>
          <option value="femenino">Femenino</option>
          <option value="masculino">Masculino</option>
          <option value="otro">Otro</option>
        </select>
      </label>

      <label className="field">
        <span>Responsable *</span>
        <input
          onBlur={() => updateField('responsibleName', formatPersonName(form.responsibleName))}
          onChange={(eventChange) => updateField('responsibleName', eventChange.target.value)}
          placeholder="Nombre del responsable"
          value={form.responsibleName}
        />
      </label>

      <label className="field">
        <span>Telefono</span>
        <input
          inputMode="numeric"
          onChange={(eventChange) => updateField('responsiblePhone', formatParaguayanPhone(eventChange.target.value))}
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

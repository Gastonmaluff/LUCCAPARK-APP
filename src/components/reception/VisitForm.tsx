import { Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { timePlans } from '../../config/timePlans'
import { createNormalVisit } from '../../services/visitService'
import type { CreateVisitInput, PaymentMethod, PaymentStatus, TimePlan } from '../../types'

const formatTimeValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

const parseTodayTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

const initialForm = () => ({
  childName: '',
  childBirthDate: '',
  childAgeRange: '',
  childGender: '',
  childNotes: '',
  customerName: '',
  customerPhone: '',
  customerRelation: '',
  childrenCount: '1',
  planId: 'one-hour' as TimePlan['id'],
  startedAtTime: formatTimeValue(new Date()),
  paymentStatus: 'paid' as PaymentStatus,
  paymentMethod: 'cash' as PaymentMethod,
  amountCharged: '',
  notes: '',
})

interface VisitFormProps {
  compact?: boolean
  onCreated?: (visitId: string) => void
}

export function VisitForm({ compact = false, onCreated }: VisitFormProps) {
  const [form, setForm] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedPlan = useMemo(
    () => timePlans.find((plan) => plan.id === form.planId) ?? timePlans[0],
    [form.planId],
  )

  const setField = (field: keyof ReturnType<typeof initialForm>, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.childName.trim() || !form.customerName.trim() || !form.planId || !form.paymentStatus) {
      setError('Completá nombre del niño, responsable, plan y estado de pago.')
      return
    }

    setIsSaving(true)

    try {
      const payload: CreateVisitInput = {
        childName: form.childName,
        childBirthDate: form.childBirthDate,
        childAgeRange: form.childAgeRange,
        childGender: form.childGender,
        childNotes: form.childNotes,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerRelation: form.customerRelation,
        childrenCount: Number(form.childrenCount) || 1,
        planId: selectedPlan.id,
        startedAt: parseTodayTime(form.startedAtTime),
        paymentStatus: form.paymentStatus,
        paymentMethod: form.paymentMethod,
        amountCharged: form.amountCharged ? Number(form.amountCharged) : null,
        notes: form.notes,
      }

      const visitId = await createNormalVisit(payload)
      setSuccess('Ingreso registrado correctamente.')
      setForm(initialForm())
      onCreated?.(visitId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo registrar el ingreso.')
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
          onChange={(event) => setField('childName', event.target.value)}
          placeholder="Ej. Mateo Rios"
          value={form.childName}
        />
      </label>

      {!compact ? (
        <div className="form-inline">
          <label className="field">
            <span>Fecha nacimiento</span>
            <input
              onChange={(event) => setField('childBirthDate', event.target.value)}
              type="date"
              value={form.childBirthDate}
            />
          </label>
          <label className="field">
            <span>Sexo</span>
            <select onChange={(event) => setField('childGender', event.target.value)} value={form.childGender}>
              <option value="">Sin especificar</option>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
              <option value="other">Otro</option>
            </select>
          </label>
        </div>
      ) : null}

      <label className="field">
        <span>Edad o rango</span>
        <select onChange={(event) => setField('childAgeRange', event.target.value)} value={form.childAgeRange}>
          <option value="">Seleccionar edad</option>
          <option value="2 a 4 anos">2 a 4 anos</option>
          <option value="5 a 8 anos">5 a 8 anos</option>
          <option value="9 anos o mas">9 anos o mas</option>
        </select>
      </label>

      <label className="field">
        <span>Responsable *</span>
        <input
          onChange={(event) => setField('customerName', event.target.value)}
          placeholder="Nombre del responsable"
          value={form.customerName}
        />
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Telefono</span>
          <input
            onChange={(event) => setField('customerPhone', event.target.value)}
            placeholder="Ej. 0981 000 000"
            value={form.customerPhone}
          />
        </label>
        <label className="field">
          <span>Relacion</span>
          <input
            onChange={(event) => setField('customerRelation', event.target.value)}
            placeholder="Madre, padre, tutor..."
            value={form.customerRelation}
          />
        </label>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Cantidad de ninos</span>
          <input
            min={1}
            onChange={(event) => setField('childrenCount', event.target.value)}
            type="number"
            value={form.childrenCount}
          />
        </label>
        <label className="field">
          <span>Hora de ingreso</span>
          <input
            onChange={(event) => setField('startedAtTime', event.target.value)}
            type="time"
            value={form.startedAtTime}
          />
        </label>
      </div>

      <label className="field">
        <span>Plan contratado *</span>
        <select onChange={(event) => setField('planId', event.target.value)} value={form.planId}>
          {timePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Estado de pago *</span>
          <select
            onChange={(event) => setField('paymentStatus', event.target.value)}
            value={form.paymentStatus}
          >
            <option value="paid">Pagado al ingresar</option>
            <option value="payAtExit">Paga al salir</option>
            <option value="pending">Pendiente</option>
          </select>
        </label>
        <label className="field">
          <span>Forma de pago</span>
          <select
            onChange={(event) => setField('paymentMethod', event.target.value)}
            value={form.paymentMethod}
          >
            <option value="">Sin definir</option>
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="card">Tarjeta</option>
            <option value="qr">QR</option>
            <option value="other">Otro</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>Monto cobrado</span>
        <input
          min={0}
          onChange={(event) => setField('amountCharged', event.target.value)}
          placeholder="Opcional"
          type="number"
          value={form.amountCharged}
        />
      </label>

      {!compact ? (
        <label className="field">
          <span>Observaciones del nino</span>
          <textarea
            onChange={(event) => setField('childNotes', event.target.value)}
            placeholder="Alergias, cuidados, cumpleaños..."
            rows={2}
            value={form.childNotes}
          />
        </label>
      ) : null}

      <label className="field">
        <span>Nota interna</span>
        <textarea
          onChange={(event) => setField('notes', event.target.value)}
          placeholder="Agregar alguna observacion..."
          rows={compact ? 2 : 3}
          value={form.notes}
        />
      </label>

      <button className="button primary action-button" disabled={isSaving} type="submit">
        <Plus size={18} />
        {isSaving ? 'Registrando...' : 'Registrar ingreso'}
      </button>
    </form>
  )
}

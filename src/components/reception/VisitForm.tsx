import { Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { timePlans } from '../../config/timePlans'
import { createNormalVisit } from '../../services/visitService'
import { formatGuarani } from '../../utils/money'
import type { CreateVisitInput, PaymentMethod, PaymentStatus, TimePlan } from '../../types'

const formatTimeValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

const parseTodayTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

const toTitleName = (value: string) => {
  const lowercaseWords = new Set(['de', 'del', 'la', 'las', 'los', 'y'])
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-PY')
      if (index > 0 && lowercaseWords.has(lower)) {
        return lower
      }
      return lower.charAt(0).toLocaleUpperCase('es-PY') + lower.slice(1)
    })
    .join(' ')
}

const phoneDigits = (value: string) => value.replace(/\D/g, '').slice(0, 10)

const formatPyPhone = (value: string) => {
  const digits = phoneDigits(value)
  const first = digits.slice(0, 4)
  const second = digits.slice(4, 7)
  const third = digits.slice(7, 10)
  return [first, second, third].filter(Boolean).join(' ')
}

const calculateAge = (birthDate: string) => {
  if (!birthDate) {
    return null
  }

  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const hasNotHadBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (hasNotHadBirthday) {
    age -= 1
  }
  return Math.max(0, age)
}

const getPlanPrice = (planId: TimePlan['id']) => timePlans.find((plan) => plan.id === planId)?.defaultPrice ?? null

const initialForm = () => {
  const defaultPlan = 'one-hour' as TimePlan['id']
  return {
    childName: '',
    childBirthDate: '',
    childExactAge: '',
    childGender: '',
    childNotes: '',
    customerName: '',
    customerPhone: '',
    customerRelation: '',
    childrenCount: '1',
    planId: defaultPlan,
    startedAtTime: formatTimeValue(new Date()),
    paymentStatus: 'paid' as PaymentStatus,
    paymentMethod: 'cash' as PaymentMethod,
    cardType: '' as 'debit' | 'credit' | '',
    amountCharged: String(getPlanPrice(defaultPlan) ?? ''),
    customAmount: false,
    notes: '',
  }
}

interface VisitFormProps {
  compact?: boolean
  onCancel?: () => void
  onCreated?: (visitId: string) => void
}

export function VisitForm({ compact = false, onCancel, onCreated }: VisitFormProps) {
  const [form, setForm] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedPlan = useMemo(
    () => timePlans.find((plan) => plan.id === form.planId) ?? timePlans[0],
    [form.planId],
  )
  const calculatedAge = useMemo(() => calculateAge(form.childBirthDate), [form.childBirthDate])
  const defaultAmount = selectedPlan.defaultPrice ?? null

  const setField = (field: keyof ReturnType<typeof initialForm>, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handlePlanChange = (planId: TimePlan['id']) => {
    const nextPrice = getPlanPrice(planId)
    setForm((current) => ({
      ...current,
      planId,
      amountCharged: current.customAmount ? current.amountCharged : String(nextPrice ?? ''),
    }))
  }

  const normalizeNameField = (field: 'childName' | 'customerName') => {
    setForm((current) => ({ ...current, [field]: toTitleName(current[field]) }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const childName = toTitleName(form.childName)
    const customerName = toTitleName(form.customerName)
    const normalizedPhone = phoneDigits(form.customerPhone)

    if (!childName || !customerName || !form.planId || !form.paymentStatus) {
      setError('Completa nombre del nino, responsable, plan y estado de pago.')
      return
    }

    if (form.paymentMethod === 'card' && !form.cardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }

    setIsSaving(true)

    try {
      const payload: CreateVisitInput = {
        childName,
        childBirthDate: form.childBirthDate,
        childExactAge: form.childBirthDate ? null : form.childExactAge ? Number(form.childExactAge) : null,
        childAgeCalculated: calculatedAge,
        childGender: form.childGender,
        childNotes: form.childNotes,
        customerName,
        customerPhone: normalizedPhone,
        customerRelation: form.customerRelation,
        childrenCount: Number(form.childrenCount) || 1,
        planId: selectedPlan.id,
        startedAt: parseTodayTime(form.startedAtTime),
        paymentStatus: form.paymentStatus,
        paymentMethod: form.paymentMethod,
        cardType: form.paymentMethod === 'card' ? form.cardType : '',
        amountCharged: form.amountCharged ? Number(form.amountCharged) : null,
        defaultAmount,
        customAmount: Boolean(form.customAmount),
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
          onBlur={() => normalizeNameField('childName')}
          onChange={(event) => setField('childName', event.target.value)}
          placeholder="Ej. Mateo Rios"
          value={form.childName}
        />
      </label>

      {!compact ? (
        <div className="form-inline">
          <label className="field">
            <span>Fecha de nacimiento</span>
            <input
              onChange={(event) => setField('childBirthDate', event.target.value)}
              type="date"
              value={form.childBirthDate}
            />
            {calculatedAge !== null ? <small className="field-hint">Edad calculada: {calculatedAge} años</small> : null}
          </label>
          <label className="field">
            <span>Edad exacta</span>
            <input
              disabled={Boolean(form.childBirthDate)}
              min={0}
              onChange={(event) => setField('childExactAge', event.target.value)}
              placeholder={form.childBirthDate ? 'Calculada por fecha' : 'Ej. 7'}
              type="number"
              value={form.childExactAge}
            />
          </label>
        </div>
      ) : null}

      {!compact ? (
        <label className="field">
          <span>Sexo</span>
          <select onChange={(event) => setField('childGender', event.target.value)} value={form.childGender}>
            <option value="">Sin especificar</option>
            <option value="female">Femenino</option>
            <option value="male">Masculino</option>
            <option value="other">Otro</option>
          </select>
        </label>
      ) : null}

      <label className="field">
        <span>Responsable *</span>
        <input
          onBlur={() => normalizeNameField('customerName')}
          onChange={(event) => setField('customerName', event.target.value)}
          placeholder="Nombre del responsable"
          value={form.customerName}
        />
      </label>

      <div className="form-inline">
        <label className="field">
          <span>Telefono</span>
          <input
            inputMode="numeric"
            onChange={(event) => setField('customerPhone', formatPyPhone(event.target.value))}
            placeholder="Ej. 0983 626 000"
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
        <select onChange={(event) => handlePlanChange(event.target.value as TimePlan['id'])} value={form.planId}>
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

      {form.paymentMethod === 'card' ? (
        <label className="field">
          <span>Tipo de tarjeta *</span>
          <select onChange={(event) => setField('cardType', event.target.value)} value={form.cardType}>
            <option value="">Seleccionar</option>
            <option value="debit">Debito</option>
            <option value="credit">Credito</option>
          </select>
        </label>
      ) : null}

      <div className="form-inline amount-inline">
        <label className="field">
          <span>Monto cobrado</span>
          <input
            disabled={!form.customAmount}
            min={0}
            onChange={(event) => setField('amountCharged', event.target.value)}
            type="number"
            value={form.amountCharged}
          />
          <small className="field-hint">Monto sugerido: {defaultAmount ? formatGuarani(defaultAmount) : 'Manual'}</small>
        </label>
        <label className="field inline-check amount-check">
          <input
            checked={form.customAmount}
            onChange={(event) => setField('customAmount', event.target.checked)}
            type="checkbox"
          />
          Usar monto diferente
        </label>
      </div>

      {!compact ? (
        <label className="field">
          <span>Observaciones del nino</span>
          <textarea
            onChange={(event) => setField('childNotes', event.target.value)}
            placeholder="Alergias, cuidados, cumpleanos..."
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

      <div className="module-actions">
        {onCancel ? (
          <button className="button ghost" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="button primary action-button" disabled={isSaving} type="submit">
          <Plus size={18} />
          {isSaving ? 'Registrando...' : 'Registrar ingreso'}
        </button>
      </div>
    </form>
  )
}

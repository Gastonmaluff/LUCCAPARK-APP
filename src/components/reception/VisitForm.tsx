import { Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { timePlans } from '../../config/timePlans'
import { createNormalVisit } from '../../services/visitService'
import { calculateAgeYears, formatAgeLabel, formatBirthDateInput, parseBirthDateDisplay } from '../../utils/birthDate'
import { formatGuarani } from '../../utils/money'
import { formatParaguayanPhone, formatPersonName, phoneDigits } from '../../utils/textFormat'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'
import type { CreateVisitInput, PaymentMethod, PaymentStatus, TimePlan } from '../../types'

const formatTimeValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

const parseTodayTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

const getPlanPrice = (planId: TimePlan['id']) => timePlans.find((plan) => plan.id === planId)?.defaultPrice ?? null

const initialForm = () => {
  const defaultPlan = 'one-hour' as TimePlan['id']
  return {
    childName: '',
    childBirthDateInput: '',
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
  const [pendingPaidEntry, setPendingPaidEntry] = useState<CreateVisitInput | null>(null)
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [entryCardType, setEntryCardType] = useState<'debit' | 'credit' | ''>('')

  const selectedPlan = useMemo(
    () => timePlans.find((plan) => plan.id === form.planId) ?? timePlans[0],
    [form.planId],
  )
  const birthDateResult = useMemo(() => parseBirthDateDisplay(form.childBirthDateInput), [form.childBirthDateInput])
  const calculatedAge = useMemo(() => calculateAgeYears(birthDateResult.iso), [birthDateResult.iso])
  const ageLabel = formatAgeLabel(calculatedAge)
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
    setForm((current) => ({ ...current, [field]: formatPersonName(current[field]) }))
  }

  const handleBirthDateChange = (value: string) => {
    const formatted = formatBirthDateInput(value)
    setForm((current) => ({
      ...current,
      childBirthDateInput: formatted,
      childExactAge: formatted ? '' : current.childExactAge,
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const childName = formatPersonName(form.childName)
    const customerName = formatPersonName(form.customerName)
    const normalizedPhone = phoneDigits(form.customerPhone)
    const birthDate = birthDateResult.iso

    if (!childName || !customerName || !form.planId || !form.paymentStatus) {
      setError('Completa nombre del nino, responsable, plan y estado de pago.')
      return
    }

    if (birthDateResult.error) {
      setError(birthDateResult.error)
      return
    }

    const payload: CreateVisitInput = {
        childName,
        childBirthDate: birthDate,
        childExactAge: birthDate ? null : form.childExactAge ? Number(form.childExactAge) : null,
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
        paymentMethod: form.paymentStatus === 'paid' ? '' : form.paymentMethod,
        cardType: '',
        amountCharged: form.amountCharged ? Number(form.amountCharged) : null,
        defaultAmount,
        customAmount: Boolean(form.customAmount),
        notes: form.notes,
      }

    if (form.paymentStatus === 'paid') {
      setPendingPaidEntry(payload)
      setEntryPaymentMethod('')
      setEntryCardType('')
      return
    }

    setIsSaving(true)

    try {
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

  const confirmPaidEntry = async () => {
    if (!pendingPaidEntry) return
    if (!entryPaymentMethod) {
      setError('Selecciona un metodo de pago para confirmar el ingreso.')
      return
    }
    if (entryPaymentMethod === 'card' && !entryCardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const visitId = await createNormalVisit({
        ...pendingPaidEntry,
        paymentMethod: entryPaymentMethod,
        cardType: entryPaymentMethod === 'card' ? entryCardType : '',
      })
      setPendingPaidEntry(null)
      setSuccess('Cobro e ingreso registrados correctamente.')
      setForm(initialForm())
      onCreated?.(visitId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo registrar el ingreso.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
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
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => handleBirthDateChange(event.target.value)}
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
              onChange={(event) => setField('childExactAge', event.target.value)}
              placeholder={birthDateResult.iso ? '' : 'Ej. 7'}
              type={birthDateResult.iso ? 'text' : 'number'}
              value={birthDateResult.iso ? ageLabel : form.childExactAge}
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
            onChange={(event) => setField('customerPhone', formatParaguayanPhone(event.target.value))}
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

      <section className="payment-status-panel" aria-label="Estado de pago">
        <strong>ESTADO DE PAGO</strong>
        <div className="payment-status-options">
          <button
            className={form.paymentStatus === 'paid' ? 'active paid' : 'paid'}
            onClick={() => setField('paymentStatus', 'paid')}
            type="button"
          >
            Pagado al entrar
          </button>
          <button
            className={form.paymentStatus === 'payAtExit' ? 'active pay-at-exit' : 'pay-at-exit'}
            onClick={() => setField('paymentStatus', 'payAtExit')}
            type="button"
          >
            Paga al salir
          </button>
        </div>
      </section>

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
    {pendingPaidEntry ? (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card checkout-modal" role="dialog" aria-modal="true">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cobro al ingresar</p>
              <h2>Confirmar cobro e ingreso</h2>
              <p className="muted">
                {pendingPaidEntry.childName} · Responsable: {pendingPaidEntry.customerName}
              </p>
            </div>
          </div>
          <div className="checkout-block">
            <div className="checkout-line">
              <span>Parque · {selectedPlan.name}</span>
              <strong>{formatGuarani(pendingPaidEntry.amountCharged ?? pendingPaidEntry.defaultAmount ?? 0)}</strong>
            </div>
          </div>
          <div className="checkout-total">
            <span>Total a cobrar</span>
            <strong>{formatGuarani(pendingPaidEntry.amountCharged ?? pendingPaidEntry.defaultAmount ?? 0)}</strong>
          </div>
          <PaymentMethodSelector
            cardType={entryCardType}
            disabled={isSaving}
            onCardTypeChange={setEntryCardType}
            onPaymentMethodChange={setEntryPaymentMethod}
            paymentMethod={entryPaymentMethod}
          />
          <div className="module-actions">
            <button className="button ghost" disabled={isSaving} onClick={() => setPendingPaidEntry(null)} type="button">
              Cancelar
            </button>
            <button className="button primary" disabled={isSaving || !entryPaymentMethod || (entryPaymentMethod === 'card' && !entryCardType)} onClick={confirmPaidEntry} type="button">
              Confirmar cobro e ingreso
            </button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  )
}

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { saveExpense } from '../../services/expenseService'
import { getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'
import type { ExpenseCategory, LuccaEvent, PaymentMethod } from '../../types'

const categories: Array<[ExpenseCategory, string]> = [
  ['canteen_purchase', 'Cantina / compra de productos'],
  ['decoration', 'Decoración'],
  ['cleaning', 'Limpieza'],
  ['maintenance', 'Mantenimiento'],
  ['wages', 'Sueldos / jornales'],
  ['services', 'Servicios'],
  ['operations', 'Compra operativa'],
  ['other', 'Otro'],
]

const parseMoney = (value: string) => Number(value.replace(/\D/g, '') || 0)
const formatMoney = (value: number) => (value > 0 ? new Intl.NumberFormat('es-PY').format(value) : '')

interface ExpenseModalProps {
  events: LuccaEvent[]
  initialEvent?: LuccaEvent | null
  onClose: () => void
  onSaved?: () => void
}

export function ExpenseModal({ events, initialEvent, onClose, onSaved }: ExpenseModalProps) {
  const [date, setDate] = useState(getLocalDateKey())
  const [category, setCategory] = useState<ExpenseCategory>('operations')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [cardType, setCardType] = useState<'debit' | 'credit' | ''>('')
  const [type, setType] = useState<'general' | 'event'>(initialEvent ? 'event' : 'general')
  const [eventId, setEventId] = useState(initialEvent?.id ?? '')
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!receiptFile) {
      setPreviewUrl('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(receiptFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [receiptFile])

  const selectedEvent = events.find((event) => event.id === eventId) ?? initialEvent ?? null

  const save = async () => {
    if (!description.trim() || amount <= 0 || !paymentMethod) {
      setError('Completá descripción, monto y método de pago.')
      return
    }
    if (paymentMethod === 'card' && !cardType) {
      setError('Seleccioná si la tarjeta es débito o crédito.')
      return
    }
    if (type === 'event' && !selectedEvent) {
      setError('Seleccioná el evento asociado.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      await saveExpense({
        amount,
        cardType,
        category,
        date,
        description,
        eventId: type === 'event' ? selectedEvent?.id : '',
        eventName: type === 'event' ? selectedEvent?.title : '',
        notes,
        paymentMethod,
        receiptFile,
        type,
      })
      onSaved?.()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el gasto.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card expense-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Egreso</p>
            <h2>Registrar gasto</h2>
          </div>
          <button className="icon-button" disabled={isSaving} onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {error ? <div className="form-alert error">{error}</div> : null}
        <div className="form-grid compact-form">
          <label className="field">
            <span>Fecha del gasto</span>
            <input disabled={isSaving} onChange={(event) => setDate(event.target.value)} type="date" value={date} />
          </label>
          <label className="field">
            <span>Categoría</span>
            <select disabled={isSaving} onChange={(event) => setCategory(event.target.value as ExpenseCategory)} value={category}>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Descripción *</span>
            <input disabled={isSaving} onChange={(event) => setDescription(event.target.value)} value={description} />
          </label>
          <label className="field">
            <span>Monto *</span>
            <input disabled={isSaving} inputMode="numeric" onChange={(event) => setAmount(parseMoney(event.target.value))} placeholder="Ej. 120.000" value={formatMoney(amount)} />
            {amount > 0 ? <small className="field-hint">{formatGuarani(amount)}</small> : null}
          </label>
        </div>
        <PaymentMethodSelector cardType={cardType} disabled={isSaving} onCardTypeChange={setCardType} onPaymentMethodChange={setPaymentMethod} paymentMethod={paymentMethod} />
        <div className="payment-status-options expense-type-options">
          <button className={type === 'general' ? 'active paid' : 'paid'} disabled={isSaving} onClick={() => setType('general')} type="button">
            Gasto general del negocio
          </button>
          <button className={type === 'event' ? 'active pay-at-exit' : 'pay-at-exit'} disabled={isSaving} onClick={() => setType('event')} type="button">
            Gasto asociado a un evento
          </button>
        </div>
        {type === 'event' ? (
          <label className="field">
            <span>Evento asociado</span>
            <select disabled={isSaving || Boolean(initialEvent)} onChange={(event) => setEventId(event.target.value)} value={eventId}>
              <option value="">Seleccionar evento</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {event.date}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field">
          <span>Foto de factura o comprobante</span>
          <input accept="image/png,image/jpeg,image/webp,application/pdf" disabled={isSaving} onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} type="file" />
        </label>
        {previewUrl ? (
          <div className="product-image-preview">
            <span>Vista previa del comprobante</span>
            <img alt="Comprobante" src={previewUrl} />
          </div>
        ) : null}
        <label className="field">
          <span>Observaciones</span>
          <textarea disabled={isSaving} onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} />
        </label>
        <div className="modal-actions">
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" disabled={isSaving} onClick={save} type="button">
            {isSaving ? 'Guardando...' : 'Guardar gasto'}
          </button>
        </div>
      </section>
    </div>
  )
}

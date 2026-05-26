import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'
import { registerEventPayment } from '../../services/eventService'
import { formatGuarani } from '../../utils/money'
import type { LuccaEvent, PaymentMethod, PaymentRecord } from '../../types'

type EventPaymentConcept = 'deposit' | 'partial' | 'balance' | 'other'

interface EventPaymentModalProps {
  event: LuccaEvent
  existingPayments?: PaymentRecord[]
  onClose: () => void
  onDone?: () => void
}

const conceptLabel: Record<EventPaymentConcept, string> = {
  balance: 'Saldo final',
  deposit: 'Sena',
  other: 'Otro',
  partial: 'Pago parcial',
}

const formatNumberInput = (value: string) => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-PY')
}

const parseAmount = (value: string) => Number(value.replace(/\D/g, '') || 0)

export function EventPaymentModal({ event, existingPayments = [], onClose, onDone }: EventPaymentModalProps) {
  const alreadyPaid = useMemo(() => {
    const paymentsTotal = existingPayments.reduce((sum, payment) => sum + (payment.eventAmountPaid || payment.totalPaid || 0), 0)
    return Math.max(paymentsTotal, event.eventPaidAmount ?? 0)
  }, [event.eventPaidAmount, existingPayments])
  const totalAmount = event.totalAmount ?? 0
  const pendingAmount = Math.max(0, totalAmount - alreadyPaid)
  const [concept, setConcept] = useState<EventPaymentConcept>(pendingAmount > 0 && alreadyPaid > 0 ? 'balance' : 'deposit')
  const [amount, setAmount] = useState(pendingAmount > 0 ? pendingAmount.toLocaleString('es-PY') : '')
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [cardType, setCardType] = useState<'debit' | 'credit' | ''>('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const numericAmount = parseAmount(amount)

  const savePayment = async () => {
    setError('')
    if (numericAmount <= 0) {
      setError('Ingresa un monto recibido mayor a cero.')
      return
    }
    if (pendingAmount > 0 && numericAmount > pendingAmount && !window.confirm('El monto supera el saldo pendiente. Queres registrarlo igual?')) {
      return
    }
    if (!paymentMethod) {
      setError('Selecciona el metodo de pago.')
      return
    }
    if (paymentMethod === 'card' && !cardType) {
      setError('Selecciona si la tarjeta es debito o credito.')
      return
    }

    setIsSaving(true)
    try {
      await registerEventPayment({
        amount: numericAmount,
        cardType,
        concept,
        eventId: event.id,
        notes,
        paymentMethod,
      })
      onDone?.()
      onClose()
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'No se pudo registrar el cobro.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card event-payment-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Registrar cobro de evento</p>
            <h2>{event.title}</h2>
            <p>{event.customerName}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="event-payment-summary">
          <span><small>Total contratado</small><strong>{totalAmount ? formatGuarani(totalAmount) : 'Sin monto'}</strong></span>
          <span><small>Total cobrado</small><strong>{formatGuarani(alreadyPaid)}</strong></span>
          <span><small>Saldo pendiente</small><strong>{formatGuarani(pendingAmount)}</strong></span>
        </div>

        {error ? <div className="form-alert error">{error}</div> : null}

        <div className="event-payment-concepts">
          {(Object.keys(conceptLabel) as EventPaymentConcept[]).map((key) => (
            <button className={concept === key ? 'active' : ''} disabled={isSaving} key={key} onClick={() => setConcept(key)} type="button">
              {conceptLabel[key]}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Monto recibido</span>
          <input
            inputMode="numeric"
            onChange={(inputEvent) => setAmount(formatNumberInput(inputEvent.target.value))}
            placeholder="Ej. 500.000"
            value={amount}
          />
        </label>

        <PaymentMethodSelector
          cardType={cardType}
          disabled={isSaving}
          onCardTypeChange={setCardType}
          onPaymentMethodChange={setPaymentMethod}
          paymentMethod={paymentMethod}
        />

        <label className="field">
          <span>Observacion opcional</span>
          <textarea onChange={(inputEvent) => setNotes(inputEvent.target.value)} rows={3} value={notes} />
        </label>

        <div className="modal-actions">
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" disabled={isSaving} onClick={savePayment} type="button">
            {isSaving ? 'Registrando...' : 'Confirmar cobro'}
          </button>
        </div>
      </section>
    </div>
  )
}

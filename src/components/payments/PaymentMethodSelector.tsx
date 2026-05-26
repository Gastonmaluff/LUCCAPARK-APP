import type { PaymentMethod } from '../../types'

export const paymentMethods: Array<Exclude<PaymentMethod, ''>> = ['cash', 'transfer', 'card', 'qr', 'other']

export const paymentLabel: Record<Exclude<PaymentMethod, ''>, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
}

interface PaymentMethodSelectorProps {
  cardType: 'debit' | 'credit' | ''
  disabled?: boolean
  paymentMethod: Exclude<PaymentMethod, ''> | ''
  onCardTypeChange: (cardType: 'debit' | 'credit' | '') => void
  onPaymentMethodChange: (method: Exclude<PaymentMethod, ''>) => void
}

export function PaymentMethodSelector({
  cardType,
  disabled,
  onCardTypeChange,
  onPaymentMethodChange,
  paymentMethod,
}: PaymentMethodSelectorProps) {
  return (
    <div className="checkout-method-section">
      <h3>Metodo de pago</h3>
      <div className="checkout-method-grid">
        {paymentMethods.map((method) => (
          <button
            className={paymentMethod === method ? 'checkout-method-button active' : 'checkout-method-button'}
            disabled={disabled}
            key={method}
            onClick={() => {
              onPaymentMethodChange(method)
              if (method !== 'card') {
                onCardTypeChange('')
              }
            }}
            type="button"
          >
            {paymentLabel[method]}
          </button>
        ))}
      </div>
      {paymentMethod === 'card' ? (
        <div className="checkout-card-type">
          <button className={cardType === 'debit' ? 'active' : ''} disabled={disabled} onClick={() => onCardTypeChange('debit')} type="button">
            Debito
          </button>
          <button className={cardType === 'credit' ? 'active' : ''} disabled={disabled} onClick={() => onCardTypeChange('credit')} type="button">
            Credito
          </button>
        </div>
      ) : null}
    </div>
  )
}

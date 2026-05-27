import type { PaymentMethod } from '../../types'
import { paymentLabel, paymentMethods } from './paymentOptions'

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
      <h3>Método de pago</h3>
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
            Débito
          </button>
          <button className={cardType === 'credit' ? 'active' : ''} disabled={disabled} onClick={() => onCardTypeChange('credit')} type="button">
            Crédito
          </button>
        </div>
      ) : null}
    </div>
  )
}

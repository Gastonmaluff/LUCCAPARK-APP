import type { PaymentMethod } from '../../types'

export const paymentMethods: Array<Exclude<PaymentMethod, ''>> = ['cash', 'transfer', 'card', 'qr', 'other']

export const paymentLabel: Record<Exclude<PaymentMethod, ''>, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
}

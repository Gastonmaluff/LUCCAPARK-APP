import { StatusPill } from '../StatusPill'
import type { PaymentStatus } from '../../types'

const paymentLabel: Record<PaymentStatus, string> = {
  paid: 'Pagado',
  payAtExit: 'Paga al salir',
  pending: 'Pendiente',
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <StatusPill tone={status === 'paid' ? 'paid' : status === 'payAtExit' ? 'warning' : 'danger'}>
      {paymentLabel[status]}
    </StatusPill>
  )
}

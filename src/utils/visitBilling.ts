import type { ActiveVisit, CanteenOrder } from '../types'

export interface VisitBillingSummary {
  parkChargeAmount: number
  pendingParkAmount: number
  paidParkAmount: number
  pendingCanteenAmount: number
  paidCanteenAmount: number
  totalPendingAmount: number
  totalPaidAmount: number
  openCanteenOrders: CanteenOrder[]
  paidCanteenOrders: CanteenOrder[]
  relatedCanteenOrders: CanteenOrder[]
}

export const getVisitParkChargeAmount = (visit: Pick<ActiveVisit, 'amountCharged' | 'defaultAmount' | 'parkChargeAmount'>) =>
  Number(visit.parkChargeAmount ?? visit.amountCharged ?? visit.defaultAmount ?? 0)

export const getVisitBillingSummary = (visit: ActiveVisit, orders: CanteenOrder[] = []): VisitBillingSummary => {
  const relatedCanteenOrders = orders.filter((order) => order.visitId === visit.id && order.status !== 'cancelled')
  const openCanteenOrders = relatedCanteenOrders.filter((order) => order.status === 'open' || order.paymentStatus !== 'paid')
  const paidCanteenOrders = relatedCanteenOrders.filter((order) => order.status === 'paid' || order.paymentStatus === 'paid')
  const parkChargeAmount = getVisitParkChargeAmount(visit)
  const pendingParkAmount = visit.paymentStatus === 'paid' ? 0 : parkChargeAmount
  const paidParkAmount = visit.paymentStatus === 'paid' ? parkChargeAmount : 0
  const pendingCanteenAmount = openCanteenOrders.reduce((sum, order) => sum + order.total, 0)
  const paidCanteenAmount = paidCanteenOrders.reduce((sum, order) => sum + order.total, 0)

  return {
    parkChargeAmount,
    pendingParkAmount,
    paidParkAmount,
    pendingCanteenAmount,
    paidCanteenAmount,
    totalPendingAmount: pendingParkAmount + pendingCanteenAmount,
    totalPaidAmount: paidParkAmount + paidCanteenAmount,
    openCanteenOrders,
    paidCanteenOrders,
    relatedCanteenOrders,
  }
}

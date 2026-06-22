import type { ActiveVisit, CanteenOrder } from '../types'
import { getOrdersForVisit, getOrdersForVisitGroup } from './visitGroups'

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
  const relatedCanteenOrders = getOrdersForVisit(orders, visit)
  const openCanteenOrders = relatedCanteenOrders.filter((order) => order.status === 'open' || order.paymentStatus !== 'paid')
  const paidCanteenOrders = relatedCanteenOrders.filter((order) => order.status === 'paid' || order.paymentStatus === 'paid')
  const parkChargeAmount = getVisitParkChargeAmount(visit)
  const paidParkAmount =
    visit.paidParkAmount === null || visit.paidParkAmount === undefined
      ? visit.paymentStatus === 'paid'
        ? parkChargeAmount
        : 0
      : Number(visit.paidParkAmount)
  const pendingParkAmount = Math.max(0, parkChargeAmount - paidParkAmount)
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

export const getVisitGroupBillingSummary = (visits: ActiveVisit[], orders: CanteenOrder[] = []): VisitBillingSummary => {
  const relatedCanteenOrders = getOrdersForVisitGroup(orders, visits)
  const openCanteenOrders = relatedCanteenOrders.filter((order) => order.status === 'open' || order.paymentStatus !== 'paid')
  const paidCanteenOrders = relatedCanteenOrders.filter((order) => order.status === 'paid' || order.paymentStatus === 'paid')
  const parkChargeAmount = visits.reduce((sum, visit) => sum + getVisitParkChargeAmount(visit), 0)
  const paidParkAmount = visits.reduce((sum, visit) => {
    const visitParkCharge = getVisitParkChargeAmount(visit)
    const visitPaid =
      visit.paidParkAmount === null || visit.paidParkAmount === undefined
        ? visit.paymentStatus === 'paid'
          ? visitParkCharge
          : 0
        : Number(visit.paidParkAmount)
    return sum + visitPaid
  }, 0)
  const pendingParkAmount = Math.max(0, parkChargeAmount - paidParkAmount)
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

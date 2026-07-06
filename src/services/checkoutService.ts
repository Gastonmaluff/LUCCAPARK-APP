import { callSecureFunction } from './secureFunctions'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../types'

export interface UnlimitedCheckoutAdjustment {
  finalAmount: number
  reason?: string
}

export type UnlimitedCheckoutAdjustments = Record<string, UnlimitedCheckoutAdjustment>

interface ConsolidatedCheckoutInput {
  visit: ActiveVisit
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisit?: boolean
  unlimitedAdjustments?: UnlimitedCheckoutAdjustments
}

interface ConsolidatedGroupCheckoutInput {
  visits: ActiveVisit[]
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisits?: boolean
  unlimitedAdjustments?: UnlimitedCheckoutAdjustments
}

export const checkoutVisitBalance = async ({
  cardType = '',
  finishVisit = false,
  paymentMethod,
  source,
  visit,
  unlimitedAdjustments = {},
}: ConsolidatedCheckoutInput) => {
  const adjustmentKey = JSON.stringify(unlimitedAdjustments)
  await callSecureFunction(
    'checkoutVisitGroup',
    {
      visitId: visit.id,
      visitIds: [visit.id],
      paymentMethod,
      cardType,
      source,
      finishVisit,
      unlimitedAdjustments,
    },
    `checkout-visit:${visit.id}:${paymentMethod}:${cardType}:${finishVisit}:${adjustmentKey}`,
  )
}

export const checkoutVisitGroupBalance = async ({
  cardType = '',
  finishVisits = false,
  paymentMethod,
  source,
  visits,
  unlimitedAdjustments = {},
}: ConsolidatedGroupCheckoutInput) => {
  const groupEntryId = visits.find((visit) => visit.groupEntryId)?.groupEntryId ?? ''
  const visitIds = visits.map((visit) => visit.id)
  const adjustmentKey = JSON.stringify(unlimitedAdjustments)
  await callSecureFunction(
    'checkoutVisitGroup',
    {
      groupEntryId,
      visitId: visitIds[0] ?? '',
      visitIds,
      paymentMethod,
      cardType,
      source,
      finishVisits,
      unlimitedAdjustments,
    },
    `checkout-group:${groupEntryId || visitIds.join(',')}:${paymentMethod}:${cardType}:${finishVisits}:${adjustmentKey}`,
  )
}

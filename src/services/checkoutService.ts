import { callSecureFunction } from './secureFunctions'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../types'

interface ConsolidatedCheckoutInput {
  visit: ActiveVisit
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisit?: boolean
}

interface ConsolidatedGroupCheckoutInput {
  visits: ActiveVisit[]
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisits?: boolean
}

export const checkoutVisitBalance = async ({
  cardType = '',
  finishVisit = false,
  paymentMethod,
  source,
  visit,
}: ConsolidatedCheckoutInput) => {
  await callSecureFunction(
    'checkoutVisitGroup',
    {
      visitId: visit.id,
      visitIds: [visit.id],
      paymentMethod,
      cardType,
      source,
      finishVisit,
    },
    `checkout-visit:${visit.id}:${paymentMethod}:${cardType}:${finishVisit}`,
  )
}

export const checkoutVisitGroupBalance = async ({
  cardType = '',
  finishVisits = false,
  paymentMethod,
  source,
  visits,
}: ConsolidatedGroupCheckoutInput) => {
  const groupEntryId = visits.find((visit) => visit.groupEntryId)?.groupEntryId ?? ''
  const visitIds = visits.map((visit) => visit.id)
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
    },
    `checkout-group:${groupEntryId || visitIds.join(',')}:${paymentMethod}:${cardType}:${finishVisits}`,
  )
}

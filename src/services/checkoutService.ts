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

interface RegisterPartialPaymentInput {
  visits: ActiveVisit[]
  amount: number
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  target: 'park' | 'general'
  note?: string
  /** Identificador unico de este intento de pago (para idempotencia; reintentos por doble clic reutilizan la misma clave). */
  clientPaymentId: string
}

export interface PartialPaymentResult {
  paymentId: string
  target: 'park' | 'general'
  amountPaid: number
  parkAmountPaid: number
  canteenAmountPaid: number
  balanceBefore: number
  balanceAfter: number
  visitIds: string[]
  orderIds: string[]
}

/**
 * Registra un pago parcial sobre una cuenta abierta (visita o grupo) sin cerrarla ni finalizar la visita.
 * Aplica el pago de forma determinista en el backend (parque primero, luego cantina por antiguedad).
 */
export const registerPartialPayment = async ({
  amount,
  cardType = '',
  clientPaymentId,
  note = '',
  paymentMethod,
  target,
  visits,
}: RegisterPartialPaymentInput): Promise<PartialPaymentResult> => {
  const groupEntryId = visits.find((visit) => visit.groupEntryId)?.groupEntryId ?? ''
  const visitIds = visits.map((visit) => visit.id)
  return callSecureFunction<PartialPaymentResult>(
    'registerPartialPaymentSecure',
    {
      groupEntryId,
      visitId: visitIds[0] ?? '',
      visitIds,
      amount,
      paymentMethod,
      cardType,
      target,
      note,
      clientPaymentId,
    },
    `partial-payment:${clientPaymentId}`,
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

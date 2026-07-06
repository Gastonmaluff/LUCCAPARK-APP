import type { ActiveVisit } from '../types'

export interface UnlimitedPricingPreview {
  elapsedMinutes: number
  billableHours: number
  suggestedAmount: number
  hourlyRate: number
}

export const isPendingUnlimitedVisit = (visit: Pick<ActiveVisit, 'isUnlimited' | 'parkPaymentStatus' | 'paymentStatus' | 'paidParkAmount'>) =>
  visit.isUnlimited && visit.parkPaymentStatus !== 'paid' && visit.paymentStatus !== 'paid' && Number(visit.paidParkAmount ?? 0) <= 0

export const getUnlimitedBillableHours = (startedAt: Date, endedAt = new Date()) => {
  const elapsedMinutes = Number.isFinite(startedAt.getTime())
    ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000))
    : 0
  return {
    elapsedMinutes,
    billableHours: Math.max(1, Math.floor(elapsedMinutes / 60)),
  }
}

export const getUnlimitedPricingPreview = (
  visit: Pick<ActiveVisit, 'startedAt'>,
  hourlyRate: number | null | undefined,
  endedAt = new Date(),
): UnlimitedPricingPreview | null => {
  if (!hourlyRate || hourlyRate <= 0) return null
  const elapsed = getUnlimitedBillableHours(visit.startedAt, endedAt)
  return {
    ...elapsed,
    hourlyRate,
    suggestedAmount: elapsed.billableHours * hourlyRate,
  }
}

export const formatElapsedMinutes = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.floor(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  if (hours <= 0) return `${remainder} min`
  if (remainder === 0) return `${hours} h`
  return `${hours} h ${remainder} min`
}

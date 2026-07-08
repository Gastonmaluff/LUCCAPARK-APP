import { getTimePlanById } from '../config/timePlans'
import type { ActiveVisit, ChargeVisitInput, CreateVisitInput } from '../types'
import { formatPersonName, normalizeWhitespace } from '../utils/textFormat'
import { getExpectedEndAt, getRealDurationMinutes } from '../utils/visitTime'

const activeVisitsKey = 'lucca:activeVisits'
const visitsHistoryKey = 'lucca:visits'
const channelName = 'lucca-visits'

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName)
const listeners = new Set<(visits: ActiveVisit[]) => void>()

const optionalText = (value?: string) => {
  const normalized = normalizeWhitespace(value ?? '')
  return normalized.length > 0 ? normalized : ''
}

const normalizeDocumentNumber = (value?: string) => String(value ?? '').replace(/\D/g, '')

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const reviveVisit = (visit: ActiveVisit): ActiveVisit => ({
  ...visit,
  startedAt: new Date(visit.startedAt),
  expectedEndAt: visit.expectedEndAt ? new Date(visit.expectedEndAt) : null,
  timeExtensions: (visit.timeExtensions ?? []).map((extension) => ({
    ...extension,
    previousEndTime: extension.previousEndTime ? new Date(extension.previousEndTime) : null,
    newEndTime: new Date(extension.newEndTime),
    createdAt: extension.createdAt ? new Date(extension.createdAt) : null,
  })),
  createdAt: visit.createdAt ? new Date(visit.createdAt) : null,
  updatedAt: visit.updatedAt ? new Date(visit.updatedAt) : null,
})

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const writeJson = <T,>(key: string, value: T) => {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export const getLocalActiveVisits = () =>
  readJson<ActiveVisit[]>(activeVisitsKey, [])
    .map(reviveVisit)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

const emit = () => {
  const visits = getLocalActiveVisits()
  listeners.forEach((listener) => listener(visits))
  channel?.postMessage('visits-updated')
}

channel?.addEventListener('message', emit)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === activeVisitsKey) {
      emit()
    }
  })
}

export const subscribeLocalActiveVisits = (listener: (visits: ActiveVisit[]) => void) => {
  listeners.add(listener)
  listener(getLocalActiveVisits())

  return () => {
    listeners.delete(listener)
  }
}

export const createLocalNormalVisit = async (input: CreateVisitInput) => {
  const plan = getTimePlanById(input.planId)
  const startedAt = input.startedAt
  const expectedEndAt = getExpectedEndAt(startedAt, plan.durationMinutes, plan.isUnlimited)
  const now = new Date()
  const visitId = makeId('visit')
  const customerId = makeId('customer')
  const childId = makeId('child')

  const visit: ActiveVisit = {
    id: visitId,
    groupEntryId: input.groupEntryId,
    childId,
    childName: formatPersonName(input.childName),
    childBirthDate: optionalText(input.childBirthDate),
    childAgeRange: optionalText(input.childAgeRange),
    childExactAge: input.childExactAge ?? null,
    childAgeCalculated: input.childAgeCalculated ?? null,
    childGender: optionalText(input.childGender),
    customerId,
    customerName: formatPersonName(input.customerName),
    customerPhone: optionalText(input.customerPhone),
    customerRelation: optionalText(input.customerRelation),
    customerDocumentNumber: optionalText(input.customerDocumentNumber),
    customerDocumentNumberNormalized: normalizeDocumentNumber(input.customerDocumentNumber),
    guardianId: customerId,
    guardianDocumentNumber: optionalText(input.customerDocumentNumber),
    guardianDocumentNumberNormalized: normalizeDocumentNumber(input.customerDocumentNumber),
    childrenCount: input.childrenCount,
    planId: plan.id,
    planName: plan.name,
    durationMinutes: plan.durationMinutes,
    isUnlimited: plan.isUnlimited,
    startedAt,
    expectedEndAt,
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod ?? '',
    amountCharged: input.amountCharged ?? null,
    parkChargeAmount: input.amountCharged ?? input.defaultAmount ?? plan.defaultPrice ?? null,
    paidParkAmount: input.paymentStatus === 'paid' ? input.amountCharged ?? input.defaultAmount ?? plan.defaultPrice ?? null : 0,
    extensionChargeAmount: 0,
    parkPaymentStatus: input.paymentStatus === 'paid' ? 'paid' : 'pending',
    parkPaidAt: input.paymentStatus === 'paid' ? startedAt : null,
    parkPaymentMethod: input.paymentStatus === 'paid' ? input.paymentMethod ?? '' : '',
    defaultAmount: input.defaultAmount ?? plan.defaultPrice ?? null,
    customAmount: Boolean(input.customAmount),
    promotionalAdjustment: input.promotionalAdjustment
      ? {
          type: input.promotionalAdjustment.type === 'percentage' ? 'percentage' : 'final_amount',
          originalAmount: input.defaultAmount ?? plan.defaultPrice ?? 0,
          percentage: input.promotionalAdjustment.percentage ?? null,
          discountAmount: Number(input.defaultAmount ?? plan.defaultPrice ?? 0) - Number(input.amountCharged ?? 0),
          finalAmount: Number(input.amountCharged ?? 0),
          reason: input.promotionalAdjustment.reason,
          adjustedBy: 'local',
          adjustedByName: 'Local',
          adjustedByRole: 'recepcion',
          adjustedAt: now,
          sourceIntegrity: 'secure_backend',
        }
      : null,
    notes: optionalText(input.notes),
    timeExtensions: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: 'local',
    updatedBy: 'local',
  }

  const activeVisits = getLocalActiveVisits()
  writeJson(activeVisitsKey, [visit, ...activeVisits])
  writeJson(visitsHistoryKey, [visit, ...readJson<unknown[]>(visitsHistoryKey, [])])
  emit()

  return visitId
}

export const chargeLocalVisit = async (visit: ActiveVisit, input: ChargeVisitInput) => {
  const updatedVisit = {
    ...visit,
    paymentStatus: 'paid' as const,
    paymentMethod: input.paymentMethod,
    amountCharged: input.amountCharged ?? visit.amountCharged ?? null,
    paidParkAmount: input.amountCharged ?? visit.amountCharged ?? visit.parkChargeAmount ?? null,
    parkPaymentStatus: 'paid' as const,
    parkPaidAt: new Date(),
    parkPaymentMethod: input.paymentMethod,
    updatedAt: new Date(),
    updatedBy: 'local',
  }

  const activeVisits = getLocalActiveVisits().map((item) => (item.id === visit.id ? updatedVisit : item))
  writeJson(activeVisitsKey, activeVisits)
  writeJson(
    visitsHistoryKey,
    readJson<ActiveVisit[]>(visitsHistoryKey, []).map((item) => (item.id === visit.id ? updatedVisit : item)),
  )
  emit()
}

export const extendLocalVisitTime = async (visit: ActiveVisit, input: { minutes: 30 | 60; amount: number }) => {
  const now = new Date()
  const baseEndTime = visit.expectedEndAt && visit.expectedEndAt.getTime() > now.getTime() ? visit.expectedEndAt : now
  const newEndTime = new Date(baseEndTime.getTime() + input.minutes * 60 * 1000)
  const currentParkCharge = Number(visit.parkChargeAmount ?? visit.amountCharged ?? visit.defaultAmount ?? 0)
  const extensionRecord = {
    id: makeId('extension'),
    type: 'time_extension' as const,
    minutes: input.minutes,
    amount: input.amount,
    previousEndTime: visit.expectedEndAt ?? null,
    newEndTime,
    createdAt: now,
    createdBy: 'local',
    createdByName: 'Local',
    createdByRole: 'recepcion' as const,
    pricingSnapshot: {
      amount: input.amount,
      key: input.minutes === 30 ? 'extension30MinutePrice' as const : 'extension60MinutePrice' as const,
      source: 'settings/visitPricing' as const,
    },
  }
  const updatedVisit: ActiveVisit = {
    ...visit,
    expectedEndAt: newEndTime,
    durationMinutes: visit.durationMinutes === null ? null : Number(visit.durationMinutes ?? 0) + input.minutes,
    parkChargeAmount: currentParkCharge + input.amount,
    extensionChargeAmount: Number(visit.extensionChargeAmount ?? 0) + input.amount,
    paymentStatus: 'payAtExit',
    parkPaymentStatus: 'pending',
    timeExtensions: [...(visit.timeExtensions ?? []), extensionRecord],
    updatedAt: now,
    updatedBy: 'local',
  }

  writeJson(
    activeVisitsKey,
    getLocalActiveVisits().map((item) => (item.id === visit.id ? updatedVisit : item)),
  )
  writeJson(
    visitsHistoryKey,
    readJson<ActiveVisit[]>(visitsHistoryKey, []).map((item) => (item.id === visit.id ? updatedVisit : item)),
  )
  emit()
}

export const finishLocalVisit = async (visit: ActiveVisit) => {
  const endedAt = new Date()
  const finishedVisit = {
    ...visit,
    status: 'finished',
    endedAt,
    realDurationMinutes: getRealDurationMinutes(visit.startedAt, endedAt),
    updatedAt: endedAt,
    updatedBy: 'local',
  }

  writeJson(
    activeVisitsKey,
    getLocalActiveVisits().filter((item) => item.id !== visit.id),
  )
  writeJson(
    visitsHistoryKey,
    readJson<unknown[]>(visitsHistoryKey, []).map((item) =>
      (item as { id?: string }).id === visit.id ? finishedVisit : item,
    ),
  )
  emit()
}

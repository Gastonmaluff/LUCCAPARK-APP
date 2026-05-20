import { getTimePlanById } from '../config/timePlans'
import type { ActiveVisit, ChargeVisitInput, CreateVisitInput } from '../types'
import { getExpectedEndAt, getRealDurationMinutes } from '../utils/visitTime'

const activeVisitsKey = 'lucca:activeVisits'
const visitsHistoryKey = 'lucca:visits'
const channelName = 'lucca-visits'

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName)
const listeners = new Set<(visits: ActiveVisit[]) => void>()

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ')

const optionalText = (value?: string) => {
  const normalized = normalizeText(value ?? '')
  return normalized.length > 0 ? normalized : ''
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const reviveVisit = (visit: ActiveVisit): ActiveVisit => ({
  ...visit,
  startedAt: new Date(visit.startedAt),
  expectedEndAt: visit.expectedEndAt ? new Date(visit.expectedEndAt) : null,
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
    childId,
    childName: normalizeText(input.childName),
    childBirthDate: optionalText(input.childBirthDate),
    childAgeRange: optionalText(input.childAgeRange),
    childGender: optionalText(input.childGender),
    customerId,
    customerName: normalizeText(input.customerName),
    customerPhone: optionalText(input.customerPhone),
    customerRelation: optionalText(input.customerRelation),
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
    notes: optionalText(input.notes),
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

import type { ActiveVisit, VisitTimeStatus } from '../types'

export const getExpectedEndAt = (
  startedAt: Date,
  durationMinutes: number | null,
  isUnlimited: boolean,
) => {
  if (isUnlimited || durationMinutes === null) {
    return null
  }

  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000)
}

export const calculateRemainingMs = (visit: Pick<ActiveVisit, 'expectedEndAt' | 'isUnlimited'>, now = new Date()) => {
  if (visit.isUnlimited || !visit.expectedEndAt) {
    return null
  }

  return visit.expectedEndAt.getTime() - now.getTime()
}

export const getVisitTimeStatus = (visit: Pick<ActiveVisit, 'expectedEndAt' | 'isUnlimited'>, now = new Date()): VisitTimeStatus => {
  const remainingMs = calculateRemainingMs(visit, now)

  if (remainingMs === null) {
    return 'unlimited'
  }

  if (remainingMs <= 0) {
    return 'expired'
  }

  if (remainingMs <= 10 * 60 * 1000) {
    return 'warning'
  }

  return 'ok'
}

const pad = (value: number) => String(value).padStart(2, '0')

export const formatRemainingTime = (visit: Pick<ActiveVisit, 'expectedEndAt' | 'isUnlimited'>, now = new Date()) => {
  const remainingMs = calculateRemainingMs(visit, now)

  if (remainingMs === null) {
    return 'Libre'
  }

  if (remainingMs <= 0) {
    const overdueMinutes = Math.max(1, Math.floor(Math.abs(remainingMs) / 60000))
    return `Vencido hace ${overdueMinutes} min`
  }

  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }

  return `${pad(minutes)}:${pad(seconds)}`
}

export const formatVisitStartTime = (date: Date) =>
  new Intl.DateTimeFormat('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

export const getRealDurationMinutes = (startedAt: Date, endedAt: Date) =>
  Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000))

export const getLocalDateKey = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export const ASUNCION_TIME_ZONE = 'America/Asuncion'

const asuncionDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: ASUNCION_TIME_ZONE,
  year: 'numeric',
})

const asuncionPartsFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  timeZone: ASUNCION_TIME_ZONE,
  year: 'numeric',
})

export const getAsuncionDateKey = (date = new Date()) => asuncionDateKeyFormatter.format(date)

const getAsuncionOffsetMs = (date: Date) => {
  const parts = asuncionPartsFormatter.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'))
  return asUtc - date.getTime()
}

export const asuncionDateTimeToUtc = (dateKey: string, hour = 0, minute = 0, second = 0, millisecond = 0) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const guess = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour, minute, second, millisecond))
  const firstPass = new Date(guess.getTime() - getAsuncionOffsetMs(guess))
  const offset = getAsuncionOffsetMs(firstPass)
  return new Date(guess.getTime() - offset)
}

export const addDaysToDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, (month || 1) - 1, day || 1 + days, 12))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

export const getAsuncionDayRange = (dateKey: string) => ({
  end: asuncionDateTimeToUtc(addDaysToDateKey(dateKey, 1)),
  start: asuncionDateTimeToUtc(dateKey),
})

export const isSameLocalDate = (date: Date | null | undefined, dateKey: string) =>
  Boolean(date && getLocalDateKey(date) === dateKey)

export const formatShortTime = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : '--:--'

const asuncionTimeZone = 'America/Asuncion'

export const getAsuncionDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: asuncionTimeZone,
    year: 'numeric',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  return `${year}-${month}-${day}`
}

export const isPastAsuncionDateKey = (dateKey: string, todayKey = getAsuncionDateKey()) =>
  Boolean(dateKey) && dateKey < todayKey

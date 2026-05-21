export const getLocalDateKey = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export const isSameLocalDate = (date: Date | null | undefined, dateKey: string) =>
  Boolean(date && getLocalDateKey(date) === dateKey)

export const formatShortTime = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : '--:--'

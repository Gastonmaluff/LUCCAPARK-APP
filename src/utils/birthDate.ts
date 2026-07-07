export const formatBirthDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)

  return [day, month, year].filter(Boolean).join('/')
}

export const parseBirthDateDisplay = (value: string): { iso: string; error: string | null } => {
  const normalized = formatBirthDateInput(value)

  if (!normalized) {
    return { iso: '', error: null }
  }

  if (normalized.length < 10) {
    return { iso: '', error: 'Usa el formato DD/MM/AAAA.' }
  }

  const [dayText, monthText, yearText] = normalized.split('/')
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  const birth = new Date(year, month - 1, day)

  if (
    !day ||
    !month ||
    !year ||
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return { iso: '', error: 'Fecha de nacimiento invalida.' }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  birth.setHours(0, 0, 0, 0)

  if (birth.getTime() > today.getTime()) {
    return { iso: '', error: 'La fecha de nacimiento no puede ser futura.' }
  }

  return {
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    error: null,
  }
}

export const calculateAgeYears = (birthDateIso: string) => {
  if (!birthDateIso) {
    return null
  }

  const [year, month, day] = birthDateIso.split('-').map(Number)
  const birth = new Date(year, month - 1, day)

  if (!year || !month || !day || Number.isNaN(birth.getTime())) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const hasNotHadBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())

  if (hasNotHadBirthday) {
    age -= 1
  }

  return Math.max(0, age)
}

/**
 * Edad en meses completos entre la fecha de nacimiento (ISO YYYY-MM-DD) y una fecha de referencia.
 * Usa fechas reales para evitar cálculos imprecisos. Devuelve null si falta o es inválida.
 */
export const calculateAgeMonths = (birthDateIso: string, reference: Date = new Date()): number | null => {
  if (!birthDateIso) {
    return null
  }

  const [year, month, day] = birthDateIso.split('-').map(Number)
  const birth = new Date(year, (month || 1) - 1, day || 1)

  if (!year || !month || !day || Number.isNaN(birth.getTime()) || birth.getTime() > reference.getTime()) {
    return null
  }

  let months = (reference.getFullYear() - year) * 12 + (reference.getMonth() - (month - 1))
  if (reference.getDate() < day) {
    months -= 1
  }

  return Math.max(0, months)
}

export const formatMonthsLabel = (months: number | null) => {
  if (months === null) {
    return ''
  }
  if (months < 12) {
    return `${months} mes${months === 1 ? '' : 'es'}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  const yearsLabel = `${years} año${years === 1 ? '' : 's'}`
  return rest === 0 ? yearsLabel : `${yearsLabel} y ${rest} mes${rest === 1 ? '' : 'es'}`
}

export const formatAgeLabel = (age: number | null) => {
  if (age === null) {
    return ''
  }

  if (age < 1) {
    return 'Menor de 1 año'
  }

  return age === 1 ? '1 año' : `${age} años`
}

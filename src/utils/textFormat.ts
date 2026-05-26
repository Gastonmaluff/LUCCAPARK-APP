export const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')

const lowercaseWords = new Set(['de', 'del', 'la', 'las', 'los', 'y'])

const capitalizeSegment = (segment: string) => {
  const lower = segment.toLocaleLowerCase('es-PY')
  return lower.charAt(0).toLocaleUpperCase('es-PY') + lower.slice(1)
}

export const formatPersonName = (value: string) =>
  normalizeWhitespace(value)
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-PY')
      if (index > 0 && lowercaseWords.has(lower)) {
        return lower
      }

      return word.split('-').map(capitalizeSegment).join('-')
    })
    .join(' ')

export const formatEventTitle = (value: string) => formatPersonName(value)

export const lowerSearchKey = (value: string) => normalizeWhitespace(value).toLocaleLowerCase('es-PY')

export const phoneDigits = (value: string) => value.replace(/\D/g, '').slice(0, 10)

export const formatParaguayanPhone = (value: string) => {
  const digits = phoneDigits(value)
  const first = digits.slice(0, 4)
  const second = digits.slice(4, 7)
  const third = digits.slice(7, 10)
  return [first, second, third].filter(Boolean).join(' ')
}

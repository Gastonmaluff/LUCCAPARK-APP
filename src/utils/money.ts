export const formatGuarani = (value: number) =>
  new Intl.NumberFormat('es-PY', {
    currency: 'PYG',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Math.trunc(Number(value) || 0))

export const formatGs = formatGuarani

export const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export const parseCurrencyInput = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : 0
  }

  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

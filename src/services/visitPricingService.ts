import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDocumentRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'

export const DEFAULT_EXTENSION_30_MINUTE_PRICE = 30000
export const DEFAULT_EXTENSION_60_MINUTE_PRICE = 60000

export interface VisitPricingConfig {
  unlimitedHourlyRate: number | null
  babyFreeEntryEnabled: boolean
  babyFreeMaxAgeMonths: number | null
  extension30MinutePrice: number
  extension60MinutePrice: number
}

const visitPricingRef = () => getDocumentRef('settings', 'visitPricing')

const MAX_BABY_AGE_MONTHS = 216 // 18 anios: limite razonable superior

const parseMaxAgeMonths = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const months = Number(value)
  return Number.isSafeInteger(months) && months > 0 && months <= MAX_BABY_AGE_MONTHS ? months : null
}

const parsePositiveIntegerPrice = (value: unknown, fallback: number): number => {
  const price = Number(value)
  return Number.isSafeInteger(price) && price > 0 ? price : fallback
}

export const subscribeVisitPricing = (
  onNext: (config: VisitPricingConfig) => void,
  onError: (message: string) => void,
) =>
  onSnapshot(
    visitPricingRef(),
    (snapshot) => {
      const data = snapshot.data()
      onNext({
        unlimitedHourlyRate:
          data?.unlimitedHourlyRate === null || data?.unlimitedHourlyRate === undefined
            ? null
            : Number(data.unlimitedHourlyRate),
        babyFreeEntryEnabled: data?.babyFreeEntryEnabled === true,
        babyFreeMaxAgeMonths: parseMaxAgeMonths(data?.babyFreeMaxAgeMonths),
        extension30MinutePrice: parsePositiveIntegerPrice(data?.extension30MinutePrice, DEFAULT_EXTENSION_30_MINUTE_PRICE),
        extension60MinutePrice: parsePositiveIntegerPrice(data?.extension60MinutePrice, DEFAULT_EXTENSION_60_MINUTE_PRICE),
      })
    },
    (error) => onError(error.message),
)

const auditFields = async () => {
  const audit = await getCurrentUserAudit()
  return {
    updatedAt: serverTimestamp(),
    updatedBy: audit.uid,
    updatedByEmail: audit.email,
    updatedByName: audit.name,
    updatedByRole: audit.role,
  }
}

export const saveVisitPricing = async (config: Pick<VisitPricingConfig, 'unlimitedHourlyRate'>) => {
  if (!Number.isSafeInteger(config.unlimitedHourlyRate) || !config.unlimitedHourlyRate || config.unlimitedHourlyRate <= 0) {
    throw new Error('La tarifa por hora del plan libre debe ser mayor a cero.')
  }

  await setDoc(
    visitPricingRef(),
    {
      unlimitedHourlyRate: config.unlimitedHourlyRate,
      ...(await auditFields()),
    },
    { merge: true },
  )
}

export interface BabyFreeEntrySettingsInput {
  enabled: boolean
  maxAgeMonths: number | null
}

export const saveBabyFreeEntrySettings = async ({ enabled, maxAgeMonths }: BabyFreeEntrySettingsInput) => {
  if (enabled) {
    if (maxAgeMonths === null || !Number.isInteger(maxAgeMonths)) {
      throw new Error('Indica la edad maxima en meses (numero entero).')
    }
    if (maxAgeMonths <= 0) {
      throw new Error('La edad maxima debe ser mayor a cero.')
    }
    if (maxAgeMonths > MAX_BABY_AGE_MONTHS) {
      throw new Error('La edad maxima supera el limite razonable.')
    }
  }

  await setDoc(
    visitPricingRef(),
    {
      babyFreeEntryEnabled: enabled,
      // Se conserva el valor aunque este desactivado, para no perder la configuracion.
      babyFreeMaxAgeMonths: maxAgeMonths,
      ...(await auditFields()),
    },
    { merge: true },
  )
}

export interface ExtensionPriceSettingsInput {
  extension30MinutePrice: number
  extension60MinutePrice: number
}

export const saveExtensionPriceSettings = async (config: ExtensionPriceSettingsInput) => {
  if (!Number.isSafeInteger(config.extension30MinutePrice) || config.extension30MinutePrice <= 0) {
    throw new Error('El precio de extensión por 30 minutos debe ser un entero mayor a cero.')
  }
  if (!Number.isSafeInteger(config.extension60MinutePrice) || config.extension60MinutePrice <= 0) {
    throw new Error('El precio de extensión por 60 minutos debe ser un entero mayor a cero.')
  }

  await setDoc(
    visitPricingRef(),
    {
      extension30MinutePrice: config.extension30MinutePrice,
      extension60MinutePrice: config.extension60MinutePrice,
      ...(await auditFields()),
    },
    { merge: true },
  )
}

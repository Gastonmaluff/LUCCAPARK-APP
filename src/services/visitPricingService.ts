import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDocumentRef } from './firestoreCollections'

export interface VisitPricingConfig {
  unlimitedHourlyRate: number | null
  babyFreeEntryEnabled: boolean
  babyFreeMaxAgeMonths: number | null
}

const visitPricingRef = () => getDocumentRef('settings', 'visitPricing')

const MAX_BABY_AGE_MONTHS = 216 // 18 anios: limite razonable superior

const parseMaxAgeMonths = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const months = Number(value)
  return Number.isSafeInteger(months) && months > 0 && months <= MAX_BABY_AGE_MONTHS ? months : null
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
      })
    },
    (error) => onError(error.message),
  )

export const saveVisitPricing = async (config: Pick<VisitPricingConfig, 'unlimitedHourlyRate'>) => {
  if (!config.unlimitedHourlyRate || config.unlimitedHourlyRate <= 0) {
    throw new Error('La tarifa por hora del plan libre debe ser mayor a cero.')
  }

  await setDoc(
    visitPricingRef(),
    {
      unlimitedHourlyRate: config.unlimitedHourlyRate,
      updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

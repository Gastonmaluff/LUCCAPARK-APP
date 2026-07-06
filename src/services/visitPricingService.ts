import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDocumentRef } from './firestoreCollections'

export interface VisitPricingConfig {
  unlimitedHourlyRate: number | null
}

const visitPricingRef = () => getDocumentRef('settings', 'visitPricing')

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
      })
    },
    (error) => onError(error.message),
  )

export const saveVisitPricing = async (config: VisitPricingConfig) => {
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

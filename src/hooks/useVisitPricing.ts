import { useEffect, useState } from 'react'
import {
  DEFAULT_EXTENSION_30_MINUTE_PRICE,
  DEFAULT_EXTENSION_60_MINUTE_PRICE,
  subscribeVisitPricing,
  type VisitPricingConfig,
} from '../services/visitPricingService'

export function useVisitPricing() {
  const [config, setConfig] = useState<VisitPricingConfig>({
    unlimitedHourlyRate: null,
    babyFreeEntryEnabled: false,
    babyFreeMaxAgeMonths: null,
    extension30MinutePrice: DEFAULT_EXTENSION_30_MINUTE_PRICE,
    extension60MinutePrice: DEFAULT_EXTENSION_60_MINUTE_PRICE,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeVisitPricing(
      (nextConfig) => {
        setConfig(nextConfig)
        setError(null)
        setIsLoading(false)
      },
      (message) => {
        setError(message)
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  return { config, error, isLoading }
}

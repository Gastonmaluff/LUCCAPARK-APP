import { useEffect, useState } from 'react'
import { subscribeVisitPricing, type VisitPricingConfig } from '../services/visitPricingService'

export function useVisitPricing() {
  const [config, setConfig] = useState<VisitPricingConfig>({ unlimitedHourlyRate: null })
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

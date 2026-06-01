import { useEffect, useState } from 'react'
import { publicPageConfigDefaults, subscribePublicPageConfig, type PublicPageConfig } from '../services/publicPageService'

export function usePublicPageConfig() {
  const [config, setConfig] = useState<PublicPageConfig>(publicPageConfigDefaults)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribePublicPageConfig(
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

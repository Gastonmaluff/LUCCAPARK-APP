export const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const appConfig = {
  brandName: 'Lucca Park',
  logoUrl: publicAsset('/assets/lucca-logo-transparent.png'),
  heroImageUrl: publicAsset('/assets/hero-playground.png'),
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER ?? '595981000000',
  address: import.meta.env.VITE_LUCCA_ADDRESS ?? 'Direccion configurable',
  instagramUrl: import.meta.env.VITE_INSTAGRAM_URL ?? '',
}

export const whatsappLink = (message: string) =>
  `https://wa.me/${appConfig.whatsappNumber}?text=${encodeURIComponent(message)}`

export const buildWhatsappLink = (number: string, message: string) => {
  const digits = number.replace(/\D/g, '')
  return `https://wa.me/${digits || appConfig.whatsappNumber}?text=${encodeURIComponent(message)}`
}

export const extractGoogleMapsUrl = (value: string) => {
  const trimmed = value.trim()
  const iframeSrc = trimmed.match(/src=["']([^"']+)["']/i)?.[1]
  return (iframeSrc || trimmed).replace(/&amp;/g, '&').trim()
}

export const normalizeExternalUrl = (value: string) => {
  const url = extractGoogleMapsUrl(value)
  try {
    return new URL(url).href
  } catch {
    return ''
  }
}

export const buildGoogleMapsEmbedUrl = (value: string) => {
  const url = extractGoogleMapsUrl(value)
  if (!url) return ''

  try {
    const parsedUrl = new URL(url)
    const isGoogleMapsUrl = /(^|\.)google\./i.test(parsedUrl.hostname) || parsedUrl.hostname === 'maps.app.goo.gl'
    if (!isGoogleMapsUrl) return ''
    if (parsedUrl.pathname.includes('/maps/embed') || parsedUrl.searchParams.get('output') === 'embed') return url
    return `https://www.google.com/maps?q=${encodeURIComponent(url)}&output=embed`
  } catch {
    return ''
  }
}

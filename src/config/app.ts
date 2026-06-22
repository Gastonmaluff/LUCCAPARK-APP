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

export const isGoogleMapsEmbedUrl = (value: string) => {
  const url = extractGoogleMapsUrl(value)
  if (!url) return ''

  try {
    const parsedUrl = new URL(url)
    return /(^|\.)google\./i.test(parsedUrl.hostname)
      && (parsedUrl.pathname.includes('/maps/embed') || parsedUrl.searchParams.get('output') === 'embed')
  } catch {
    return false
  }
}

export const buildGoogleMapsEmbedUrl = (value: string) => {
  const url = extractGoogleMapsUrl(value)
  return isGoogleMapsEmbedUrl(url) ? url : ''
}

export const parseGoogleMapsInput = (value: string) => {
  const url = normalizeExternalUrl(value)
  if (!url) return { googleMapsEmbedUrl: '', googleMapsUrl: '' }
  return isGoogleMapsEmbedUrl(url)
    ? { googleMapsEmbedUrl: url, googleMapsUrl: '' }
    : { googleMapsEmbedUrl: '', googleMapsUrl: url }
}

export const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const appConfig = {
  brandName: 'Lucca Park',
  logoUrl: publicAsset('/assets/lucca-logo-cropped.png'),
  heroImageUrl: publicAsset('/assets/hero-playground.png'),
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER ?? '595981000000',
  address: import.meta.env.VITE_LUCCA_ADDRESS ?? 'Direccion configurable',
  instagramUrl: import.meta.env.VITE_INSTAGRAM_URL ?? '',
}

export const whatsappLink = (message: string) =>
  `https://wa.me/${appConfig.whatsappNumber}?text=${encodeURIComponent(message)}`

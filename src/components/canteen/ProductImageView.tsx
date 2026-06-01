import { ImageIcon } from 'lucide-react'
import type { ProductImageFit } from '../../types'

export const defaultProductImageFit: ProductImageFit = { scale: 1, x: 0, y: 0 }

export const normalizeProductImageFit = (fit?: Partial<ProductImageFit> | null): ProductImageFit => ({
  scale: Number.isFinite(Number(fit?.scale)) ? Number(fit?.scale) : defaultProductImageFit.scale,
  x: Number.isFinite(Number(fit?.x)) ? Number(fit?.x) : defaultProductImageFit.x,
  y: Number.isFinite(Number(fit?.y)) ? Number(fit?.y) : defaultProductImageFit.y,
})

export function ProductImageView({
  alt,
  className = '',
  fit,
  imageUrl,
}: {
  alt: string
  className?: string
  fit?: Partial<ProductImageFit> | null
  imageUrl?: string
}) {
  const imageFit = normalizeProductImageFit(fit)

  return (
    <span className={`product-fit-frame ${className}`}>
      {imageUrl ? (
        <img
          alt={alt}
          src={imageUrl}
          style={{ transform: `translate(${imageFit.x}%, ${imageFit.y}%) scale(${imageFit.scale})` }}
        />
      ) : (
        <ImageIcon size={30} />
      )}
    </span>
  )
}

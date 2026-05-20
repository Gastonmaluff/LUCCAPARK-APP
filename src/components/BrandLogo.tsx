import { appConfig } from '../config/app'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <a className={`brand-logo ${className}`} href={`${import.meta.env.BASE_URL}`}>
      <img src={appConfig.logoUrl} alt="Lucca Park" />
    </a>
  )
}

import { appConfig } from '../config/app'
import { Link } from 'react-router-dom'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <Link className={`brand-logo ${className}`} to="/">
      <img src={appConfig.logoUrl} alt="Lucca Park" />
    </Link>
  )
}

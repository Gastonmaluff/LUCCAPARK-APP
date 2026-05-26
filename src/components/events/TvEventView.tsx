import { BrandLogo } from '../BrandLogo'
import type { LuccaEvent } from '../../types'

interface TvEventViewProps {
  event: LuccaEvent
}

export function TvEventView({ event }: TvEventViewProps) {
  const imageUrl = event.tvImageUrl || event.tvBannerImageUrl || ''
  const enabled = (event.tvDisplayEnabled ?? event.tvModeEnabled) && Boolean(imageUrl)

  if (!enabled) {
    return (
      <main className="tv-page tv-event-image-page neutral">
        <div className="tv-event-neutral">
          <BrandLogo />
          <strong>Lucca Park</strong>
        </div>
      </main>
    )
  }

  return (
    <main className="tv-page tv-event-image-page">
      <img alt="" src={imageUrl} />
    </main>
  )
}

import { Check, CircleAlert, Clock3, CreditCard, Infinity as InfinityIcon, RefreshCw } from 'lucide-react'
import type { CSSProperties } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { TvEventView } from '../components/events/TvEventView'
import { useActiveVisits } from '../hooks/useActiveVisits'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useActiveEvent } from '../hooks/useEvents'
import type { ActiveVisit, PaymentStatus, VisitTimeStatus } from '../types'
import { calculateRemainingMs, getVisitTimeStatus } from '../utils/visitTime'

const priorityOrder: Record<VisitTimeStatus, number> = {
  expired: 0,
  warning: 1,
  ok: 2,
  unlimited: 3,
}

const maxVisibleRows = 12
const rotationIntervalMs = 15000
const warningMotionThresholdMs = 5 * 60 * 1000
const urgentMotionThresholdMs = 2 * 60 * 1000

const paymentIcon: Record<PaymentStatus, typeof Check> = {
  paid: Check,
  payAtExit: CreditCard,
  pending: CircleAlert,
}

const pad = (value: number) => String(value).padStart(2, '0')

const formatTvTime = (visit: ActiveVisit, now: Date) => {
  const remainingMs = calculateRemainingMs(visit, now)

  if (remainingMs === null) {
    return 'LIBRE'
  }

  if (remainingMs <= 0) {
    return '00:00'
  }

  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }

  return `${pad(minutes)}:${pad(seconds)}`
}

const getTvTimeMotionState = (visit: ActiveVisit, now: Date) => {
  const remainingMs = calculateRemainingMs(visit, now)

  if (remainingMs === null) {
    return ''
  }

  if (remainingMs <= 0) {
    return 'time-expired'
  }

  if (remainingMs <= urgentMotionThresholdMs) {
    return 'time-urgent'
  }

  if (remainingMs <= warningMotionThresholdMs) {
    return 'time-warning'
  }

  return ''
}

const sortVisitsForTv = (visits: ActiveVisit[], now: Date) =>
  [...visits].sort((a, b) => {
    const statusA = getVisitTimeStatus(a, now)
    const statusB = getVisitTimeStatus(b, now)
    const statusDiff = priorityOrder[statusA] - priorityOrder[statusB]

    if (statusDiff !== 0) {
      return statusDiff
    }

    const remainingA = calculateRemainingMs(a, now)
    const remainingB = calculateRemainingMs(b, now)

    if (remainingA !== null && remainingB !== null && remainingA !== remainingB) {
      return remainingA - remainingB
    }

    const startedA = Number.isNaN(a.startedAt.getTime()) ? Number.MAX_SAFE_INTEGER : a.startedAt.getTime()
    const startedB = Number.isNaN(b.startedAt.getTime()) ? Number.MAX_SAFE_INTEGER : b.startedAt.getTime()
    return startedA - startedB || a.childName.localeCompare(b.childName, 'es')
  })

const getVisibleVisitsForTv = (visits: ActiveVisit[], now: Date) => {
  const sortedVisits = sortVisitsForTv(visits, now)
  const urgentVisits = sortedVisits.filter((visit) => {
    const status = getVisitTimeStatus(visit, now)
    return status === 'expired' || status === 'warning'
  })

  if (urgentVisits.length >= maxVisibleRows) {
    return urgentVisits.slice(0, maxVisibleRows)
  }

  const stableVisits = sortedVisits.filter((visit) => {
    const status = getVisitTimeStatus(visit, now)
    return status !== 'expired' && status !== 'warning'
  })
  const availableSlots = maxVisibleRows - urgentVisits.length

  if (stableVisits.length <= availableSlots) {
    return [...urgentVisits, ...stableVisits]
  }

  const pageCount = Math.ceil(stableVisits.length / availableSlots)
  const pageIndex = Math.floor(now.getTime() / rotationIntervalMs) % pageCount
  const pageStart = pageIndex * availableSlots
  const page = stableVisits.slice(pageStart, pageStart + availableSlots)

  if (page.length < availableSlots) {
    page.push(...stableVisits.slice(0, availableSlots - page.length))
  }

  return [...urgentVisits, ...page]
}

export function TVPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { activeEvent, isLoading: isLoadingEvent } = useActiveEvent()
  const now = useCurrentTime(1000)

  if (activeEvent) {
    return <TvEventView event={activeEvent} />
  }

  const visibleVisits = getVisibleVisitsForTv(visits, now)
  const lastUpdated = new Intl.DateTimeFormat('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  return (
    <main className="tv-page tv-normal-page">
      <section className="tv-shell tv-normal-shell">
        <header className="tv-normal-toolbar">
          <div className="tv-live-brand">
            <BrandLogo className="compact" />
            <span className="tv-brand-separator" />
            <span className="tv-live-dot" />
            <span className="tv-live-label">Vista en tiempo real</span>
            <span className="tv-header-refresh" aria-label={`Actualizado ${lastUpdated}`}>
              <RefreshCw size={26} />
              <strong>{lastUpdated}</strong>
            </span>
          </div>
          <div aria-hidden="true" className="tv-confetti">
            <span className="shape star">*</span>
            <span className="shape squiggle">~</span>
            <span className="shape dot" />
            <span className="shape star small">*</span>
          </div>
        </header>

        {isLoading || isLoadingEvent ? <div className="tv-empty">Cargando pantalla TV...</div> : null}
        {storageMode === 'local' && !isLoading ? (
          <div className="tv-local-note">Modo local temporal: activar Firestore para sincronizar entre dispositivos reales.</div>
        ) : null}
        {error ? <div className="tv-empty danger">No se pudieron cargar las visitas activas.</div> : null}
        {!isLoading && !isLoadingEvent && !error && visits.length === 0 ? (
          <div className="tv-empty">
            <BrandLogo />
            <strong>No hay visitas activas en este momento</strong>
          </div>
        ) : null}

        {!isLoading && !isLoadingEvent && !error && visits.length > 0 ? (
          <>
            <div className="tv-visit-list">
              {visibleVisits.map((visit, index) => {
                const timeStatus = getVisitTimeStatus(visit, now)
                const motionState = getTvTimeMotionState(visit, now)
                const PaymentIcon = paymentIcon[visit.paymentStatus]
                const TimeIcon = timeStatus === 'unlimited' ? InfinityIcon : Clock3
                const rowStyle = { '--tv-row-delay': `${(index % 6) * 0.75}s` } as CSSProperties

                return (
                  <article className={`tv-list-row ${timeStatus} ${motionState}`.trim()} key={visit.id} style={rowStyle}>
                    <span className="tv-priority-number">
                      <span>{index + 1}</span>
                    </span>
                    <strong className="tv-child-name">{visit.childName}</strong>
                    <span className="tv-responsible-name">{visit.customerName || 'Responsable'}</span>
                    <TimeIcon className="tv-time-icon" size={34} strokeWidth={3} />
                    <span className="tv-time-block">
                      <strong className="tv-row-time">{formatTvTime(visit, now)}</strong>
                      {motionState === 'time-expired' ? <span className="tv-expired-label">TIEMPO FINALIZADO</span> : null}
                    </span>
                    <span
                      aria-label={`Estado de pago ${visit.paymentStatus}`}
                      className={`tv-payment-icon ${visit.paymentStatus}`}
                    >
                      <PaymentIcon size={34} strokeWidth={3.2} />
                    </span>
                  </article>
                )
              })}
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}

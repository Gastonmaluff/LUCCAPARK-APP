import {
  BarChart3,
  CalendarHeart,
  Cake,
  ChevronDown,
  Clock3,
  MessageCircle,
  RefreshCw,
  Search,
  TrendingUp,
  UsersRound,
  Utensils,
} from 'lucide-react'
import { Timestamp, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { useClientsData, type ClientVisitHistoryItem } from '../../hooks/useClients'
import { addDaysToDateKey, getAsuncionDateKey, getAsuncionDayRange, getLocalDateKey } from '../../utils/date'
import { getCollectionRef } from '../../services/firestoreCollections'
import { formatGuarani } from '../../utils/money'
import { formatParaguayanPhone, phoneDigits } from '../../utils/textFormat'
import type { CanteenOrder, ChildProfile, LuccaEvent } from '../../types'

type PeriodPreset = 'today' | 'week' | 'month' | 'custom'
type ReceptionVisitDateFilter = 'today' | 'yesterday' | 'custom'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const SHORT_DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HOUR_BUCKETS = [
  { label: '08:00-10:00', min: 8, max: 10 },
  { label: '10:00-12:00', min: 10, max: 12 },
  { label: '12:00-14:00', min: 12, max: 14 },
  { label: '14:00-16:00', min: 14, max: 16 },
  { label: '16:00-18:00', min: 16, max: 18 },
  { label: '18:00-20:00', min: 18, max: 20 },
  { label: '20:00+', min: 20, max: 24 },
]

const emptyGender = 'sin especificar'
const RECEPTION_VISIT_HISTORY_LIMIT = 150

interface ReceptionVisitHistoryItem {
  id: string
  childName: string
  customerName: string
  customerDocumentNumber?: string
  customerPhone?: string
  planId?: string
  planName?: string
  isUnlimited?: boolean
  isBaby?: boolean
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date | null
  status: string
  paymentStatus?: string
  amountCharged: number | null
  defaultAmount: number | null
  parkChargeAmount: number | null
  paidParkAmount: number | null
}

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const mapReceptionVisit = (id: string, data: Record<string, unknown>): ReceptionVisitHistoryItem => ({
  id,
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? null : Number(data.amountCharged),
  childName: String(data.childName ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  customerDocumentNumber: String(data.customerDocumentNumber ?? data.guardianDocumentNumber ?? ''),
  customerName: String(data.customerName ?? data.guardianName ?? ''),
  customerPhone: String(data.customerPhone ?? data.guardianPhone ?? ''),
  defaultAmount: data.defaultAmount === null || data.defaultAmount === undefined ? null : Number(data.defaultAmount),
  endedAt: dateFromTimestamp(data.endedAt),
  isBaby: Boolean(data.isBaby || (data.babyFreeEntry as { applied?: boolean } | undefined)?.applied),
  isUnlimited: Boolean(data.isUnlimited || data.planId === 'unlimited'),
  paidParkAmount: data.paidParkAmount === null || data.paidParkAmount === undefined ? null : Number(data.paidParkAmount),
  parkChargeAmount: data.parkChargeAmount === null || data.parkChargeAmount === undefined ? null : Number(data.parkChargeAmount),
  paymentStatus: String(data.paymentStatus ?? data.parkPaymentStatus ?? ''),
  planId: String(data.planId ?? ''),
  planName: String(data.planName ?? ''),
  startedAt: dateFromTimestamp(data.startedAt),
  status: String(data.status ?? ''),
})

const normalizeGender = (value?: string) => {
  const text = String(value ?? '').trim().toLocaleLowerCase('es-PY')
  if (text === 'male') return 'male'
  if (text === 'female') return 'female'
  if (['m', 'masculino', 'nino', 'niño', 'varon', 'varón'].includes(text)) return 'male'
  if (['f', 'femenino', 'nina', 'niña', 'mujer'].includes(text)) return 'female'
  return emptyGender
}

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0)
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const dateKey = (date: Date) => getLocalDateKey(date)

const startOfWeek = (date: Date) => {
  const next = new Date(date)
  const offset = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - offset)
  return next
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12)
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)

const formatDate = (value?: Date | string | null) => {
  if (!value) return 'Sin fecha'
  const date = typeof value === 'string' ? parseDateKey(value) : value
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const formatDateShort = (value?: Date | string | null) => {
  if (!value) return 'Sin fecha'
  const date = typeof value === 'string' ? parseDateKey(value) : value
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'short' }).format(date)
}

const daysSinceDate = (value: Date | null | undefined, today: Date) => {
  if (!value || Number.isNaN(value.getTime())) return null
  const todayStart = parseDateKey(dateKey(today))
  const visitStart = parseDateKey(dateKey(value))
  return Math.max(0, Math.floor((todayStart.getTime() - visitStart.getTime()) / 86400000))
}

const getWeekdayIndex = (date: Date) => (date.getDay() + 6) % 7

const inRange = (date: Date | null | undefined, startKey: string, endKey: string) => {
  if (!date) return false
  const key = dateKey(date)
  return key >= startKey && key <= endKey
}

const eventInRange = (event: LuccaEvent, startKey: string, endKey: string) => event.date >= startKey && event.date <= endKey

const getVisitChildrenCount = (visit: ClientVisitHistoryItem) => Math.max(1, Number(visit.childrenCount ?? 1))

const visitAmount = (visit: ClientVisitHistoryItem) => Number(visit.amountCharged ?? visit.defaultAmount ?? 0)

const orderDate = (order: CanteenOrder) => order.paidAt ?? order.createdAt ?? order.updatedAt ?? null

const orderCountsAsConsumption = (order: CanteenOrder) => !['cancelled', 'voided', 'refunded', 'closed_empty'].includes(order.status) && order.total > 0 && order.items.some((item) => !['voided', 'courtesy', 'waste'].includes(item.status || 'active'))

const orderCountsAsPaidSale = (order: CanteenOrder) => order.status === 'paid'

const ageAt = (birthDate: string | undefined, atDate: Date) => {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  if (!year || !month || !day) return null
  let age = atDate.getFullYear() - year
  const birthdayThisYear = new Date(atDate.getFullYear(), month - 1, day)
  if (atDate < birthdayThisYear) age -= 1
  return Math.max(0, age)
}

const ageBucket = (child: ChildProfile | undefined, atDate: Date) => {
  const calculated = ageAt(child?.birthDate, atDate)
  const fallbackRange = child?.ageRange?.toLocaleLowerCase('es-PY') ?? ''
  const age = calculated
  if (age !== null) {
    if (age < 2) return 'Menores de 2 años'
    if (age <= 3) return '2-3 años'
    if (age <= 5) return '4-5 años'
    if (age <= 7) return '6-7 años'
    if (age <= 10) return '8-10 años'
    return '11 años o más'
  }
  if (fallbackRange.includes('2') || fallbackRange.includes('3')) return '2-3 años'
  if (fallbackRange.includes('4') || fallbackRange.includes('5')) return '4-5 años'
  if (fallbackRange.includes('6') || fallbackRange.includes('7')) return '6-7 años'
  if (fallbackRange.includes('8') || fallbackRange.includes('10')) return '8-10 años'
  if (fallbackRange.includes('11')) return '11 años o más'
  return 'Sin dato'
}

const whatsappHref = (phone?: string) => {
  const digits = phoneDigits(phone ?? '')
  if (!digits) return ''
  const international = digits.startsWith('0') ? `595${digits.slice(1)}` : digits
  return `https://wa.me/${international}`
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="report-section-title">
      {icon}
      <h2>{children}</h2>
    </div>
  )
}

function KpiCard({ icon, label, note, value }: { icon: React.ReactNode; label: string; note?: string; value: string }) {
  return (
    <article className="report-kpi-card">
      <div className="report-kpi-icon">{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
      {note ? <small>{note}</small> : null}
    </article>
  )
}

function EmptyReportState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state report-empty">{children}</div>
}

function useReceptionVisitHistory(dateKey: string) {
  const [visits, setVisits] = useState<ReceptionVisitHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    setVisits([])

    const { end, start } = getAsuncionDayRange(dateKey)
    const historyQuery = query(
      getCollectionRef('visits'),
      where('startedAt', '>=', Timestamp.fromDate(start)),
      where('startedAt', '<', Timestamp.fromDate(end)),
      orderBy('startedAt', 'desc'),
      limit(RECEPTION_VISIT_HISTORY_LIMIT),
    )

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        setVisits(snapshot.docs.map((docSnapshot) => mapReceptionVisit(docSnapshot.id, docSnapshot.data())))
        setIsLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setVisits([])
        setIsLoading(false)
        setError(snapshotError.message)
      },
    )

    return () => unsubscribe()
  }, [dateKey, retryCount])

  return {
    error,
    isLoading,
    retry: () => setRetryCount((current) => current + 1),
    visits,
  }
}

function Bars({ data, suffix = '' }: { data: Array<{ label: string; value: number; hint?: string }>; suffix?: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  if (!data.some((item) => item.value > 0)) {
    return <EmptyReportState>Todavía no hay datos para mostrar en este período.</EmptyReportState>
  }
  return (
    <div className="report-bars">
      {data.map((item) => (
        <div className="report-bar-column" key={item.label} title={`${item.label}: ${item.value}${suffix}`}>
          <div className="report-bar-track">
            <span style={{ height: `${Math.max(6, (item.value / max) * 100)}%` }} />
          </div>
          <strong>{item.value}{suffix}</strong>
          <small>{item.label}</small>
          {item.hint ? <em>{item.hint}</em> : null}
        </div>
      ))}
    </div>
  )
}

function HorizontalRanking({ data }: { data: Array<{ label: string; value: number; note?: string }> }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  if (!data.length || !data.some((item) => item.value > 0)) {
    return <EmptyReportState>No hay datos suficientes para este ranking.</EmptyReportState>
  }
  return (
    <div className="report-ranking">
      {data.map((item) => (
        <div className="report-ranking-row" key={item.label}>
          <div>
            <strong>{item.label}</strong>
            {item.note ? <small>{item.note}</small> : null}
          </div>
          <span className="report-ranking-track"><i style={{ width: `${(item.value / max) * 100}%` }} /></span>
        </div>
      ))}
    </div>
  )
}

function Donut({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return <EmptyReportState>Todavía no hay datos registrados en este período.</EmptyReportState>
  const gradient = data
    .reduce<{ parts: string[]; cursor: number }>(
      (state, item) => {
        const start = state.cursor
        const end = state.cursor + (item.value / total) * 100
        return { cursor: end, parts: [...state.parts, `${item.color} ${start}% ${end}%`] }
      },
      { cursor: 0, parts: [] },
    )
    .parts.join(', ')
  return (
    <div className="report-donut-wrap">
      <div className="report-donut" style={{ background: `conic-gradient(${gradient})` }}>
        <strong>{total}</strong>
        <small>Total</small>
      </div>
      <div className="report-legend">
        {data.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}: <strong>{item.value}</strong> ({Math.round((item.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  )
}

function VisitEvolutionChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (!data.some((d) => d.value > 0)) {
    return <EmptyReportState>Todavía no hay visitas registradas en este período.</EmptyReportState>
  }

  const W = 640
  const H = 220
  const padL = 32
  const padR = 20
  const padT = 24
  const padB = 52
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const n = data.length
  const max = Math.max(...data.map((d) => d.value), 1)
  const total = data.reduce((s, d) => s + d.value, 0)
  const avg = total / n

  const xOf = (i: number) => padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW)
  const yOf = (v: number) => padT + chartH - (v / max) * chartH

  const pts = data.map((d, i) => ({ x: xOf(i), y: yOf(d.value) }))

  const linePath = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
    const prev = pts[i - 1]
    const cpx = ((prev.x + pt.x) / 2).toFixed(1)
    return `${acc} C ${cpx} ${prev.y.toFixed(1)} ${cpx} ${pt.y.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
  }, '')

  const baseY = padT + chartH
  const areaPath = `${linePath} L ${pts[n - 1].x.toFixed(1)} ${baseY} L ${pts[0].x.toFixed(1)} ${baseY} Z`

  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  const labelStep = n > 56 ? 14 : n > 28 ? 7 : n > 14 ? 3 : n > 7 ? 2 : 1
  const yTicks = [0, Math.round(max / 2), max]

  const tipX = hovered !== null ? Math.min(Math.max(pts[hovered].x, 56), W - 56) : 0
  const tipY = hovered !== null ? Math.max(pts[hovered].y - 46, padT) : 0

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <small style={{ fontSize: 11, color: '#aaa' }}>Promedio diario</small>
        <strong style={{ fontSize: 16, color: 'var(--orange)' }}>{avg.toFixed(2)} visitas</strong>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        role="img"
        aria-label="Evolución de visitas"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--orange)', stopOpacity: 0.25 }} />
            <stop offset="100%" style={{ stopColor: 'var(--orange)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const ty = yOf(tick)
          return (
            <g key={tick}>
              <line x1={padL} x2={W - padR} y1={ty} y2={ty} stroke={tick === 0 ? '#e0e0e0' : '#f2f2f2'} strokeWidth="1" />
              {tick > 0 && (
                <text x={padL - 6} y={ty + 4} textAnchor="end" fontSize="9" fill="#ccc">{tick}</text>
              )}
            </g>
          )
        })}

        <line
          x1={padL} x2={W - padR} y1={yOf(avg)} y2={yOf(avg)}
          stroke="var(--orange)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4"
        />

        <path d={areaPath} fill="url(#evGrad)" />
        <path d={linePath} fill="none" stroke="var(--orange)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {n <= 31 && pts.map((pt, i) => {
          if (data[i].value === 0) return null
          const isMax = i === maxIdx
          const isHov = i === hovered
          return (
            <circle key={i} cx={pt.x} cy={pt.y}
              r={isMax ? 5.5 : isHov ? 5 : 3.5}
              fill={isMax || isHov ? 'var(--orange)' : 'white'}
              stroke="var(--orange)" strokeWidth="2" />
          )
        })}

        {(() => {
          const mx = pts[maxIdx].x
          const my = pts[maxIdx].y
          const calloutY = Math.max(my - 32, padT)
          const rx = Math.min(Math.max(mx - 32, padL), W - padR - 64)
          return (
            <g>
              <rect x={rx} y={calloutY} width={64} height={22} rx="5" fill="var(--orange)" />
              <text x={rx + 32} y={calloutY + 15} textAnchor="middle" fontSize="9.5" fill="white" fontWeight="700">
                Pico · {max}
              </text>
            </g>
          )
        })()}

        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null
          return (
            <text key={i} x={xOf(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#bbb">
              {d.label}
            </text>
          )
        })}

        {pts.map((pt, i) => {
          const slotW = n > 1 ? chartW / (n - 1) : chartW
          return (
            <rect key={i}
              x={pt.x - slotW / 2} y={padT}
              width={slotW} height={chartH + 4}
              fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHovered(i)}
            />
          )
        })}

        {hovered !== null && (
          <g>
            <line x1={pts[hovered].x} x2={pts[hovered].x} y1={padT} y2={baseY}
              stroke="#e0e0e0" strokeWidth="1" strokeDasharray="3 2" />
            <rect x={tipX - 52} y={tipY} width={104} height={36} rx="7"
              fill="white" stroke="#e8e8e8" strokeWidth="1" />
            <text x={tipX} y={tipY + 13} textAnchor="middle" fontSize="9.5" fill="#aaa">
              {data[hovered].label}
            </text>
            <text x={tipX} y={tipY + 29} textAnchor="middle" fontSize="13" fill="var(--orange)" fontWeight="700">
              {data[hovered].value} {data[hovered].value === 1 ? 'visita' : 'visitas'}
            </text>
          </g>
        )}
      </svg>
    </>
  )
}

const asuncionDateFormatter = new Intl.DateTimeFormat('es-PY', {
  day: '2-digit',
  month: 'long',
  timeZone: 'America/Asuncion',
  year: 'numeric',
})

const asuncionTimeFormatter = new Intl.DateTimeFormat('es-PY', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Asuncion',
})

const formatAsuncionDateLabel = (dateKeyValue: string) => asuncionDateFormatter.format(getAsuncionDayRange(dateKeyValue).start)

const formatAsuncionTime = (date: Date | null) => (date ? asuncionTimeFormatter.format(date) : 'Sin dato')

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase('es-PY')

const receptionVisitStatus = (visit: ReceptionVisitHistoryItem) => {
  const status = visit.status.toLocaleLowerCase('es-PY')
  if (status === 'cancelled' || status === 'canceled' || status === 'voided') return { label: 'Cancelado', tone: 'blocked' as const }
  if (status === 'finished' || status === 'closed') return { label: 'Finalizado', tone: 'info' as const }
  if (status === 'active') return { label: 'Dentro del parque', tone: 'available' as const }
  return { label: visit.status || 'Sin estado', tone: 'warning' as const }
}

const receptionVisitPlanLabel = (visit: ReceptionVisitHistoryItem) => {
  if (visit.isBaby) return 'Bebé'
  if (visit.isUnlimited) return 'Libre'
  if (visit.planName) return visit.planName
  if (visit.planId === 'one-hour') return '1 hora'
  if (visit.planId === 'two-hours') return '2 horas'
  return 'Sin plan'
}

const receptionVisitAmountLabel = (visit: ReceptionVisitHistoryItem) => {
  const amount = visit.paidParkAmount ?? visit.amountCharged ?? visit.parkChargeAmount ?? visit.defaultAmount
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    return formatGuarani(amount)
  }
  if (visit.isUnlimited && visit.status === 'active') return 'Monto a definir'
  if (visit.paymentStatus === 'payAtExit' || visit.paymentStatus === 'pending') return 'Saldo pendiente'
  return 'Sin monto'
}

function ReceptionVisitHistorySection({
  dateKeyValue,
  filter,
  onDateChange,
  onFilterChange,
  onToggle,
  open,
}: {
  dateKeyValue: string
  filter: ReceptionVisitDateFilter
  onDateChange: (value: string) => void
  onFilterChange: (value: ReceptionVisitDateFilter) => void
  onToggle: () => void
  open: boolean
}) {
  const [search, setSearch] = useState('')
  const { error, isLoading, retry, visits } = useReceptionVisitHistory(dateKeyValue)

  const filteredVisits = useMemo(() => {
    const term = normalizeSearchText(search)
    if (!term) return visits
    return visits.filter((visit) => {
      const haystack = [
        visit.childName,
        visit.customerName,
        visit.customerDocumentNumber ?? '',
        visit.customerPhone ?? '',
      ].join(' ').toLocaleLowerCase('es-PY')
      return haystack.includes(term)
    })
  }, [search, visits])

  const handleFilterChange = (value: ReceptionVisitDateFilter) => {
    setSearch('')
    onFilterChange(value)
  }

  const handleDateChange = (value: string) => {
    setSearch('')
    onDateChange(value)
  }

  return (
    <article className={`panel report-panel report-collapsible-card reception-visit-history-card ${open ? 'open' : 'closed'}`}>
      <button
        aria-expanded={open}
        className="report-collapsible-header"
        onClick={onToggle}
        type="button"
      >
        <span>
          <strong>Niños ingresados por Recepción</strong>
          <small>Consultá los niños que ingresaron al parque en una fecha determinada.</small>
        </span>
        <ChevronDown className="report-collapse-icon" size={18} />
      </button>

      {open ? (
        <>
          <div className="reception-visit-history-toolbar">
            <div className="report-period-controls compact" aria-label="Filtro de fecha de ingresos">
              {([
                ['today', 'Hoy'],
                ['yesterday', 'Ayer'],
                ['custom', 'Elegir fecha'],
              ] as Array<[ReceptionVisitDateFilter, string]>).map(([value, label]) => (
                <button className={filter === value ? 'active' : ''} key={value} onClick={() => handleFilterChange(value)} type="button">
                  {label}
                </button>
              ))}
            </div>
            {filter === 'custom' ? (
              <label className="field reception-visit-date-field">
                <span>Fecha</span>
                <input type="date" value={dateKeyValue} onChange={(event) => handleDateChange(event.target.value)} />
              </label>
            ) : null}
            <label className="field reception-visit-search-field">
              <span>Buscar</span>
              <div className="input-with-icon">
                <Search size={16} />
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar niño o responsable"
                  value={search}
                />
              </div>
            </label>
          </div>

          <div className="reception-visit-history-summary">
            <StatusPill tone="info">{formatAsuncionDateLabel(dateKeyValue)}</StatusPill>
            <StatusPill tone={filteredVisits.length > 0 ? 'available' : 'warning'}>
              {filteredVisits.length} {filteredVisits.length === 1 ? 'ingreso' : 'ingresos'}
            </StatusPill>
          </div>

          {isLoading ? <EmptyReportState>Cargando ingresos...</EmptyReportState> : null}
          {error ? (
            <div className="form-alert error reception-visit-history-error">
              <span>No se pudieron consultar los ingresos: {error}</span>
              <button className="button secondary small-button" onClick={retry} type="button">
                <RefreshCw size={15} /> Reintentar
              </button>
            </div>
          ) : null}
          {!isLoading && !error && visits.length === 0 ? (
            <EmptyReportState>No se registraron ingresos en esta fecha. Fecha consultada: {formatAsuncionDateLabel(dateKeyValue)}.</EmptyReportState>
          ) : null}
          {!isLoading && !error && visits.length > 0 && filteredVisits.length === 0 ? (
            <EmptyReportState>No hay coincidencias para la búsqueda en {formatAsuncionDateLabel(dateKeyValue)}.</EmptyReportState>
          ) : null}
          {!isLoading && !error && filteredVisits.length > 0 ? (
            <div className="report-action-list compact reception-visit-history-list">
              {filteredVisits.map((visit) => {
                const status = receptionVisitStatus(visit)
                return (
                  <article className="report-action-row compact reception-visit-history-row" key={visit.id}>
                    <div>
                      <strong>{visit.childName || 'Sin nombre del niño'}</strong>
                      <p>
                        Responsable: {visit.customerName || 'Sin responsable'} · Ingreso: {formatAsuncionTime(visit.startedAt)} · Salida: {visit.endedAt ? formatAsuncionTime(visit.endedAt) : 'Sin salida'}
                      </p>
                      <small>
                        {visit.customerDocumentNumber ? `Cédula: ${visit.customerDocumentNumber} · ` : ''}
                        {visit.customerPhone ? `Teléfono: ${formatParaguayanPhone(visit.customerPhone)} · ` : ''}
                        {receptionVisitPlanLabel(visit)} · {receptionVisitAmountLabel(visit)}
                      </small>
                    </div>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </article>
                )
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

export function AdminReportsPage() {
  const { canteenOrders, children, error, events, isLoading, visits } = useClientsData()
  const today = useMemo(() => new Date(), [])
  const [period, setPeriod] = useState<PeriodPreset>('month')
  const [customFrom, setCustomFrom] = useState(dateKey(startOfMonth(today)))
  const [customTo, setCustomTo] = useState(dateKey(today))
  const [birthdaysOpen, setBirthdaysOpen] = useState(false)
  const [receptionVisitsOpen, setReceptionVisitsOpen] = useState(true)
  const [receptionVisitFilter, setReceptionVisitFilter] = useState<ReceptionVisitDateFilter>('today')
  const [receptionVisitDate, setReceptionVisitDate] = useState(getAsuncionDateKey(today))
  const [frequentOpen, setFrequentOpen] = useState(false)
  const [reactivateOpen, setReactivateOpen] = useState(false)
  const [reactivationDays, setReactivationDays] = useState(60)

  const handleReceptionVisitFilterChange = (value: ReceptionVisitDateFilter) => {
    setReceptionVisitFilter(value)
    if (value === 'today') {
      setReceptionVisitDate(getAsuncionDateKey(new Date()))
      return
    }
    if (value === 'yesterday') {
      setReceptionVisitDate(addDaysToDateKey(getAsuncionDateKey(new Date()), -1))
    }
  }

  const range = useMemo(() => {
    if (period === 'today') return { from: dateKey(today), to: dateKey(today) }
    if (period === 'week') return { from: dateKey(startOfWeek(today)), to: dateKey(addDays(startOfWeek(today), 6)) }
    if (period === 'month') return { from: dateKey(startOfMonth(today)), to: dateKey(endOfMonth(today)) }
    return { from: customFrom, to: customTo || customFrom }
  }, [customFrom, customTo, period, today])

  const childById = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const visitsInPeriod = useMemo(
    () => visits.filter((visit) => inRange(visit.startedAt ?? visit.createdAt ?? null, range.from, range.to)),
    [range.from, range.to, visits],
  )
  const ordersInPeriod = useMemo(
    () => canteenOrders.filter((order) => inRange(orderDate(order), range.from, range.to)),
    [canteenOrders, range.from, range.to],
  )
  const paidCanteenOrders = useMemo(() => ordersInPeriod.filter(orderCountsAsPaidSale), [ordersInPeriod])
  const periodEvents = useMemo(() => events.filter((event) => eventInRange(event, range.from, range.to)), [events, range.from, range.to])

  const metrics = useMemo(() => {
    const visitUnits = visitsInPeriod.reduce((sum, visit) => sum + getVisitChildrenCount(visit), 0)
    const gender = { female: 0, male: 0, unknown: 0 }
    visitsInPeriod.forEach((visit) => {
      const child = childById.get(visit.childId)
      const count = getVisitChildrenCount(visit)
      const genderValue = visit.childGender ?? child?.gender
      const normalized = normalizeGender(genderValue)
      const finalCategory = normalized === 'male' ? 'niño' : normalized === 'female' ? 'niña' : 'sin especificar'
      void finalCategory
      if (normalized === 'male') gender.male += count
      else if (normalized === 'female') gender.female += count
      else gender.unknown += count
    })

    const orderVisitKeys = new Set(
      ordersInPeriod.filter(orderCountsAsConsumption).flatMap((order) => [
        order.visitId ? `visit:${order.visitId}` : '',
        order.childId ? `child:${order.childId}` : '',
        order.childName ? `name:${order.childName.toLocaleLowerCase('es-PY')}` : '',
      ]).filter(Boolean),
    )
    const consumedVisits = visitsInPeriod.filter((visit) =>
      orderVisitKeys.has(`visit:${visit.id}`) ||
      orderVisitKeys.has(`child:${visit.childId}`) ||
      orderVisitKeys.has(`name:${visit.childName.toLocaleLowerCase('es-PY')}`),
    )
    const canteenRevenue = paidCanteenOrders.reduce((sum, order) => sum + order.total, 0)
    const parkRevenue = visitsInPeriod.reduce((sum, visit) => sum + visitAmount(visit), 0)
    return {
      canteenRevenue,
      consumedVisits,
      gender,
      parkRevenue,
      ticketAverage: visitUnits > 0 ? (parkRevenue + canteenRevenue) / visitUnits : 0,
      visitUnits,
    }
  }, [childById, ordersInPeriod, paidCanteenOrders, visitsInPeriod])

  const visitsByDay = useMemo(() => {
    const rows = DAY_LABELS.map((label) => ({ hint: '0%', label, value: 0 }))
    visitsInPeriod.forEach((visit) => {
      const date = visit.startedAt ?? visit.createdAt
      if (date) rows[getWeekdayIndex(date)].value += getVisitChildrenCount(visit)
    })
    return rows.map((row) => ({ ...row, hint: metrics.visitUnits ? `${Math.round((row.value / metrics.visitUnits) * 100)}%` : '0%' }))
  }, [metrics.visitUnits, visitsInPeriod])

  const visitsByHour = useMemo(() => {
    const rows = HOUR_BUCKETS.map((bucket) => ({ label: bucket.label, value: 0 }))
    visitsInPeriod.forEach((visit) => {
      const date = visit.startedAt ?? visit.createdAt
      if (!date) return
      const hour = date.getHours()
      const bucket = HOUR_BUCKETS.find((item) => hour >= item.min && hour < item.max)
      if (bucket) rows[HOUR_BUCKETS.indexOf(bucket)].value += getVisitChildrenCount(visit)
    })
    return rows
  }, [visitsInPeriod])

  const evolution = useMemo(() => {
    const start = parseDateKey(range.from)
    const end = parseDateKey(range.to)
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    if (period === 'today') {
      return HOUR_BUCKETS.map((bucket) => ({
        label: bucket.label.replace(':00', ''),
        value: visitsInPeriod
          .filter((visit) => {
            const hour = (visit.startedAt ?? visit.createdAt)?.getHours()
            return hour !== undefined && hour >= bucket.min && hour < bucket.max
          })
          .reduce((sum, visit) => sum + getVisitChildrenCount(visit), 0),
      }))
    }
    if (days > 45) {
      const weekCount = Math.ceil(days / 7)
      return Array.from({ length: weekCount }, (_, index) => {
        const weekStart = addDays(start, index * 7)
        const weekEnd = addDays(weekStart, 6)
        return {
          label: `${formatDateShort(weekStart)}`,
          value: visitsInPeriod
            .filter((visit) => {
              const visitKey = dateKey(visit.startedAt ?? visit.createdAt ?? start)
              return visitKey >= dateKey(weekStart) && visitKey <= dateKey(weekEnd)
            })
            .reduce((sum, visit) => sum + getVisitChildrenCount(visit), 0),
        }
      })
    }
    return Array.from({ length: days }, (_, index) => {
      const current = addDays(start, index)
      const key = dateKey(current)
      return {
        label: formatDateShort(current),
        value: visitsInPeriod
          .filter((visit) => dateKey(visit.startedAt ?? visit.createdAt ?? current) === key)
          .reduce((sum, visit) => sum + getVisitChildrenCount(visit), 0),
      }
    })
  }, [period, range.from, range.to, visitsInPeriod])

  const ageData = useMemo(() => {
    const labels = ['Menores de 2 años', '2-3 años', '4-5 años', '6-7 años', '8-10 años', '11 años o más', 'Sin dato']
    const counts = new Map(labels.map((label) => [label, 0]))
    visitsInPeriod.forEach((visit) => {
      const bucket = ageBucket(childById.get(visit.childId), visit.startedAt ?? today)
      counts.set(bucket, (counts.get(bucket) ?? 0) + getVisitChildrenCount(visit))
    })
    return labels.map((label) => ({ label, value: counts.get(label) ?? 0 }))
  }, [childById, today, visitsInPeriod])

  const recurrentData = useMemo(() => {
    let nuevos = 0
    let recurrentes = 0
    visitsInPeriod.forEach((visit) => {
      const hasPrevious = visits.some((candidate) => {
        if (!candidate.startedAt || !visit.startedAt) return false
        const sameChild = (visit.childId && candidate.childId === visit.childId) || candidate.childName.toLocaleLowerCase('es-PY') === visit.childName.toLocaleLowerCase('es-PY')
        return sameChild && candidate.startedAt.getTime() < visit.startedAt.getTime() && dateKey(candidate.startedAt) < range.from
      })
      if (hasPrevious) recurrentes += getVisitChildrenCount(visit)
      else nuevos += getVisitChildrenCount(visit)
    })
    return { nuevos, recurrentes }
  }, [range.from, visits, visitsInPeriod])

  const conversionByDay = useMemo(() => {
    return DAY_LABELS.map((_label, index) => {
      const dayVisits = visitsInPeriod.filter((visit) => getWeekdayIndex(visit.startedAt ?? visit.createdAt ?? today) === index)
      const consumed = dayVisits.filter((visit) =>
        metrics.consumedVisits.some((item) => item.id === visit.id),
      ).length
      return { label: SHORT_DAY_LABELS[index], value: dayVisits.length ? Math.round((consumed / dayVisits.length) * 100) : 0 }
    })
  }, [metrics.consumedVisits, today, visitsInPeriod])

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>()
    paidCanteenOrders.forEach((order) => {
      order.items.filter((item) => !['voided', 'courtesy', 'waste'].includes(item.status || 'active')).forEach((item) => {
        const key = item.productId || item.productName
        const current = map.get(key) ?? { name: item.productName, quantity: 0, revenue: 0 }
        current.quantity += item.quantity
        current.revenue += item.subtotal
        map.set(key, current)
      })
    })
    const total = Array.from(map.values()).reduce((sum, item) => sum + item.revenue, 0)
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((item) => ({
        label: item.name,
        note: `${item.quantity} unidades · ${formatGuarani(item.revenue)} · ${total ? Math.round((item.revenue / total) * 100) : 0}%`,
        value: item.revenue,
      }))
  }, [paidCanteenOrders])

  const eventSummary = useMemo(() => {
    const todayKey = dateKey(today)
    const upcoming = events.filter((event) => event.date >= todayKey && ['inquiry', 'reserved', 'confirmed'].includes(event.status)).length
    const cancelled = periodEvents.filter((event) => event.status === 'cancelled').length
    const finished = periodEvents.filter((event) => event.status === 'finished').length
    const byDay = DAY_LABELS.map((label) => ({ label, value: 0 }))
    periodEvents.forEach((event) => byDay[getWeekdayIndex(parseDateKey(event.date))].value += 1)
    const finishedWithGuests = periodEvents.filter((event) => event.status === 'finished' && event.registeredGuestsCount > 0)
    const avgGuests = finishedWithGuests.length
      ? Math.round(finishedWithGuests.reduce((sum, event) => sum + event.registeredGuestsCount, 0) / finishedWithGuests.length)
      : 0
    const withCapacity = finishedWithGuests.filter((event) => event.contractedChildrenCount > 0)
    const avgCapacity = withCapacity.length
      ? Math.round(withCapacity.reduce((sum, event) => sum + (event.registeredGuestsCount / event.contractedChildrenCount) * 100, 0) / withCapacity.length)
      : 0
    return { avgCapacity, avgGuests, byDay, cancelled, finished, upcoming }
  }, [events, periodEvents, today])

  const opportunities = useMemo(() => {
    const next30 = addDays(today, 30)
    const birthdays = children
      .filter((child) => child.birthDate)
      .map((child) => {
        const [year, month, day] = String(child.birthDate).split('-').map(Number)
        const birthdayThisYear = new Date(today.getFullYear(), month - 1, day, 12)
        const nextBirthday = birthdayThisYear < today ? new Date(today.getFullYear() + 1, month - 1, day, 12) : birthdayThisYear
        return { child, nextBirthday, turns: nextBirthday.getFullYear() - year }
      })
      .filter((item) => item.nextBirthday >= today && item.nextBirthday <= next30)
      .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime())
      .slice(0, 10)
    const visitCounts = new Map<string, { child: ChildProfile; count: number; last?: Date | null }>()
    children.forEach((child) => visitCounts.set(child.id, { child, count: 0, last: child.lastVisitAt }))
    visits.forEach((visit) => {
      const child = childById.get(visit.childId)
      if (!child) return
      const current = visitCounts.get(child.id) ?? { child, count: 0, last: null }
      current.count += getVisitChildrenCount(visit)
      if (visit.startedAt && (!current.last || visit.startedAt > current.last)) current.last = visit.startedAt
      visitCounts.set(child.id, current)
    })
    const frequent = Array.from(visitCounts.values()).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 10)
    const reactivate = Array.from(visitCounts.values())
      .map((item) => ({ ...item, daysSinceLastVisit: daysSinceDate(item.last ?? null, today) }))
      .filter((item) => item.daysSinceLastVisit !== null && item.daysSinceLastVisit >= reactivationDays)
      .sort((a, b) => (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0))
      .slice(0, 10)
    return { birthdays, frequent, reactivate }
  }, [childById, children, reactivationDays, today, visits])

  const canteenConsumerTicket = metrics.consumedVisits.length ? metrics.canteenRevenue / metrics.consumedVisits.length : 0

  return (
    <>
      <AdminModuleHeader
        eyebrow="Analítica"
        title="Reportes"
        description="Análisis de asistencia, comportamiento, consumo y oportunidades comerciales."
        action={
          <div className="report-period-controls">
            {([
              ['today', 'Hoy'],
              ['week', 'Esta semana'],
              ['month', 'Este mes'],
              ['custom', 'Personalizado'],
            ] as Array<[PeriodPreset, string]>).map(([value, label]) => (
              <button className={period === value ? 'active' : ''} key={value} onClick={() => setPeriod(value)} type="button">
                {label}
              </button>
            ))}
          </div>
        }
      />

      {period === 'custom' ? (
        <div className="report-custom-range">
          <label className="field">
            <span>Desde</span>
            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </label>
        </div>
      ) : null}

      {error ? <div className="form-alert error">No se pudieron cargar los reportes: {error}</div> : null}
      {isLoading ? <div className="empty-state">Cargando datos reales del sistema...</div> : null}

      <section className="report-section">
        <SectionTitle icon={<TrendingUp color="var(--orange)" />}>Resumen del período</SectionTitle>
        <div className="report-kpi-grid">
          <KpiCard icon={<UsersRound />} label="Visitas registradas" value={String(metrics.visitUnits)} />
          <KpiCard icon={<UsersRound />} label="Niños" value={String(metrics.gender.male)} />
          <KpiCard icon={<UsersRound />} label="Niñas" value={String(metrics.gender.female)} />
          <KpiCard icon={<UsersRound />} label="Sin especificar" value={String(metrics.gender.unknown)} />
          <KpiCard
            icon={<Utensils />}
            label={`${metrics.visitUnits ? Math.round((metrics.consumedVisits.length / visitsInPeriod.length) * 100) : 0}% consumieron`}
            value={`${metrics.consumedVisits.length} visitas`}
          />
          <KpiCard icon={<BarChart3 />} label="Promedio por visita" value={formatGuarani(metrics.ticketAverage)} />
        </div>
      </section>

      <section className="report-section">
        <SectionTitle icon={<BarChart3 color="var(--turquoise)" />}>Asistencia y comportamiento del parque</SectionTitle>
        <div className="report-grid two">
          <article className="panel report-panel">
            <h3>Visitas por día de la semana</h3>
            <Bars data={visitsByDay} />
          </article>
          <article className="panel report-panel">
            <h3>Visitas por horario</h3>
            <Bars data={visitsByHour} />
          </article>
        </div>
        <article className="panel report-panel report-wide-panel">
          <h3>Evolución de visitas</h3>
          <VisitEvolutionChart data={evolution} />
        </article>
      </section>

      <section className="report-section">
        <SectionTitle icon={<UsersRound color="var(--green)" />}>Perfil del público</SectionTitle>
        <div className="report-grid three">
          <article className="panel report-panel">
            <h3>Distribución por género</h3>
            <Donut data={[
              { color: 'var(--turquoise)', label: 'Niños', value: metrics.gender.male },
              { color: 'var(--orange)', label: 'Niñas', value: metrics.gender.female },
              { color: 'var(--yellow)', label: 'Sin especificar', value: metrics.gender.unknown },
            ]} />
          </article>
          <article className="panel report-panel">
            <h3>Distribución por rango de edad</h3>
            <Bars data={ageData} />
          </article>
          <article className="panel report-panel">
            <h3>Nuevos vs recurrentes</h3>
            <Donut data={[
              { color: 'var(--green)', label: 'Nuevos', value: recurrentData.nuevos },
              { color: 'var(--orange)', label: 'Recurrentes', value: recurrentData.recurrentes },
            ]} />
          </article>
        </div>
      </section>

      <section className="report-section">
        <SectionTitle icon={<Utensils color="var(--orange)" />}>Comportamiento de consumo en cantina</SectionTitle>
        <div className="report-grid two">
          <article className="panel report-panel">
            <h3>Consumieron vs no consumieron</h3>
            <Donut data={[
              { color: 'var(--green)', label: 'Consumieron', value: metrics.consumedVisits.length },
              { color: 'var(--yellow)', label: 'No consumieron', value: Math.max(0, visitsInPeriod.length - metrics.consumedVisits.length) },
            ]} />
            <p className="muted">{metrics.consumedVisits.length} de {visitsInPeriod.length} visitas consumieron en cantina.</p>
          </article>
          <article className="panel report-panel">
            <h3>Conversión a cantina por día</h3>
            <Bars data={conversionByDay} suffix="%" />
          </article>
        </div>
        <div className="report-grid two">
          <article className="panel report-panel">
            <h3>Top productos vendidos</h3>
            <HorizontalRanking data={topProducts} />
          </article>
          <article className="panel report-panel report-ticket-card">
            <Utensils color="var(--turquoise)" />
            <strong>{formatGuarani(canteenConsumerTicket)}</strong>
            <span>Ticket promedio por consumidor</span>
          </article>
        </div>
      </section>

      <section className="report-section">
        <SectionTitle icon={<Cake color="var(--turquoise)" />}>Eventos y cumpleaños</SectionTitle>
        <div className="report-kpi-grid compact">
          <KpiCard icon={<Cake />} label="Eventos realizados en el período" value={String(eventSummary.finished)} />
          <KpiCard icon={<CalendarHeart />} label="Próximos eventos reservados" value={String(eventSummary.upcoming)} />
          <KpiCard icon={<Clock3 />} label="Eventos cancelados" value={String(eventSummary.cancelled)} />
        </div>
        <div className="report-grid two">
          <article className="panel report-panel">
            <h3>Eventos por día de la semana</h3>
            <Bars data={eventSummary.byDay} />
          </article>
          <article className="panel report-panel report-ticket-card">
            <Cake color="var(--orange)" />
            {eventSummary.avgGuests ? (
              <>
                <strong>{eventSummary.avgGuests} invitados promedio</strong>
                <span>{eventSummary.avgCapacity}% del cupo contratado utilizado</span>
              </>
            ) : (
              <EmptyReportState>Aún no existen eventos finalizados con invitados registrados.</EmptyReportState>
            )}
          </article>
        </div>
      </section>

      <section className="report-section">
        <SectionTitle icon={<CalendarHeart color="var(--green)" />}>Oportunidades comerciales</SectionTitle>
        <article className={`panel report-panel report-collapsible-card ${birthdaysOpen ? 'open' : 'closed'}`}>
          <button
            aria-expanded={birthdaysOpen}
            className="report-collapsible-header"
            onClick={() => setBirthdaysOpen((current) => !current)}
            type="button"
          >
            <span>
              <strong>Próximos cumpleaños</strong>
              <small>Niños que cumplen años en los próximos 30 días</small>
            </span>
            <span className="report-collapsible-actions">
              <StatusPill tone="info">Próximos 30 días</StatusPill>
              <ChevronDown className="report-collapse-icon" size={18} />
            </span>
          </button>
          {birthdaysOpen ? (
            <>
              {opportunities.birthdays.length === 0 ? <EmptyReportState>No hay cumpleaños próximos registrados.</EmptyReportState> : null}
              <div className="report-action-list">
                {opportunities.birthdays.map(({ child, nextBirthday, turns }) => {
                  const phone = child.mainCustomerPhone || child.customerPhone
                  const hasEvent = events.some((event) => event.childId === child.id || event.birthdayChildName.toLocaleLowerCase('es-PY') === child.name.toLocaleLowerCase('es-PY'))
                  return (
                    <article className="report-action-row" key={child.id}>
                      <div>
                        <strong>{child.name}</strong>
                        <p>{formatDate(nextBirthday)} · cumple {turns} años</p>
                        <small>Responsable: {child.mainCustomerName || child.customerName || 'Sin responsable'} · {phone ? formatParaguayanPhone(phone) : 'Sin teléfono'}</small>
                      </div>
                      <StatusPill tone={hasEvent ? 'available' : 'warning'}>{hasEvent ? 'Con evento/reserva' : 'Sin evento'}</StatusPill>
                      {whatsappHref(phone) ? (
                        <a className="button whatsapp" href={whatsappHref(phone)} rel="noreferrer" target="_blank">
                          <MessageCircle size={17} /> WhatsApp
                        </a>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </>
          ) : null}
        </article>

        <ReceptionVisitHistorySection
          dateKeyValue={receptionVisitDate}
          filter={receptionVisitFilter}
          onDateChange={(value) => {
            setReceptionVisitFilter('custom')
            setReceptionVisitDate(value)
          }}
          onFilterChange={handleReceptionVisitFilterChange}
          onToggle={() => setReceptionVisitsOpen((current) => !current)}
          open={receptionVisitsOpen}
        />

        <div className="report-grid two report-opportunities-grid">
          <article className={`panel report-panel report-collapsible-card ${frequentOpen ? 'open' : 'closed'}`}>
            <button
              aria-expanded={frequentOpen}
              className="report-collapsible-header"
              onClick={() => setFrequentOpen((current) => !current)}
              type="button"
            >
              <span>
                <strong>Clientes más frecuentes</strong>
                <small>Familias con más visitas registradas</small>
              </span>
              <ChevronDown className="report-collapse-icon" size={18} />
            </button>
            {frequentOpen ? (
              <>
            {opportunities.frequent.length === 0 ? <EmptyReportState>No hay visitas históricas suficientes.</EmptyReportState> : null}
            <div className="report-action-list compact">
              {opportunities.frequent.map(({ child, count, last }) => (
                <article className="report-action-row compact" key={child.id}>
                  <div>
                    <strong>{child.name}</strong>
                    <p>{child.mainCustomerName || child.customerName || 'Sin responsable'} · {count} visitas</p>
                    <small>Última visita: {formatDate(last)}</small>
                  </div>
                  <StatusPill tone={child.eventReservationCount ? 'available' : 'info'}>
                    {child.eventReservationCount ? 'Tuvo evento' : 'Sin evento'}
                  </StatusPill>
                </article>
              ))}
            </div>
              </>
            ) : null}
          </article>
          <article className={`panel report-panel report-collapsible-card ${reactivateOpen ? 'open' : 'closed'}`}>
            <button
              aria-expanded={reactivateOpen}
              className="report-collapsible-header"
              onClick={() => setReactivateOpen((current) => !current)}
              type="button"
            >
              <span>
                <strong>Clientes para reactivar</strong>
                <small>Clientes que no visitan el parque hace cierto tiempo</small>
              </span>
              <ChevronDown className="report-collapse-icon" size={18} />
            </button>
            {reactivateOpen ? (
              <>
            <div className="report-reactivation-filter" aria-label="Filtro de días sin visita">
              {[30, 60, 90].map((days) => (
                <button
                  className={reactivationDays === days ? 'active' : ''}
                  key={days}
                  onClick={() => setReactivationDays(days)}
                  type="button"
                >
                  {days} días
                </button>
              ))}
              <label>
                <span>Más de</span>
                <input
                  min={1}
                  onChange={(event) => setReactivationDays(Math.max(1, Number(event.target.value) || 1))}
                  type="number"
                  value={reactivationDays}
                />
                <span>días sin venir</span>
              </label>
            </div>
            {opportunities.reactivate.length === 0 ? <EmptyReportState>No hay clientes para reactivar con el criterio actual.</EmptyReportState> : null}
            <div className="report-action-list compact">
              {opportunities.reactivate.map(({ child, count, daysSinceLastVisit, last }) => {
                const phone = child.mainCustomerPhone || child.customerPhone
                return (
                  <article className="report-action-row compact" key={child.id}>
                    <div>
                      <strong>{child.name}</strong>
                      <p>
                        Responsable: {child.mainCustomerName || child.customerName || 'Sin responsable'} · Última visita: {formatDate(last)} · Hace {daysSinceLastVisit} días
                      </p>
                      <small>{phone ? formatParaguayanPhone(phone) : 'Sin teléfono'} · {count > 0 ? `${count} visitas históricas` : 'Visitas registradas'}</small>
                    </div>
                    {whatsappHref(phone) ? (
                      <a className="button whatsapp small-button" href={whatsappHref(phone)} rel="noreferrer" target="_blank">
                        <MessageCircle size={16} /> WhatsApp
                      </a>
                    ) : null}
                  </article>
                )
              })}
            </div>
              </>
            ) : null}
          </article>
        </div>
      </section>
    </>
  )
}

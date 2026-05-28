import {
  BarChart3,
  CalendarHeart,
  Cake,
  Clock3,
  MessageCircle,
  TrendingUp,
  UsersRound,
  Utensils,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { useClientsData, type ClientVisitHistoryItem } from '../../hooks/useClients'
import { getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import { formatParaguayanPhone, phoneDigits } from '../../utils/textFormat'
import type { CanteenOrder, ChildProfile, LuccaEvent } from '../../types'

type PeriodPreset = 'today' | 'week' | 'month' | 'custom'

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

const normalizeGender = (value?: string) => {
  const text = String(value ?? '').trim().toLocaleLowerCase('es-PY')
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

const orderCountsAsConsumption = (order: CanteenOrder) => order.status !== 'cancelled'

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

function LineTrend({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  if (!data.some((item) => item.value > 0)) {
    return <EmptyReportState>Todavía no hay visitas registradas en este período.</EmptyReportState>
  }
  const points = data
    .map((item, index) => {
      const x = data.length === 1 ? 500 : 36 + (index / (data.length - 1)) * 528
      const y = 178 - (item.value / max) * 132
      return `${x},${y}`
    })
    .join(' ')
  return (
    <div className="report-line-chart">
      <svg viewBox="0 0 600 220" role="img" aria-label="Evolución de visitas">
        <polyline points={points} fill="none" stroke="var(--orange)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => {
          const x = data.length === 1 ? 500 : 36 + (index / (data.length - 1)) * 528
          const y = 178 - (item.value / max) * 132
          return <circle cx={x} cy={y} fill="var(--turquoise)" key={item.label} r="5" />
        })}
      </svg>
      <div className="report-line-labels">
        {data.map((item) => <span key={item.label}>{item.label}<strong>{item.value}</strong></span>)}
      </div>
    </div>
  )
}

export function AdminReportsPage() {
  const { canteenOrders, children, error, events, isLoading, visits } = useClientsData()
  const today = useMemo(() => new Date(), [])
  const [period, setPeriod] = useState<PeriodPreset>('month')
  const [customFrom, setCustomFrom] = useState(dateKey(startOfMonth(today)))
  const [customTo, setCustomTo] = useState(dateKey(today))

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
      const normalized = normalizeGender(child?.gender)
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
      order.items.forEach((item) => {
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
    const threshold = addDays(today, -60)
    const reactivate = Array.from(visitCounts.values())
      .filter((item) => item.count >= 2 && item.last && item.last < threshold)
      .sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0))
      .slice(0, 10)
    return { birthdays, frequent, reactivate }
  }, [childById, children, today, visits])

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
          <LineTrend data={evolution} />
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
        <article className="panel report-panel">
          <div className="panel-header">
            <h3>Cumpleaños próximos</h3>
            <StatusPill tone="info">Próximos 30 días</StatusPill>
          </div>
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
        </article>

        <div className="report-grid two">
          <article className="panel report-panel">
            <h3>Clientes más frecuentes</h3>
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
          </article>
          <article className="panel report-panel">
            <h3>Clientes para reactivar</h3>
            {opportunities.reactivate.length === 0 ? <EmptyReportState>No hay clientes para reactivar con el criterio actual.</EmptyReportState> : null}
            <div className="report-action-list compact">
              {opportunities.reactivate.map(({ child, count, last }) => {
                const phone = child.mainCustomerPhone || child.customerPhone
                return (
                  <article className="report-action-row compact" key={child.id}>
                    <div>
                      <strong>{child.name}</strong>
                      <p>{count} visitas históricas · última: {formatDate(last)}</p>
                      <small>{child.mainCustomerName || child.customerName || 'Sin responsable'}</small>
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
          </article>
        </div>
      </section>
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarHeart, ChevronDown, ChevronRight, Gift, MessageCircle, Phone, Search, Star, UserRound, Users, X } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { useClientsData, type ClientVisitHistoryItem } from '../../hooks/useClients'
import { formatShortTime, getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import { lowerSearchKey } from '../../utils/textFormat'
import type { CanteenOrder, ChildProfile, CustomerProfile, EventGuest, LuccaEvent } from '../../types'

type ClientFilter = 'all' | 'birthday' | 'thisMonth' | 'visit' | 'event' | 'frequent'
type ClientSort = 'birthdaySoon' | 'birthdayFar' | 'visits' | 'recent' | 'alpha'

interface ResponsibleRecord {
  key: string
  name: string
  documentNumber: string
  documentNumberNormalized: string
  phone: string
  relation: string
  children: ChildProfile[]
  visitCount: number
  lastVisitAt: Date | null
}

const filters: Array<{ id: ClientFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'birthday', label: 'Cumpleaños próximos' },
  { id: 'thisMonth', label: 'Visitó este mes' },
  { id: 'visit', label: 'Visita normal' },
  { id: 'event', label: 'Evento' },
  { id: 'frequent', label: 'Frecuentes' },
]

const parseBirthDate = (value?: string) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const nextBirthdayInfo = (birthDate?: string, now = new Date()) => {
  const parsed = parseBirthDate(birthDate)
  if (!parsed) return null

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const next = new Date(now.getFullYear(), parsed.getMonth(), parsed.getDate())
  if (next < today) next.setFullYear(now.getFullYear() + 1)

  const daysUntil = Math.ceil((next.getTime() - today.getTime()) / 86400000)
  const turningAge = next.getFullYear() - parsed.getFullYear()
  return { date: next, daysUntil, turningAge }
}

const formatDate = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date)
    : 'Sin dato'

const formatBirthday = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('es-PY', {
        day: '2-digit',
        month: 'long',
      }).format(date)
    : 'Sin dato'

const normalizeDigits = (value?: string) => (value ?? '').replace(/\D/g, '')

const formatDocument = (value?: string) => value || 'Sin cédula'

const getTotalActivity = (child: ChildProfile) => child.visitCount + child.eventGuestCount + (child.eventReservationCount ?? 0)

const childSearchText = (child: ChildProfile) =>
  [child.name, child.mainCustomerName, child.customerName, child.mainCustomerPhone, child.customerPhone].join(' ').toLocaleLowerCase('es-PY')

const getChildBadgeLabel = (child: ChildProfile) => {
  const hasVisits = child.visitCount > 0
  const hasEvents = child.eventGuestCount > 0 || (child.eventReservationCount ?? 0) > 0

  if (hasVisits && hasEvents) return 'Visita + Evento'
  if (hasEvents) return 'Evento'
  return 'Visita'
}

const getChildBadgeTone = (child: ChildProfile) => {
  const hasEvents = child.eventGuestCount > 0 || (child.eventReservationCount ?? 0) > 0
  return hasEvents ? 'warning' : 'info'
}

const getChildVisits = (child: ChildProfile, visits: ClientVisitHistoryItem[]) =>
  visits
    .filter((visit) => visit.childId === child.id)
    .sort((a, b) => (b.startedAt?.getTime() ?? b.createdAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? a.createdAt?.getTime() ?? 0))

const getChildGuests = (child: ChildProfile, guests: EventGuest[]) =>
  guests.filter((guest) => guest.childId === child.id).sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime())

const getChildOrders = (child: ChildProfile, orders: CanteenOrder[], visits: ClientVisitHistoryItem[]) => {
  const visitIds = new Set(visits.filter((visit) => visit.childId === child.id).map((visit) => visit.id))
  return orders.filter((order) => order.childId === child.id || (order.visitId ? visitIds.has(order.visitId) : false))
}

const getChildReservations = (child: ChildProfile, events: LuccaEvent[]) => {
  const normalizedName = lowerSearchKey(child.name)
  const normalizedPhone = normalizeDigits(child.mainCustomerPhone || child.customerPhone)

  return events
    .filter((event) => {
      const eventPhone = normalizeDigits(event.customerPhone)
      const eventName = lowerSearchKey(event.birthdayChildName || event.title)
      return (
        event.childId === child.id ||
        (eventName === normalizedName && Boolean(child.birthDate && event.childBirthDate === child.birthDate)) ||
        (eventName === normalizedName && Boolean(normalizedPhone && eventPhone === normalizedPhone))
      )
    })
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`))
}

const normalizePhoneForWhatsApp = (phone?: string) => {
  const digits = normalizeDigits(phone)
  if (!digits) return ''
  if (digits.startsWith('595')) return digits
  if (digits.startsWith('0')) return `595${digits.slice(1)}`
  return `595${digits}`
}

const buildWhatsAppUrl = (child: ChildProfile) => {
  const phone = normalizePhoneForWhatsApp(child.mainCustomerPhone || child.customerPhone)
  if (!phone) return ''
  const text = `Hola! Te escribimos de Lucca Park por el cumple de ${child.name}. Queremos contarte una propuesta especial para festejar.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

const buildResponsibleWhatsAppUrl = (responsible: ResponsibleRecord) => {
  const phone = normalizePhoneForWhatsApp(responsible.phone)
  if (!phone) return ''
  const text = `Hola! Te escribimos de Lucca Park para compartir información de tu familia.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

const getResponsibleKey = (input: { id?: string; name?: string; documentNumber?: string; documentNumberNormalized?: string; phone?: string }) => {
  const documentNumber = normalizeDigits(input.documentNumberNormalized || input.documentNumber)
  if (documentNumber) return `doc:${documentNumber}`
  const phone = normalizeDigits(input.phone)
  if (phone) return `phone:${phone}`
  const name = lowerSearchKey(input.name ?? '')
  if (name) return `name:${name}`
  return `id:${input.id ?? 'sin-dato'}`
}

const buildResponsibleRecords = (
  customers: CustomerProfile[],
  children: ChildProfile[],
  visits: ClientVisitHistoryItem[],
): ResponsibleRecord[] => {
  const records = new Map<string, ResponsibleRecord>()
  const customerById = new Map(customers.map((customer) => [customer.id, customer]))
  const childById = new Map(children.map((child) => [child.id, child]))

  const upsert = (
    input: {
      id?: string
      name?: string
      documentNumber?: string
      documentNumberNormalized?: string
      phone?: string
      relation?: string
      child?: ChildProfile | null
      visitDate?: Date | null
      visitIncrement?: number
    },
  ) => {
    const key = getResponsibleKey(input)
    const current =
      records.get(key) ??
      {
        key,
        name: '',
        documentNumber: '',
        documentNumberNormalized: '',
        phone: '',
        relation: '',
        children: [],
        visitCount: 0,
        lastVisitAt: null,
      }

    current.name = current.name || input.name || ''
    current.documentNumber = current.documentNumber || input.documentNumber || ''
    current.documentNumberNormalized = current.documentNumberNormalized || input.documentNumberNormalized || normalizeDigits(input.documentNumber)
    current.phone = current.phone || input.phone || ''
    current.relation = current.relation || input.relation || ''
    if (input.child && !current.children.some((child) => child.id === input.child?.id)) {
      current.children.push(input.child)
    }
    current.visitCount += input.visitIncrement ?? 0
    if (input.visitDate && (!current.lastVisitAt || input.visitDate > current.lastVisitAt)) {
      current.lastVisitAt = input.visitDate
    }
    records.set(key, current)
  }

  customers.forEach((customer) => {
    upsert({
      id: customer.id,
      name: customer.name,
      documentNumber: customer.documentNumber,
      documentNumberNormalized: customer.documentNumberNormalized,
      phone: customer.phone,
      relation: customer.relation,
    })
  })

  children.forEach((child) => {
    const customer = customerById.get(child.guardianId || child.mainCustomerId || child.customerId || '')
    upsert({
      id: customer?.id,
      name: child.guardianName || child.mainCustomerName || child.customerName || customer?.name,
      documentNumber: child.guardianDocumentNumber || customer?.documentNumber,
      documentNumberNormalized: child.guardianDocumentNumberNormalized || customer?.documentNumberNormalized,
      phone: child.guardianPhone || child.mainCustomerPhone || child.customerPhone || customer?.phone,
      relation: customer?.relation,
      child,
      visitDate: child.lastVisitAt,
      visitIncrement: 0,
    })
  })

  visits.forEach((visit) => {
    const child = childById.get(visit.childId)
    const customer = customerById.get(visit.customerId || child?.guardianId || child?.mainCustomerId || child?.customerId || '')
    upsert({
      id: customer?.id || visit.customerId,
      name: child?.guardianName || child?.mainCustomerName || visit.customerName || customer?.name,
      documentNumber: child?.guardianDocumentNumber || visit.customerDocumentNumber || customer?.documentNumber,
      documentNumberNormalized: child?.guardianDocumentNumberNormalized || visit.customerDocumentNumberNormalized || customer?.documentNumberNormalized,
      phone: child?.guardianPhone || child?.mainCustomerPhone || child?.customerPhone || visit.customerPhone || customer?.phone,
      relation: visit.customerRelation || customer?.relation,
      child,
      visitDate: visit.startedAt ?? visit.createdAt ?? null,
      visitIncrement: 1,
    })
  })

  return Array.from(records.values())
    .filter((responsible) => responsible.name || responsible.phone || responsible.documentNumber || responsible.children.length > 0)
    .map((responsible) => ({
      ...responsible,
      children: [...responsible.children].sort((a, b) => a.name.localeCompare(b.name, 'es-PY')),
    }))
    .sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0) || a.name.localeCompare(b.name, 'es-PY'))
}

export function AdminClientsPage() {
  const { canteenOrders, children, customers, error, eventGuests, events, isLoading, visits } = useClientsData()
  const [search, setSearch] = useState('')
  const [responsibleSearch, setResponsibleSearch] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [sortBy, setSortBy] = useState<ClientSort>('birthdaySoon')
  const [isBirthdaysOpen, setIsBirthdaysOpen] = useState(true)
  const [isChildrenOpen, setIsChildrenOpen] = useState(true)
  const [isResponsiblesOpen, setIsResponsiblesOpen] = useState(false)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [selectedResponsibleKey, setSelectedResponsibleKey] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    const childId = searchParams.get('childId')
    setSelectedChildId(childId)
  }, [searchParams])

  const upcomingBirthdays = useMemo(
    () =>
      children
        .map((child) => ({ child, birthday: nextBirthdayInfo(child.birthDate, now) }))
        .filter((item): item is { child: ChildProfile; birthday: NonNullable<ReturnType<typeof nextBirthdayInfo>> } =>
          Boolean(item.birthday && item.birthday.daysUntil <= 30),
        )
        .sort((a, b) => a.birthday.daysUntil - b.birthday.daysUntil),
    [children, now],
  )

  const filteredChildren = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-PY')
    return [...children]
      .filter((child) => {
        const birthday = nextBirthdayInfo(child.birthDate, now)
        const matchesSearch = !normalizedSearch || childSearchText(child).includes(normalizedSearch)
        const matchesFilter =
          filter === 'all' ||
          (filter === 'birthday' && Boolean(birthday && birthday.daysUntil <= 30)) ||
          (filter === 'thisMonth' && Boolean(child.lastVisitAt && getLocalDateKey(child.lastVisitAt).startsWith(currentMonth))) ||
          (filter === 'visit' && child.visitCount > 0 && child.eventGuestCount === 0 && (child.eventReservationCount ?? 0) === 0) ||
          (filter === 'event' && (child.eventGuestCount > 0 || (child.eventReservationCount ?? 0) > 0)) ||
          (filter === 'frequent' && getTotalActivity(child) >= 3)
        return matchesSearch && matchesFilter
      })
      .sort((a, b) => {
        const birthdayA = nextBirthdayInfo(a.birthDate, now)
        const birthdayB = nextBirthdayInfo(b.birthDate, now)
        if (sortBy === 'birthdaySoon') return (birthdayA?.daysUntil ?? 9999) - (birthdayB?.daysUntil ?? 9999)
        if (sortBy === 'birthdayFar') return (birthdayB?.daysUntil ?? -1) - (birthdayA?.daysUntil ?? -1)
        if (sortBy === 'visits') return getTotalActivity(b) - getTotalActivity(a)
        if (sortBy === 'recent') return (b.lastVisitAt?.getTime() ?? b.updatedAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? a.updatedAt?.getTime() ?? 0)
        return a.name.localeCompare(b.name, 'es-PY')
      })
  }, [children, currentMonth, filter, now, search, sortBy])

  const responsibles = useMemo(
    () => buildResponsibleRecords(customers, children, visits),
    [children, customers, visits],
  )

  const filteredResponsibles = useMemo(() => {
    const normalizedSearch = responsibleSearch.trim().toLocaleLowerCase('es-PY')
    if (!normalizedSearch) return responsibles
    const searchDigits = normalizeDigits(normalizedSearch)
    return responsibles.filter((responsible) => {
      const text = [
        responsible.name,
        responsible.documentNumber,
        responsible.documentNumberNormalized,
        responsible.phone,
        responsible.relation,
        responsible.children.map((child) => child.name).join(' '),
      ].join(' ').toLocaleLowerCase('es-PY')
      const digits = normalizeDigits([responsible.documentNumber, responsible.documentNumberNormalized, responsible.phone].join(' '))
      return text.includes(normalizedSearch) || Boolean(searchDigits && digits.includes(searchDigits))
    })
  }, [responsibleSearch, responsibles])

  const selectedChild = children.find((child) => child.id === selectedChildId) ?? null
  const selectedResponsible = responsibles.find((responsible) => responsible.key === selectedResponsibleKey) ?? null
  const selectedVisits = selectedChild ? getChildVisits(selectedChild, visits) : []
  const selectedGuests = selectedChild ? getChildGuests(selectedChild, eventGuests) : []
  const selectedOrders = selectedChild ? getChildOrders(selectedChild, canteenOrders, visits) : []
  const selectedReservations = selectedChild ? getChildReservations(selectedChild, events) : []
  const selectedBirthday = nextBirthdayInfo(selectedChild?.birthDate, now)
  const selectedConsumptionTotal = selectedOrders.reduce((sum, order) => sum + order.total, 0)

  const openProfile = (childId: string) => {
    setSearchParams({ childId })
  }

  const closeProfile = () => {
    setSearchParams({})
  }

  const closeResponsibleDetail = () => {
    setSelectedResponsibleKey(null)
  }

  return (
    <>
      <AdminModuleHeader
        eyebrow="Base comercial"
        title="Clientes"
        description="Niños, responsables, cumpleaños próximos e historial de visitas y eventos."
      />

      <div className="metric-grid clients-metrics">
        <MetricCard label="Total de niños" value={String(children.length)} detail="Perfiles permanentes" icon={<Users />} color="var(--turquoise)" />
        <MetricCard label="Cumpleaños próximos" value={String(upcomingBirthdays.length)} detail="Próximos 30 días" icon={<Gift />} color="var(--yellow)" />
        <MetricCard
          label="Nuevos este mes"
          value={String(children.filter((child) => child.createdAt && getLocalDateKey(child.createdAt).startsWith(currentMonth)).length)}
          detail="Altas recientes"
          icon={<Star />}
          color="var(--orange)"
        />
        <MetricCard
          label="Clientes frecuentes"
          value={String(children.filter((child) => getTotalActivity(child) >= 3).length)}
          detail="3 o más registros"
          icon={<CalendarHeart />}
          color="var(--green)"
        />
      </div>

      <section className="panel upcoming-panel clients-full-panel">
        <button className="finance-collapsible-header" onClick={() => setIsBirthdaysOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isBirthdaysOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <Gift color="var(--yellow)" size={20} />
            Cumpleaños próximos
          </span>
          <StatusPill tone="warning">{upcomingBirthdays.length} en 30 días</StatusPill>
        </button>
        {isBirthdaysOpen ? <div className="birthday-wide-list client-collapsible-body">
          {upcomingBirthdays.map(({ birthday, child }) => {
            const whatsappUrl = buildWhatsAppUrl(child)
            return (
              <article className="birthday-card birthday-card-wide" key={child.id}>
                <div className="birthday-card-main">
                  <strong>{child.name}</strong>
                  <p className="muted">
                    Cumple: {formatBirthday(birthday.date)} · Cumple {birthday.turningAge} años en {birthday.daysUntil} días
                  </p>
                  <p className="muted">
                    Responsable: {child.mainCustomerName || child.customerName || 'Sin dato'} ·{' '}
                    {child.mainCustomerPhone || child.customerPhone || 'Sin teléfono'}
                  </p>
                </div>
                <div className="birthday-actions">
                  {whatsappUrl ? (
                    <a className="button whatsapp" href={whatsappUrl} rel="noreferrer" target="_blank">
                      <MessageCircle size={17} />
                      WhatsApp
                    </a>
                  ) : null}
                  <button className="button ghost" onClick={() => openProfile(child.id)} type="button">
                    Ver detalle
                  </button>
                </div>
              </article>
            )
          })}
          {upcomingBirthdays.length === 0 ? <div className="empty-state">No hay cumpleaños próximos cargados.</div> : null}
        </div> : null}
      </section>

      <section className="panel clients-list-panel clients-full-panel">
        <button className="finance-collapsible-header" onClick={() => setIsChildrenOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isChildrenOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <UserRound color="var(--orange)" size={20} />
            <strong>Niños registrados</strong>
          </span>
          <strong>{filteredChildren.length} resultados</strong>
        </button>

        {isChildrenOpen ? (
          <div className="client-collapsible-body">
            <div className="clients-controls-grid">
              <label className="field search-field">
                <span>
                  <Search size={16} /> Buscar
                </span>
                <input onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, responsable o teléfono" value={search} />
              </label>
              <label className="field">
                <span>Ordenar por</span>
                <select onChange={(event) => setSortBy(event.target.value as ClientSort)} value={sortBy}>
                  <option value="birthdaySoon">Próximo cumpleaños primero</option>
                  <option value="birthdayFar">Cumpleaños más lejano</option>
                  <option value="visits">Más visitas</option>
                  <option value="recent">Más recientes</option>
                  <option value="alpha">Orden alfabético</option>
                </select>
              </label>
            </div>

            <div className="client-filter-row" role="tablist" aria-label="Filtros de clientes">
              {filters.map((item) => (
                <button className={filter === item.id ? 'active' : ''} key={item.id} onClick={() => setFilter(item.id)} type="button">
                  {item.label}
                </button>
              ))}
            </div>

            {isLoading ? <div className="empty-state">Cargando clientes...</div> : null}
            {error ? <div className="form-alert error">No se pudieron cargar clientes: {error}</div> : null}
            {!isLoading && !error && filteredChildren.length === 0 ? <div className="empty-state">No hay clientes para este filtro.</div> : null}

            <div className="client-table">
              {filteredChildren.map((child) => {
                const birthday = nextBirthdayInfo(child.birthDate, now)
                const birthdayText = birthday
                  ? `Cumple: ${formatBirthday(birthday.date)} · Faltan ${birthday.daysUntil} días`
                  : 'Cumpleaños: Sin fecha registrada'
                const hasBirthdaySoon = Boolean(birthday && birthday.daysUntil <= 30)
                const phone = child.mainCustomerPhone || child.customerPhone
                const whatsappUrl = buildWhatsAppUrl(child)
                return (
                  <article className="client-row client-row-enhanced client-row-polished" key={child.id}>
                    <button className="client-row-open" onClick={() => openProfile(child.id)} type="button">
                      <div className="client-row-main">
                        <strong>{child.name}</strong>
                        <small>Responsable: {child.mainCustomerName || child.customerName || 'Sin dato'}</small>
                      </div>
                      <div className="client-row-meta">
                        <span>Teléfono: {phone || 'Sin teléfono'}</span>
                        <span>{birthdayText}</span>
                        <span>Visitas/registros: {getTotalActivity(child)}</span>
                      </div>
                      <div className="client-row-badges">
                        <StatusPill tone={getChildBadgeTone(child)}>{getChildBadgeLabel(child)}</StatusPill>
                        {getTotalActivity(child) >= 3 ? <StatusPill tone="available">Frecuente</StatusPill> : null}
                        {hasBirthdaySoon ? <StatusPill tone="warning">Cumpleaños próximo</StatusPill> : null}
                      </div>
                    </button>
                    <div className="client-row-actions">
                      <button className="button ghost small-button" onClick={() => openProfile(child.id)} type="button">
                        Ver detalle
                      </button>
                      {whatsappUrl ? (
                        <a className="button whatsapp small-button" href={whatsappUrl} rel="noreferrer" target="_blank">
                          WhatsApp
                        </a>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel clients-list-panel clients-full-panel">
        <button className="finance-collapsible-header" onClick={() => setIsResponsiblesOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isResponsiblesOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <Users color="var(--turquoise)" size={20} />
            <span>
              <strong>Responsables registrados</strong>
              <small>Padres, tutores o encargados vinculados a los niños.</small>
            </span>
          </span>
          <strong>{responsibles.length} responsables</strong>
        </button>

        {isResponsiblesOpen ? (
          <div className="client-collapsible-body">
            <div className="clients-controls-grid">
              <label className="field search-field">
                <span>
                  <Search size={16} /> Buscar
                </span>
                <input
                  onChange={(event) => setResponsibleSearch(event.target.value)}
                  placeholder="Buscar por nombre, cédula o teléfono"
                  value={responsibleSearch}
                />
              </label>
            </div>

            {isLoading ? <div className="empty-state">Cargando responsables...</div> : null}
            {error ? <div className="form-alert error">No se pudieron cargar responsables: {error}</div> : null}
            {!isLoading && !error && filteredResponsibles.length === 0 ? <div className="empty-state">No hay responsables para esta búsqueda.</div> : null}

            <div className="responsible-grid">
              {filteredResponsibles.map((responsible) => {
                const whatsappUrl = buildResponsibleWhatsAppUrl(responsible)
                return (
                  <article className="responsible-card" key={responsible.key}>
                    <div className="responsible-card-main">
                      <strong>{responsible.name || 'Responsable sin nombre'}</strong>
                      <p>{formatDocument(responsible.documentNumber)}</p>
                      <p>{responsible.phone || 'Sin teléfono'}{responsible.relation ? ` · ${responsible.relation}` : ''}</p>
                    </div>
                    <div className="responsible-card-meta">
                      <span>{responsible.children.length} niños vinculados</span>
                      <span>{responsible.visitCount} visitas asociadas</span>
                      <span>Última visita: {formatDate(responsible.lastVisitAt)}</span>
                    </div>
                    <div className="responsible-child-chips">
                      {responsible.children.slice(0, 4).map((child) => (
                        <span key={child.id}>{child.name}</span>
                      ))}
                      {responsible.children.length > 4 ? <span>+{responsible.children.length - 4}</span> : null}
                    </div>
                    <div className="client-row-actions">
                      <button className="button ghost small-button" onClick={() => setSelectedResponsibleKey(responsible.key)} type="button">
                        Ver detalle
                      </button>
                      {whatsappUrl ? (
                        <a className="button whatsapp small-button" href={whatsappUrl} rel="noreferrer" target="_blank">
                          WhatsApp
                        </a>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>

      {selectedResponsible ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card client-profile-modal" role="dialog" aria-modal="true" aria-label={`Responsable ${selectedResponsible.name}`}>
            <div className="modal-header">
              <div className="client-profile-header">
                <div>
                  <p className="eyebrow">Responsable registrado</p>
                  <h2>{selectedResponsible.name || 'Responsable sin nombre'}</h2>
                  <p className="muted">
                    {formatDocument(selectedResponsible.documentNumber)} · {selectedResponsible.phone || 'Sin teléfono'}
                    {selectedResponsible.relation ? ` · ${selectedResponsible.relation}` : ''}
                  </p>
                </div>
                <StatusPill tone="info">{selectedResponsible.children.length} niños vinculados</StatusPill>
              </div>
              <button className="icon-button modal-close" onClick={closeResponsibleDetail} type="button" aria-label="Cerrar responsable">
                <X size={18} />
              </button>
            </div>

            <div className="client-profile-grid">
              <span>
                <strong>{formatDocument(selectedResponsible.documentNumber)}</strong>
                Cédula / documento
              </span>
              <span>
                <strong>{selectedResponsible.phone || 'Sin teléfono'}</strong>
                Teléfono
              </span>
              <span>
                <strong>{selectedResponsible.relation || 'Sin relación'}</strong>
                Relación
              </span>
              <span>
                <strong>{selectedResponsible.visitCount}</strong>
                Visitas asociadas
              </span>
              <span>
                <strong>{formatDate(selectedResponsible.lastVisitAt)}</strong>
                Última visita
              </span>
              <span>
                <strong>{selectedResponsible.children.length}</strong>
                Niños vinculados
              </span>
            </div>

            <div className="client-action-row">
              {buildResponsibleWhatsAppUrl(selectedResponsible) ? (
                <a className="button whatsapp" href={buildResponsibleWhatsAppUrl(selectedResponsible)} rel="noreferrer" target="_blank">
                  <Phone size={17} />
                  WhatsApp
                </a>
              ) : null}
            </div>

            <div className="client-history-section">
              <h3>Niños vinculados</h3>
              <div className="module-list">
                {selectedResponsible.children.map((child) => {
                  const birthday = nextBirthdayInfo(child.birthDate, now)
                  return (
                    <article className="child-history-card" key={child.id}>
                      <div className="child-history-main">
                        <strong>{child.name}</strong>
                        <p className="muted">
                          {birthday ? `Cumple: ${formatBirthday(birthday.date)} · Faltan ${birthday.daysUntil} días` : 'Cumpleaños: Sin fecha registrada'}
                        </p>
                        <p className="muted">Visitas/registros: {getTotalActivity(child)}</p>
                      </div>
                      <div className="child-history-side">
                        <button
                          className="button ghost small-button"
                          onClick={() => {
                            closeResponsibleDetail()
                            openProfile(child.id)
                          }}
                          type="button"
                        >
                          Ver niño
                        </button>
                      </div>
                    </article>
                  )
                })}
                {selectedResponsible.children.length === 0 ? <div className="empty-state">Sin niños vinculados.</div> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {selectedChild ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card client-profile-modal" role="dialog" aria-modal="true" aria-label={`Perfil de ${selectedChild.name}`}>
            <div className="modal-header">
              <div className="client-profile-header">
                <div>
                  <p className="eyebrow">Perfil del niño</p>
                  <h2>{selectedChild.name}</h2>
                  <p className="muted">
                    {selectedChild.mainCustomerName || selectedChild.customerName || 'Responsable sin dato'} ·{' '}
                    {selectedChild.mainCustomerPhone || selectedChild.customerPhone || 'Sin teléfono'}
                  </p>
                </div>
                <StatusPill tone={selectedBirthday && selectedBirthday.daysUntil <= 30 ? 'warning' : 'info'}>
                  {selectedBirthday ? `Cumple en ${selectedBirthday.daysUntil} días` : 'Cumpleaños: Sin fecha registrada'}
                </StatusPill>
              </div>
              <button className="icon-button modal-close" onClick={closeProfile} type="button" aria-label="Cerrar perfil">
                <X size={18} />
              </button>
            </div>

            <div className="client-profile-grid">
              <span>
                <strong>{formatBirthday(selectedBirthday?.date)}</strong>
                Próximo cumple
              </span>
              <span>
                <strong>{selectedBirthday ? `${selectedBirthday.turningAge} años` : selectedChild.ageRange || '--'}</strong>
                Edad / rango
              </span>
              <span>
                <strong>{selectedVisits.length}</strong>
                Visitas normales
              </span>
              <span>
                <strong>{selectedGuests.length}</strong>
                Eventos asistidos
              </span>
              <span>
                <strong>{selectedReservations.length}</strong>
                Reservas de cumpleaños
              </span>
              <span>
                <strong>{formatGuarani(selectedConsumptionTotal)}</strong>
                Consumo asociado
              </span>
              <span>
                <strong>{formatDate(selectedChild.lastVisitAt)}</strong>
                Última visita
              </span>
              <span>
                <strong>{formatDate(selectedChild.lastReservationAt)}</strong>
                Última reserva
              </span>
            </div>

            <div className="client-action-row">
              {buildWhatsAppUrl(selectedChild) ? (
                <a className="button whatsapp" href={buildWhatsAppUrl(selectedChild)} rel="noreferrer" target="_blank">
                  <Phone size={17} />
                  Contactar responsable
                </a>
              ) : null}
              <button className="button secondary" disabled type="button">
                <Gift size={17} />
                Enviar promoción
              </button>
              <Link className="button ghost" to="/admin/reservas">
                <CalendarHeart size={17} />
                Crear reserva
              </Link>
            </div>

            <div className="client-history-section">
              <h3>Historial de reservas y eventos</h3>
              <div className="module-list">
                {selectedReservations.slice(0, 6).map((event) => (
                  <article className="child-history-card" key={event.id}>
                    <div className="child-history-main">
                      <strong>{event.title || event.birthdayChildName}</strong>
                      <p className="muted">
                        {event.customerName || 'Responsable sin dato'} · {event.date} · {event.startTime} a {event.endTime}
                      </p>
                      <p className="muted">
                        {event.childBirthDate ? `Nacimiento: ${event.childBirthDate} · ` : ''}
                        {event.customerPhone || 'Sin teléfono'}
                      </p>
                    </div>
                    <div className="child-history-side">
                      <StatusPill tone={event.status === 'cancelled' ? 'blocked' : event.status === 'finished' ? 'available' : 'warning'}>
                        {event.status === 'cancelled'
                          ? 'Cancelado'
                          : event.status === 'finished'
                            ? 'Finalizado'
                            : event.status === 'active'
                              ? 'En curso'
                              : 'Reservado'}
                      </StatusPill>
                      <StatusPill tone={event.childId ? 'available' : 'info'}>{event.childId ? 'Vinculado' : 'Legado'}</StatusPill>
                      <Link className="button ghost small-button" to={`/admin/reservas?eventId=${event.id}`}>
                        Ver evento
                      </Link>
                    </div>
                  </article>
                ))}
                {selectedReservations.length === 0 ? <div className="empty-state">Sin reservas asociadas.</div> : null}
              </div>
            </div>

            <div className="client-history-section">
              <h3>Historial de visitas</h3>
              <div className="module-list">
                {selectedVisits.slice(0, 6).map((visit) => {
                  const visitOrders = canteenOrders.filter((order) => order.visitId === visit.id)
                  const visitConsumption = visitOrders.reduce((sum, order) => sum + order.total, 0)
                  return (
                    <article className="child-history-card" key={visit.id}>
                      <div className="child-history-main">
                        <strong>{formatDate(visit.startedAt ?? visit.createdAt)}</strong>
                        <p className="muted">
                          {visit.planName || 'Visita normal'} · {visit.status || 'registrada'} · ingreso {formatShortTime(visit.startedAt)}
                        </p>
                      </div>
                      <div className="child-history-side">
                        <StatusPill tone={visit.paymentStatus === 'paid' ? 'available' : 'warning'}>
                          {visit.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                        </StatusPill>
                        <strong>{visitConsumption ? formatGuarani(visitConsumption) : 'Sin consumo'}</strong>
                      </div>
                    </article>
                  )
                })}
                {selectedVisits.length === 0 ? <div className="empty-state">Sin visitas normales registradas.</div> : null}
              </div>
            </div>

            <div className="client-history-section">
              <h3>Eventos asistidos</h3>
              <div className="module-list">
                {selectedGuests.slice(0, 6).map((guest) => (
                  <article className="child-history-card" key={guest.id}>
                    <div className="child-history-main">
                      <strong>{guest.eventName}</strong>
                      <p className="muted">
                        {guest.eventDate} · cumple/evento de {guest.birthdayChildName}
                      </p>
                    </div>
                    <div className="child-history-side">
                      <StatusPill tone={guest.isExtra ? 'warning' : 'available'}>{guest.isExtra ? 'Adicional' : 'Invitado'}</StatusPill>
                    </div>
                  </article>
                ))}
                {selectedGuests.length === 0 ? <div className="empty-state">Sin eventos asociados.</div> : null}
              </div>
            </div>

            <p className="muted client-privacy-note">Consentimiento comercial: {selectedChild.marketingConsent ? 'autorizado' : 'pendiente de solicitar'}.</p>
          </section>
        </div>
      ) : null}
    </>
  )
}

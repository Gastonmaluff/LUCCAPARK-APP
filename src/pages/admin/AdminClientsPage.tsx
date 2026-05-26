import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarHeart, Gift, MessageCircle, Phone, Search, Star, UserRound, Users, X } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { useClientsData, type ClientVisitHistoryItem } from '../../hooks/useClients'
import { formatShortTime, getLocalDateKey } from '../../utils/date'
import { formatGuarani } from '../../utils/money'
import type { CanteenOrder, ChildProfile, EventGuest } from '../../types'

type ClientFilter = 'all' | 'birthday' | 'thisMonth' | 'visit' | 'event' | 'frequent'

const filters: Array<{ id: ClientFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'birthday', label: 'Cumpleanos proximos' },
  { id: 'thisMonth', label: 'Visito este mes' },
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

const getTotalActivity = (child: ChildProfile) => child.visitCount + child.eventGuestCount

const childSearchText = (child: ChildProfile) =>
  [child.name, child.mainCustomerName, child.customerName, child.mainCustomerPhone, child.customerPhone].join(' ').toLocaleLowerCase('es-PY')

const isChildFromSource = (child: ChildProfile, source: 'visit' | 'event') => child.lastSource === source

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

const normalizePhoneForWhatsApp = (phone?: string) => {
  const digits = (phone ?? '').replace(/\D/g, '')
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

export function AdminClientsPage() {
  const { canteenOrders, children, error, eventGuests, isLoading, visits } = useClientsData()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

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
    return children.filter((child) => {
      const birthday = nextBirthdayInfo(child.birthDate, now)
      const matchesSearch = !normalizedSearch || childSearchText(child).includes(normalizedSearch)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'birthday' && Boolean(birthday && birthday.daysUntil <= 30)) ||
        (filter === 'thisMonth' && Boolean(child.lastVisitAt && getLocalDateKey(child.lastVisitAt).startsWith(currentMonth))) ||
        (filter === 'visit' && isChildFromSource(child, 'visit')) ||
        (filter === 'event' && isChildFromSource(child, 'event')) ||
        (filter === 'frequent' && getTotalActivity(child) >= 3)
      return matchesSearch && matchesFilter
    })
  }, [children, currentMonth, filter, now, search])

  const selectedChild = children.find((child) => child.id === selectedChildId) ?? null
  const selectedVisits = selectedChild ? getChildVisits(selectedChild, visits) : []
  const selectedGuests = selectedChild ? getChildGuests(selectedChild, eventGuests) : []
  const selectedOrders = selectedChild ? getChildOrders(selectedChild, canteenOrders, visits) : []
  const selectedBirthday = nextBirthdayInfo(selectedChild?.birthDate, now)
  const selectedConsumptionTotal = selectedOrders.reduce((sum, order) => sum + order.total, 0)

  const openProfile = (childId: string) => setSelectedChildId(childId)
  const closeProfile = () => setSelectedChildId(null)

  return (
    <>
      <AdminModuleHeader
        eyebrow="Base comercial"
        title="Clientes"
        description="Ninos, responsables, cumpleanos proximos e historial de visitas y eventos."
      />

      <div className="metric-grid clients-metrics">
        <MetricCard label="Total de ninos" value={String(children.length)} detail="Perfiles permanentes" icon={<Users />} color="var(--turquoise)" />
        <MetricCard label="Cumpleanos proximos" value={String(upcomingBirthdays.length)} detail="Proximos 30 dias" icon={<Gift />} color="var(--yellow)" />
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
          detail="3 o mas registros"
          icon={<CalendarHeart />}
          color="var(--green)"
        />
      </div>

      <section className="panel upcoming-panel clients-full-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <Gift color="var(--yellow)" />
            Cumpleanos proximos
          </h2>
          <StatusPill tone="warning">{upcomingBirthdays.length} en 30 dias</StatusPill>
        </div>
        <div className="birthday-wide-list">
          {upcomingBirthdays.map(({ birthday, child }) => {
            const whatsappUrl = buildWhatsAppUrl(child)
            return (
              <article className="birthday-card birthday-card-wide" key={child.id}>
                <div>
                  <strong>{child.name}</strong>
                  <p className="muted">
                    Cumple: {formatBirthday(birthday.date)} · Cumple {birthday.turningAge} anos en {birthday.daysUntil} dias
                  </p>
                  <p className="muted">
                    Responsable: {child.mainCustomerName || child.customerName || 'Sin dato'} · {child.mainCustomerPhone || child.customerPhone || 'Sin telefono'}
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
          {upcomingBirthdays.length === 0 ? <div className="empty-state">No hay cumpleanos proximos cargados.</div> : null}
        </div>
      </section>

      <section className="panel clients-list-panel clients-full-panel">
        <div className="panel-header clients-toolbar">
          <h2 className="panel-title">
            <UserRound color="var(--orange)" />
            Ninos registrados
          </h2>
          <StatusPill tone="info">{filteredChildren.length} resultados</StatusPill>
        </div>

        <label className="field search-field">
          <span>
            <Search size={16} /> Buscar
          </span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, responsable o telefono" value={search} />
        </label>

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
            return (
              <button className="client-row" key={child.id} onClick={() => openProfile(child.id)} type="button">
                <span>
                  <strong>{child.name}</strong>
                  <small>{child.mainCustomerName || child.customerName || 'Responsable sin dato'}</small>
                </span>
                <span>{child.mainCustomerPhone || child.customerPhone || 'Sin telefono'}</span>
                <span>{birthday ? `${birthday.daysUntil} dias` : 'Sin cumple'}</span>
                <span>{getTotalActivity(child)} registros</span>
                <StatusPill tone={child.lastSource === 'event' ? 'warning' : 'info'}>{child.lastSource === 'event' ? 'Evento' : 'Visita'}</StatusPill>
              </button>
            )
          })}
        </div>
      </section>

      {selectedChild ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card client-profile-modal" role="dialog" aria-modal="true" aria-label={`Perfil de ${selectedChild.name}`}>
            <div className="modal-header">
              <div className="client-profile-header">
                <div>
                  <p className="eyebrow">Perfil del nino</p>
                  <h2>{selectedChild.name}</h2>
                  <p className="muted">
                    {selectedChild.mainCustomerName || selectedChild.customerName || 'Responsable sin dato'} ·{' '}
                    {selectedChild.mainCustomerPhone || selectedChild.customerPhone || 'Sin telefono'}
                  </p>
                </div>
                <StatusPill tone={selectedBirthday && selectedBirthday.daysUntil <= 30 ? 'warning' : 'info'}>
                  {selectedBirthday ? `Cumple en ${selectedBirthday.daysUntil} dias` : 'Sin cumple'}
                </StatusPill>
              </div>
              <button className="icon-button modal-close" onClick={closeProfile} type="button" aria-label="Cerrar perfil">
                <X size={18} />
              </button>
            </div>

            <div className="client-profile-grid">
              <span>
                <strong>{formatBirthday(selectedBirthday?.date)}</strong>
                Proximo cumple
              </span>
              <span>
                <strong>{selectedBirthday ? `${selectedBirthday.turningAge} anos` : selectedChild.ageRange || '--'}</strong>
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
                <strong>{formatGuarani(selectedConsumptionTotal)}</strong>
                Consumo asociado
              </span>
              <span>
                <strong>{formatDate(selectedChild.lastVisitAt)}</strong>
                Ultima visita
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
                Enviar promocion
              </button>
              <Link className="button ghost" to="/admin/reservas">
                <CalendarHeart size={17} />
                Crear reserva
              </Link>
            </div>

            <div className="client-history-section">
              <h3>Historial de visitas</h3>
              <div className="module-list">
                {selectedVisits.slice(0, 6).map((visit) => {
                  const visitOrders = canteenOrders.filter((order) => order.visitId === visit.id)
                  const visitConsumption = visitOrders.reduce((sum, order) => sum + order.total, 0)
                  return (
                    <div className="module-row" key={visit.id}>
                      <div>
                        <strong>{formatDate(visit.startedAt ?? visit.createdAt)}</strong>
                        <p className="muted">
                          {visit.planName || 'Visita normal'} · {visit.status || 'registrada'} · ingreso {formatShortTime(visit.startedAt)}
                        </p>
                      </div>
                      <StatusPill tone={visit.paymentStatus === 'paid' ? 'available' : 'warning'}>{visit.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}</StatusPill>
                      <strong>{visitConsumption ? formatGuarani(visitConsumption) : 'Sin consumo'}</strong>
                    </div>
                  )
                })}
                {selectedVisits.length === 0 ? <div className="empty-state">Sin visitas normales registradas.</div> : null}
              </div>
            </div>

            <div className="client-history-section">
              <h3>Historial de eventos</h3>
              <div className="module-list">
                {selectedGuests.slice(0, 6).map((guest) => (
                  <div className="module-row" key={guest.id}>
                    <div>
                      <strong>{guest.eventName}</strong>
                      <p className="muted">
                        {guest.eventDate} · cumple/evento de {guest.birthdayChildName}
                      </p>
                    </div>
                    <StatusPill tone={guest.isExtra ? 'warning' : 'available'}>{guest.isExtra ? 'Adicional' : 'Invitado'}</StatusPill>
                  </div>
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

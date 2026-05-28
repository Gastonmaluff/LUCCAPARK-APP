import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Monitor, PartyPopper, Power, Square, XCircle } from 'lucide-react'
import { EventCapacityBadge } from './EventCapacityBadge'
import { EventGuestList } from './EventGuestList'
import { EventPaymentModal } from './EventPaymentModal'
import { EventStatusBadge } from './EventStatusBadge'
import { EventTvImageModal } from './EventTvImageModal'
import { ExpenseModal } from '../finance/ExpenseModal'
import { TaskModal } from '../tasks/TaskModal'
import { StatusPill } from '../StatusPill'
import { updateEventStatus } from '../../services/eventService'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useFinanceData } from '../../hooks/useFinance'
import { useEventGuests } from '../../hooks/useEvents'
import { useTasks } from '../../hooks/useTasks'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useUsers } from '../../hooks/useUsers'
import { updateTaskStatus } from '../../services/taskService'
import { canCancelEvent, canStartEvent, formatEventTimeRange, getEventCapacityStats } from '../../utils/eventCapacity'
import { getEventFinancialLabel, getEventPaidAmount, getEventPendingAmount } from '../../utils/eventFinance'
import { formatGuarani } from '../../utils/money'
import type { LuccaEvent } from '../../types'

interface EventDetailPanelProps {
  event: LuccaEvent | null
}

const methodLabel = (method?: string, cardType?: string) => {
  if (method === 'card' && cardType === 'debit') return 'Tarjeta débito'
  if (method === 'card' && cardType === 'credit') return 'Tarjeta crédito'
  if (method === 'cash') return 'Efectivo'
  if (method === 'transfer') return 'Transferencia'
  if (method === 'qr') return 'QR'
  if (method === 'other') return 'Otro'
  return 'Sin método'
}

const expenseCategoryLabel: Record<string, string> = {
  canteen_purchase: 'Cantina / compra de productos',
  cleaning: 'Limpieza',
  decoration: 'Decoración',
  maintenance: 'Mantenimiento',
  operations: 'Operativa general',
  other: 'Otro',
  services: 'Servicios',
  wages: 'Sueldos / jornales',
}

const taskPriorityLabel: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

const taskStatusLabel: Record<string, string> = {
  completed: 'Completada',
  in_progress: 'En proceso',
  pending: 'Pendiente',
}

export function EventDetailPanel({ event }: EventDetailPanelProps) {
  const { error, guests, isLoading } = useEventGuests(event?.id)
  const { orders: canteenOrders } = useCanteenOrders()
  const finance = useFinanceData({ from: '2000-01-01', to: '2099-12-31' })
  const { tasks } = useTasks()
  const { profile } = useUserProfile()
  const usersResult = useUsers()
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isTvModalOpen, setIsTvModalOpen] = useState(false)
  const [isExpenseOpen, setIsExpenseOpen] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isTaskOpen, setIsTaskOpen] = useState(false)
  const userNameByUid = new Map(usersResult.users.map((user) => [user.uid, user.displayName]))
  const resolveUserName = (uid?: string | null, storedName?: string) => storedName || (uid ? userNameByUid.get(uid) : '') || 'Sin usuario'

  if (!event) {
    return (
      <article className="panel">
        <div className="empty-state">Selecciona una reserva para ver el detalle e invitados.</div>
      </article>
    )
  }

  const stats = getEventCapacityStats(event, guests.length || event.registeredGuestsCount)
  const eventCanteenOrders = canteenOrders.filter((order) => order.eventId === event.id && order.status !== 'cancelled')
  const openEventCanteenOrders = eventCanteenOrders.filter((order) => order.status === 'open')
  const eventCanteenTotal = eventCanteenOrders.reduce((sum, order) => sum + order.total, 0)
  const eventPayments = finance.payments.filter((payment) => payment.eventId === event.id)
  const eventExpenses = finance.expenses.filter((expense) => expense.eventId === event.id)
  const eventCollectedTotal = getEventPaidAmount(event, eventPayments)
  const eventPendingAmount = getEventPendingAmount(event, eventPayments)
  const financialStatus = getEventFinancialLabel(event, eventPayments)
  const eventCanteenCollected = eventCanteenOrders.filter((order) => order.status === 'paid').reduce((sum, order) => sum + order.total, 0)
  const eventExpensesTotal = eventExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const eventEstimatedResult = eventCollectedTotal + eventCanteenCollected - eventExpensesTotal
  const eventTasks = tasks.filter((task) => task.eventId === event.id)

  const changeStatus = async (status: LuccaEvent['status']) => {
    setIsUpdatingStatus(true)
    setMessage(null)
    try {
      await updateEventStatus(event.id, status)
      setMessage('Estado actualizado.')
    } catch (statusError) {
      setMessage(statusError instanceof Error ? statusError.message : 'No se pudo actualizar el estado.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <article className="panel event-detail-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <PartyPopper color="var(--orange)" />
          Detalle del evento
        </h2>
        <EventStatusBadge status={event.status} />
      </div>

      {message ? <div className="form-alert success">{message}</div> : null}

      <div className="event-detail-grid">
        <div>
          <p className="eyebrow">Evento</p>
          <h3>{event.title}</h3>
          <p className="muted">
            {event.customerName} - {event.date} - {formatEventTimeRange(event)}
          </p>
          {event.childId ? (
            <div className="event-linked-child">
              <Link className="button ghost small-button" to={`/admin/clientes?childId=${event.childId}`}>
                Ver perfil del niño
              </Link>
            </div>
          ) : null}
        </div>
        <EventCapacityBadge event={event} guestCount={guests.length || event.registeredGuestsCount} />
      </div>

      <div className="event-finance-summary">
        <span><small>Monto total</small><strong>{event.totalAmount ? formatGuarani(event.totalAmount) : 'Sin monto'}</strong></span>
        <span><small>Total cobrado</small><strong>{formatGuarani(eventCollectedTotal)}</strong></span>
        <span><small>Saldo pendiente</small><strong>{formatGuarani(eventPendingAmount)}</strong></span>
      </div>

      <div className="event-owner-summary">
        <strong>Entraron {stats.registeredGuestsCount} ninos de {stats.contractedChildrenCount} contratados</strong>
        <StatusPill tone={stats.extraGuestsCount > 0 ? 'danger' : stats.includedRemaining <= 5 ? 'warning' : 'available'}>
          Adicionales: {stats.extraGuestsCount}
        </StatusPill>
      </div>

      <div className="event-owner-summary">
        <strong>Cantina del evento: {formatGuarani(eventCanteenTotal)}</strong>
        <StatusPill tone={openEventCanteenOrders.length > 0 ? 'warning' : 'available'}>
          {openEventCanteenOrders.length} cuentas pendientes
        </StatusPill>
      </div>

      <section className="event-finance-block">
        <div className="panel-header">
          <h3 className="panel-title">Finanzas del evento</h3>
          <div className="module-actions">
            <StatusPill tone={eventPendingAmount <= 0 && event.totalAmount ? 'available' : eventCollectedTotal > 0 ? 'warning' : 'info'}>
              {financialStatus}
            </StatusPill>
            <button className="button primary" onClick={() => setIsPaymentOpen(true)} type="button">
              + Registrar cobro
            </button>
            <button className="button ghost" onClick={() => setIsExpenseOpen(true)} type="button">
              + Registrar gasto asociado
            </button>
          </div>
        </div>

        <div className="event-finance-summary">
          <span><small>Paquete contratado</small><strong>{event.totalAmount ? formatGuarani(event.totalAmount) : 'Sin monto'}</strong></span>
          <span><small>Total cobrado</small><strong>{formatGuarani(eventCollectedTotal)}</strong></span>
          <span><small>Seña registrada</small><strong>{formatGuarani(Math.min(eventCollectedTotal, event.depositAmount ?? eventCollectedTotal))}</strong></span>
          <span><small>Saldo pendiente</small><strong>{formatGuarani(eventPendingAmount)}</strong></span>
          <span><small>Cantina cobrada</small><strong>{formatGuarani(eventCanteenCollected)}</strong></span>
          <span><small>Gastos asociados</small><strong>{formatGuarani(eventExpensesTotal)}</strong></span>
          <span><small>Resultado estimado</small><strong>{formatGuarani(eventEstimatedResult)}</strong></span>
        </div>

        <div className="event-subsection-title">Historial de cobros</div>
        <div className="module-list">
          {eventPayments.length === 0 ? <div className="empty-state">No hay cobros registrados para este evento.</div> : null}
          {eventPayments.map((payment) => (
            <article className="event-ledger-card" key={payment.id}>
              <div className="event-ledger-main">
                <strong>{payment.description || 'Cobro de evento'}</strong>
                <p className="muted">
                  {payment.paidAt?.toLocaleString('es-PY') ?? 'Sin fecha'} · {methodLabel(payment.paymentMethod, payment.cardType)}
                </p>
                <p className="muted">Registrado por: {resolveUserName(payment.createdBy, payment.createdByName)}</p>
              </div>
              <strong className="event-ledger-amount">{formatGuarani(payment.totalPaid)}</strong>
            </article>
          ))}
        </div>

        <div className="event-subsection-title">Gastos asociados</div>
        <div className="module-list">
          {eventExpenses.length === 0 ? <div className="empty-state">No hay gastos asociados a este evento.</div> : null}
          {eventExpenses.map((expense) => (
            <article className="event-ledger-card" key={expense.id}>
              <div className="event-ledger-main">
                <strong>{expense.description}</strong>
                <p className="muted">
                  {expenseCategoryLabel[expense.category] ?? expense.category} · {expense.spentAt?.toLocaleDateString('es-PY') ?? expense.date}
                </p>
                <p className="muted">
                  Registrado por: {resolveUserName(expense.createdByUid || expense.createdBy, expense.createdByName)}
                </p>
              </div>
              <div className="event-ledger-side">
                <strong className="event-ledger-amount">{formatGuarani(expense.amount)}</strong>
                {expense.receiptUrl ? (
                  <a className="button ghost small-button" href={expense.receiptUrl} rel="noreferrer" target="_blank">
                    Ver comprobante
                  </a>
                ) : (
                  <StatusPill tone="info">Sin comprobante</StatusPill>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="event-finance-block">
        <div className="panel-header">
          <h3 className="panel-title">Tareas del evento</h3>
          <button className="button ghost" onClick={() => setIsTaskOpen(true)} type="button">
            + Crear tarea para este evento
          </button>
        </div>
        <div className="module-list">
          {eventTasks.length === 0 ? <div className="empty-state">No hay tareas vinculadas a este evento.</div> : null}
          {eventTasks.map((task) => (
            <article className="event-task-card" key={task.id}>
              <div className="event-task-main">
                <strong>{task.title}</strong>
                <p className="muted">
                  Asignada a: {resolveUserName(task.assignedToUid || task.assignedTo, task.assignedToName)} · Prioridad: {taskPriorityLabel[task.priority] ?? task.priority}
                </p>
                <p className="muted">
                  Asignada por: {resolveUserName(task.assignedByUid || task.createdBy, task.assignedByName || task.createdByName)}
                  {task.dueAt ? ` · Vence: ${task.dueAt.toLocaleString('es-PY')}` : ''}
                </p>
              </div>
              <div className="event-task-side">
                <StatusPill tone={task.status === 'completed' ? 'available' : task.status === 'in_progress' ? 'info' : 'warning'}>
                  {taskStatusLabel[task.status] ?? task.status}
                </StatusPill>
                {task.status !== 'completed' ? (
                  <button className="button ghost small-button" onClick={() => updateTaskStatus(task, 'completed')} type="button">
                    Completar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="module-actions event-actions">
        {canStartEvent(event) ? (
          <button className="button primary" disabled={isUpdatingStatus} onClick={() => changeStatus('active')} type="button">
            <Power size={18} />
            Empezar evento
          </button>
        ) : null}
        {event.status === 'active' ? (
          <button className="button ghost" disabled={isUpdatingStatus} onClick={() => changeStatus('finished')} type="button">
            <Square size={18} />
            Finalizar evento
          </button>
        ) : null}
        {canCancelEvent(event) ? (
          <button className="button danger" disabled={isUpdatingStatus} onClick={() => changeStatus('cancelled')} type="button">
            <XCircle size={18} />
            Cancelar reserva
          </button>
        ) : null}
      </div>

      <section className="tv-settings-form">
        <div className="panel-header">
          <h3 className="panel-title">
            <Monitor color="var(--turquoise)" />
            Imagen para TV
          </h3>
          <StatusPill tone={event.tvDisplayEnabled ? 'available' : 'blocked'}>
            {event.tvDisplayEnabled ? 'Activa' : 'Desactivada'}
          </StatusPill>
        </div>
        <p className="muted">Carga una unica imagen horizontal para mostrarla a pantalla completa en /tv.</p>
        {event.tvImageUrl || event.tvBannerImageUrl ? (
          <div className="event-tv-thumb">
            <img alt="Imagen actual de TV" src={event.tvImageUrl || event.tvBannerImageUrl} />
          </div>
        ) : null}
        <button className="button ghost" onClick={() => setIsTvModalOpen(true)} type="button">
          Configurar TV
        </button>
      </section>

      <div className="panel-header guests-detail-header">
        <h3 className="panel-title">Invitados del evento</h3>
        <StatusPill tone="info">{guests.length} registrados</StatusPill>
      </div>
      <EventGuestList error={error} guests={guests} isLoading={isLoading} />
      {isTvModalOpen ? <EventTvImageModal event={event} onClose={() => setIsTvModalOpen(false)} /> : null}
      {isExpenseOpen ? <ExpenseModal events={[event]} initialEvent={event} onClose={() => setIsExpenseOpen(false)} /> : null}
      {isPaymentOpen ? <EventPaymentModal event={event} existingPayments={eventPayments} onClose={() => setIsPaymentOpen(false)} onDone={() => setMessage('Cobro registrado.')} /> : null}
      {isTaskOpen ? <TaskModal currentUserUid={profile?.uid} events={[event]} initialEvent={event} onClose={() => setIsTaskOpen(false)} users={usersResult.users} /> : null}
    </article>
  )
}

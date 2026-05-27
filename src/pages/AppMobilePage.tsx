import { LogOut, Plus } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { useMemo, useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { ExpenseModal } from '../components/finance/ExpenseModal'
import { paymentLabel } from '../components/payments/paymentOptions'
import { TaskModal } from '../components/tasks/TaskModal'
import { auth } from '../config/firebase'
import { useEventDayContext } from '../hooks/useEventDayContext'
import { useAssignedTasks } from '../hooks/useTasks'
import { useMyExpenses } from '../hooks/useMyExpenses'
import { useUserProfile } from '../hooks/useUserProfile'
import { useUsers } from '../hooks/useUsers'
import { updateTaskStatus } from '../services/taskService'
import { formatGuarani } from '../utils/money'
import type { ExpenseCategory, PaymentMethod } from '../types'

const categoryLabel: Record<ExpenseCategory, string> = {
  canteen_purchase: 'Cantina / compra de productos',
  cleaning: 'Limpieza',
  decoration: 'Decoración',
  maintenance: 'Mantenimiento',
  operations: 'Compra operativa',
  other: 'Otro',
  services: 'Servicios',
  wages: 'Sueldos / jornales',
}

const formatPaymentMethod = (method: string, cardType?: string) => {
  if (method === 'card' && cardType === 'debit') return 'Tarjeta de débito'
  if (method === 'card' && cardType === 'credit') return 'Tarjeta de crédito'
  return paymentLabel[method as Exclude<PaymentMethod, ''>] ?? 'Sin método'
}

export function AppMobilePage() {
  const { events, featuredEvent } = useEventDayContext()
  const { permissions, profile } = useUserProfile()
  const { error: tasksError, tasks } = useAssignedTasks(profile?.uid)
  const myExpenses = useMyExpenses(profile?.uid)
  const usersResult = useUsers(permissions.canAssignTasks)
  const [isExpenseOpen, setIsExpenseOpen] = useState(false)
  const [isTaskOpen, setIsTaskOpen] = useState(false)
  const [isExpensesOpen, setIsExpensesOpen] = useState(false)

  const myTasks = useMemo(() => tasks.filter((task) => task.status !== 'completed'), [tasks])
  const eventTasks = featuredEvent ? myTasks.filter((task) => task.eventId === featuredEvent.id) : []

  if (profile && !profile.isActive) {
    return (
      <main className="mobile-app-page">
        <section className="mobile-app-shell">
          <article className="panel">
            <BrandLogo className="compact" />
            <div className="empty-state">No tenés permisos para acceder a esta sección.</div>
            <button className="button ghost" onClick={() => signOut(auth)} type="button">
              Cerrar sesión
            </button>
          </article>
        </section>
      </main>
    )
  }

  return (
    <main className="mobile-app-page">
      <section className="mobile-app-shell">
        <header className="mobile-app-header">
          <BrandLogo className="compact" />
          <div>
            <p className="eyebrow">Hola</p>
            <h1>{profile?.displayName ?? 'Usuario'}</h1>
            <span>{permissions.roleLabel} · {new Date().toLocaleDateString('es-PY')}</span>
          </div>
          <button className="icon-button" onClick={() => signOut(auth)} type="button" aria-label="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </header>

        <article className="panel">
          <div className="panel-header">
            <h2>Mis tareas pendientes</h2>
            {permissions.canAssignTasks ? (
              <button className="button ghost" onClick={() => setIsTaskOpen(true)} type="button">
                + Nueva
              </button>
            ) : null}
          </div>
          {tasksError ? <div className="form-alert error">No se pudieron cargar tareas: {tasksError}</div> : null}
          <div className="module-list">
            {myTasks.length === 0 ? <div className="empty-state">No tenés tareas pendientes.</div> : null}
            {myTasks.map((task) => (
              <div className={`mobile-task-card priority-${task.priority}`} key={task.id}>
                <strong>{task.title}</strong>
                {task.description ? <small>{task.description}</small> : null}
                <small>
                  {task.priority} {task.dueAt ? `· ${task.dueAt.toLocaleString('es-PY')}` : ''}
                  {task.eventName ? ` · ${task.eventName}` : ''}
                </small>
                <small>{task.assignedByName || task.createdByName ? `Asignada por: ${task.assignedByName || task.createdByName}` : 'Asignación anterior sin usuario identificado'}</small>
                <div className="module-actions">
                  {task.status === 'pending' ? (
                    <button className="button secondary" onClick={() => updateTaskStatus(task, 'in_progress')} type="button">
                      En proceso
                    </button>
                  ) : null}
                  <button className="button primary" onClick={() => updateTaskStatus(task, 'completed')} type="button">
                    Completar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <button className="button primary mobile-big-action" disabled={!permissions.canRegisterExpenses} onClick={() => setIsExpenseOpen(true)} type="button">
          <Plus size={20} />
          Registrar gasto
        </button>

        <article className="panel">
          <div className="panel-header">
            <button className="finance-panel-toggle" onClick={() => setIsExpensesOpen((current) => !current)} type="button">
              <span>Mis gastos cargados</span>
              <small>{myExpenses.expenses.length} registros</small>
            </button>
          </div>
          {isExpensesOpen ? (
            <div className="module-list">
              {myExpenses.error ? <div className="form-alert error">No se pudieron cargar tus gastos: {myExpenses.error}</div> : null}
              {myExpenses.isLoading ? <div className="empty-state">Cargando gastos...</div> : null}
              {!myExpenses.isLoading && myExpenses.expenses.length === 0 ? <div className="empty-state">Todavía no cargaste gastos.</div> : null}
              {myExpenses.expenses.map((expense) => (
                <div className="mobile-task-card" key={expense.id}>
                  <strong>{expense.description}</strong>
                  <small>{expense.eventName ? `Evento: ${expense.eventName}` : 'Operativa general'}</small>
                  <small>
                    {categoryLabel[expense.category]} · {formatPaymentMethod(expense.paymentMethod, expense.cardType)} · {expense.spentAt?.toLocaleString('es-PY') ?? expense.date}
                  </small>
                  <div className="module-actions">
                    <strong>{formatGuarani(expense.amount)}</strong>
                    {expense.receiptUrl ? (
                      <a className="button ghost small-button" href={expense.receiptUrl} rel="noreferrer" target="_blank">
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="muted">Sin comprobante</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        {featuredEvent ? (
          <article className="panel">
            <p className="eyebrow">Evento de hoy</p>
            <h2>{featuredEvent.title}</h2>
            <p className="muted">{featuredEvent.startTime} a {featuredEvent.endTime}</p>
            <div className="module-list">
              {eventTasks.length === 0 ? <div className="empty-state">No tenés tareas para este evento.</div> : null}
              {eventTasks.map((task) => (
                <div className="module-row" key={task.id}>
                  <span>{task.title}</span>
                  <button className="button ghost" onClick={() => updateTaskStatus(task, 'completed')} type="button">
                    Completar
                  </button>
                </div>
              ))}
            </div>
          </article>
        ) : null}
      </section>

      {isExpenseOpen ? <ExpenseModal events={events} onClose={() => setIsExpenseOpen(false)} /> : null}
      {isTaskOpen ? <TaskModal currentUserUid={profile?.uid} events={events} onClose={() => setIsTaskOpen(false)} users={usersResult.users} /> : null}
    </main>
  )
}

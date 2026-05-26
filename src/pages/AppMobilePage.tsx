import { LogOut, Plus } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { useMemo, useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { ExpenseModal } from '../components/finance/ExpenseModal'
import { TaskModal } from '../components/tasks/TaskModal'
import { auth } from '../config/firebase'
import { useEventDayContext } from '../hooks/useEventDayContext'
import { useAssignedTasks } from '../hooks/useTasks'
import { useUserProfile } from '../hooks/useUserProfile'
import { updateTaskStatus } from '../services/taskService'

export function AppMobilePage() {
  const { events, featuredEvent } = useEventDayContext()
  const { permissions, profile } = useUserProfile()
  const { error: tasksError, tasks } = useAssignedTasks(profile?.uid)
  const [isExpenseOpen, setIsExpenseOpen] = useState(false)
  const [isTaskOpen, setIsTaskOpen] = useState(false)

  const myTasks = useMemo(() => tasks.filter((task) => task.status !== 'completed'), [tasks])
  const eventTasks = featuredEvent ? myTasks.filter((task) => task.eventId === featuredEvent.id) : []

  if (profile && !profile.isActive) {
    return (
      <main className="mobile-app-page">
        <section className="mobile-app-shell">
          <article className="panel">
            <BrandLogo className="compact" />
            <div className="empty-state">No tenes permisos para acceder a esta seccion.</div>
            <button className="button ghost" onClick={() => signOut(auth)} type="button">
              Cerrar sesion
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
            <span>{permissions.roleLabel}</span>
          </div>
          <button className="icon-button" onClick={() => signOut(auth)} type="button" aria-label="Cerrar sesion">
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
            {myTasks.length === 0 ? <div className="empty-state">No tenes tareas pendientes.</div> : null}
            {myTasks.map((task) => (
              <div className={`mobile-task-card priority-${task.priority}`} key={task.id}>
                <strong>{task.title}</strong>
                <small>
                  {task.priority} {task.dueAt ? `· ${task.dueAt.toLocaleString('es-PY')}` : ''}
                  {task.eventName ? ` · ${task.eventName}` : ''}
                </small>
                <div className="module-actions">
                  {task.status === 'pending' ? <button className="button secondary" onClick={() => updateTaskStatus(task, 'in_progress')} type="button">En proceso</button> : null}
                  <button className="button primary" onClick={() => updateTaskStatus(task, 'completed')} type="button">Completar</button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <button className="button primary mobile-big-action" disabled={!permissions.canRegisterExpenses} onClick={() => setIsExpenseOpen(true)} type="button">
          <Plus size={20} />
          Registrar gasto
        </button>

        {featuredEvent ? (
          <article className="panel">
            <p className="eyebrow">Evento de hoy</p>
            <h2>{featuredEvent.title}</h2>
            <p className="muted">{featuredEvent.startTime} a {featuredEvent.endTime}</p>
            <div className="module-list">
              {eventTasks.length === 0 ? <div className="empty-state">No tenes tareas para este evento.</div> : null}
              {eventTasks.map((task) => (
                <div className="module-row" key={task.id}>
                  <span>{task.title}</span>
                  <button className="button ghost" onClick={() => updateTaskStatus(task, 'completed')} type="button">Completar</button>
                </div>
              ))}
            </div>
          </article>
        ) : null}
      </section>

      {isExpenseOpen ? <ExpenseModal events={events} onClose={() => setIsExpenseOpen(false)} /> : null}
      {isTaskOpen ? <TaskModal events={events} onClose={() => setIsTaskOpen(false)} /> : null}
    </main>
  )
}

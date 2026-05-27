import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Plus, TriangleAlert } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { TaskModal } from '../../components/tasks/TaskModal'
import { useEventDayContext } from '../../hooks/useEventDayContext'
import { useTasks } from '../../hooks/useTasks'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useUsers } from '../../hooks/useUsers'
import { updateTaskStatus } from '../../services/taskService'
import type { LuccaTask } from '../../types'

type TaskFilter = 'mine' | 'assigned_by_me' | 'all' | 'pending' | 'in_progress' | 'completed' | 'events'

const priorityLabel: Record<LuccaTask['priority'], string> = { high: 'Alta', low: 'Baja', medium: 'Media' }
const statusLabel: Record<LuccaTask['status'], string> = { completed: 'Completada', in_progress: 'En proceso', pending: 'Pendiente' }

export function AdminTasksPage() {
  const { events } = useEventDayContext()
  const { permissions, profile } = useUserProfile()
  const { error, isLoading, summary, tasks } = useTasks()
  const usersResult = useUsers(permissions.canAssignTasks)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [editingTask, setEditingTask] = useState<LuccaTask | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === 'mine') {
          return task.assignedToUid === profile?.uid || task.assignedTo === profile?.uid || task.assignedTo === profile?.email || task.assignedToName === profile?.displayName
        }
        if (filter === 'assigned_by_me') return task.assignedByUid === profile?.uid || task.createdBy === profile?.uid
        if (filter === 'events') return Boolean(task.eventId)
        if (filter === 'all') return true
        return task.status === filter
      }),
    [filter, profile, tasks],
  )

  return (
    <>
      <AdminModuleHeader
        eyebrow="Operación"
        title="Tareas"
        description="Asignación y seguimiento de tareas operativas y de eventos."
        action={
          <button className="button primary" disabled={!permissions.canManageTasks} onClick={() => setIsModalOpen(true)} type="button">
            <Plus size={18} />
            Nueva tarea
          </button>
        }
      />

      <div className="metric-grid">
        <MetricCard color="var(--yellow)" detail="Por hacer" icon={<Clock3 />} label="Pendientes" value={String(summary.pending)} />
        <MetricCard color="var(--turquoise)" detail="En marcha" icon={<Clock3 />} label="En proceso" value={String(summary.inProgress)} />
        <MetricCard color="var(--green)" detail="Cerradas hoy" icon={<CheckCircle2 />} label="Completadas hoy" value={String(summary.completedToday)} />
        <MetricCard color="var(--red)" detail="Fuera de plazo" icon={<TriangleAlert />} label="Vencidas" value={String(summary.overdue)} />
      </div>

      <article className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Listado de tareas</h2>
          <StatusPill tone="info">{filteredTasks.length} visibles</StatusPill>
        </div>
        <div className="reservation-filter-row secondary">
          {([
            ['mine', 'Mis tareas'],
            ['assigned_by_me', 'Asignadas por mí'],
            ['all', 'Todas'],
            ['pending', 'Pendientes'],
            ['in_progress', 'En proceso'],
            ['completed', 'Completadas'],
            ['events', 'Vinculadas a eventos'],
          ] as Array<[TaskFilter, string]>).map(([value, label]) => (
            <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)} type="button">
              {label}
            </button>
          ))}
        </div>
        {usersResult.error ? <div className="form-alert error">No se pudieron cargar usuarios: {usersResult.error}</div> : null}
        {error ? <div className="form-alert error">No se pudieron cargar tareas: {error}</div> : null}
        {isLoading ? <div className="empty-state">Cargando tareas...</div> : null}
        <div className="module-list task-list">
          {filteredTasks.length === 0 && !isLoading ? <div className="empty-state">No hay tareas para mostrar.</div> : null}
          {filteredTasks.map((task) => (
            <div className={`module-row task-row priority-${task.priority}`} key={task.id}>
              <span>
                <strong>{task.title}</strong>
                <small>Prioridad: {priorityLabel[task.priority]}{task.dueAt ? ` · Vence: ${task.dueAt.toLocaleString('es-PY')}` : ''}</small>
                <small>Asignada a: {task.assignedToName || task.assignedTo || 'Asignación anterior sin usuario vinculado'}</small>
                <small>Asignada por: {task.assignedByName || task.createdByName || 'Usuario no identificado'}{task.eventName ? ` · Evento: ${task.eventName}` : ''}</small>
              </span>
              <StatusPill tone={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'info'}>{priorityLabel[task.priority]}</StatusPill>
              <StatusPill tone={task.status === 'completed' ? 'available' : task.status === 'in_progress' ? 'info' : 'warning'}>{statusLabel[task.status]}</StatusPill>
              <div className="module-actions">
                <button className="button ghost" onClick={() => setEditingTask(task)} type="button">
                  Editar
                </button>
                {task.status === 'pending' ? (
                  <button className="button secondary" onClick={() => updateTaskStatus(task, 'in_progress')} type="button">
                    En proceso
                  </button>
                ) : null}
                {task.status !== 'completed' ? (
                  <button className="button primary" onClick={() => updateTaskStatus(task, 'completed')} type="button">
                    Completar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </article>

      {isModalOpen ? <TaskModal currentUserUid={profile?.uid} events={events} onClose={() => setIsModalOpen(false)} users={usersResult.users} /> : null}
      {editingTask ? <TaskModal currentUserUid={profile?.uid} events={events} onClose={() => setEditingTask(null)} task={editingTask} users={usersResult.users} /> : null}
    </>
  )
}

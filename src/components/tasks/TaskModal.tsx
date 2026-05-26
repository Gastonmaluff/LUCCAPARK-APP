import { useState } from 'react'
import { X } from 'lucide-react'
import { saveTask } from '../../services/taskService'
import type { LuccaEvent, LuccaTask } from '../../types'

interface TaskModalProps {
  events: LuccaEvent[]
  initialEvent?: LuccaEvent | null
  onClose: () => void
  onSaved?: () => void
  task?: LuccaTask | null
}

export function TaskModal({ events, initialEvent, onClose, onSaved, task }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assignedToName, setAssignedToName] = useState(task?.assignedToName ?? '')
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo ?? '')
  const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.toISOString().slice(0, 16) : '')
  const [priority, setPriority] = useState<LuccaTask['priority']>(task?.priority ?? 'medium')
  const [eventId, setEventId] = useState(task?.eventId ?? initialEvent?.id ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const selectedEvent = events.find((event) => event.id === eventId) ?? initialEvent ?? null

  const save = async () => {
    if (!title.trim()) {
      setError('Carga un titulo para la tarea.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await saveTask({
        assignedTo,
        assignedToName,
        description,
        dueAt,
        eventId: selectedEvent?.id ?? '',
        eventName: selectedEvent?.title ?? '',
        id: task?.id,
        notes,
        priority,
        status: task?.status ?? 'pending',
        title,
      })
      onSaved?.()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la tarea.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card task-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Operacion</p>
            <h2>{task ? 'Editar tarea' : 'Nueva tarea'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {error ? <div className="form-alert error">{error}</div> : null}
        <div className="form-grid compact-form">
          <label className="field">
            <span>Titulo *</span>
            <input disabled={isSaving} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label className="field">
            <span>Asignada a</span>
            <input disabled={isSaving} onChange={(event) => setAssignedToName(event.target.value)} placeholder="Nombre o usuario" value={assignedToName} />
          </label>
          <label className="field">
            <span>ID / email asignado</span>
            <input disabled={isSaving} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Opcional" value={assignedTo} />
          </label>
          <label className="field">
            <span>Fecha limite</span>
            <input disabled={isSaving} onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} />
          </label>
          <label className="field">
            <span>Prioridad</span>
            <select disabled={isSaving} onChange={(event) => setPriority(event.target.value as LuccaTask['priority'])} value={priority}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label className="field">
            <span>Evento vinculado</span>
            <select disabled={isSaving || Boolean(initialEvent)} onChange={(event) => setEventId(event.target.value)} value={eventId}>
              <option value="">Sin evento</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.title} · {event.date}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Descripcion</span>
          <textarea disabled={isSaving} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} />
        </label>
        <label className="field">
          <span>Observaciones</span>
          <textarea disabled={isSaving} onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />
        </label>
        <div className="modal-actions">
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button">Cancelar</button>
          <button className="button primary" disabled={isSaving} onClick={save} type="button">{isSaving ? 'Guardando...' : 'Guardar tarea'}</button>
        </div>
      </section>
    </div>
  )
}

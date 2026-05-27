import { Timestamp, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import type { LuccaTask } from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const mapTask = (id: string, data: Record<string, unknown>): LuccaTask => ({
  id,
  title: String(data.title ?? ''),
  description: String(data.description ?? ''),
  assignedTo: String(data.assignedTo ?? ''),
  assignedToUid: String(data.assignedToUid ?? data.assignedTo ?? ''),
  assignedToName: String(data.assignedToName ?? ''),
  assignedToEmail: String(data.assignedToEmail ?? ''),
  assignedByUid: data.assignedByUid ? String(data.assignedByUid) : null,
  assignedByName: String(data.assignedByName ?? ''),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  dueAt: dateFromTimestamp(data.dueAt),
  priority: (data.priority as LuccaTask['priority']) ?? 'medium',
  status: (data.status as LuccaTask['status']) ?? 'pending',
  eventId: String(data.eventId ?? ''),
  eventName: String(data.eventName ?? ''),
  notes: String(data.notes ?? ''),
  completedAt: dateFromTimestamp(data.completedAt),
  completedBy: data.completedBy ? String(data.completedBy) : null,
  updatedAt: dateFromTimestamp(data.updatedAt),
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

export function useTasks() {
  const [tasks, setTasks] = useState<LuccaTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let mounted = true
    ensureReceptionSession().then(() => {
      if (!mounted) return
      unsubscribe = onSnapshot(
        getCollectionRef('tasks'),
        (snapshot) => {
          setTasks(snapshot.docs.map((item) => mapTask(item.id, item.data())).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
          setIsLoading(false)
          setError(null)
        },
        (snapshotError) => {
          setError(snapshotError.message)
          setIsLoading(false)
        },
      )
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const summary = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10)
    return {
      completedToday: tasks.filter((task) => task.status === 'completed' && task.completedAt?.toISOString().slice(0, 10) === todayKey).length,
      inProgress: tasks.filter((task) => task.status === 'in_progress').length,
      overdue: tasks.filter((task) => task.status !== 'completed' && task.dueAt && task.dueAt < new Date()).length,
      pending: tasks.filter((task) => task.status === 'pending').length,
    }
  }, [tasks])

  return { error, isLoading, summary, tasks }
}

export function useAssignedTasks(assignedTo?: string | null) {
  const [tasks, setTasks] = useState<LuccaTask[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(assignedTo))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!assignedTo) {
      setTasks([])
      setIsLoading(false)
      return undefined
    }

    let unsubscribe: (() => void) | undefined
    let mounted = true
    ensureReceptionSession().then(() => {
      if (!mounted) return
      unsubscribe = onSnapshot(
        query(getCollectionRef('tasks'), where('assignedToUid', '==', assignedTo)),
        (snapshot) => {
          setTasks(snapshot.docs.map((item) => mapTask(item.id, item.data())).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
          setIsLoading(false)
          setError(null)
        },
        (snapshotError) => {
          setError(snapshotError.message)
          setIsLoading(false)
        },
      )
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [assignedTo])

  return { error, isLoading, tasks }
}

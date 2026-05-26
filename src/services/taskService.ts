import { Timestamp, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { auth } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { normalizeWhitespace } from '../utils/textFormat'
import type { LuccaTask } from '../types'

export interface SaveTaskInput {
  id?: string
  title: string
  description?: string
  assignedTo?: string
  assignedToName?: string
  dueAt?: string
  priority: LuccaTask['priority']
  status?: LuccaTask['status']
  eventId?: string
  eventName?: string
  notes?: string
}

export const saveTask = async (input: SaveTaskInput) => {
  await ensureReceptionSession()
  const user = auth.currentUser
  const taskRef = input.id ? getDocumentRef('tasks', input.id) : doc(getCollectionRef('tasks'))
  await setDoc(
    taskRef,
    {
      id: taskRef.id,
      title: normalizeWhitespace(input.title),
      description: normalizeWhitespace(input.description ?? ''),
      assignedTo: normalizeWhitespace(input.assignedTo ?? user?.uid ?? ''),
      assignedToName: normalizeWhitespace(input.assignedToName ?? user?.displayName ?? user?.email ?? 'Usuario'),
      dueAt: input.dueAt ? Timestamp.fromDate(new Date(input.dueAt)) : null,
      priority: input.priority,
      status: input.status ?? 'pending',
      eventId: input.eventId ?? '',
      eventName: normalizeWhitespace(input.eventName ?? ''),
      notes: normalizeWhitespace(input.notes ?? ''),
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? null,
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName: user?.displayName ?? user?.email ?? '' }),
    },
    { merge: true },
  )
  return taskRef.id
}

export const updateTaskStatus = async (task: LuccaTask, status: LuccaTask['status']) => {
  await ensureReceptionSession()
  const userId = auth.currentUser?.uid ?? null
  await updateDoc(getDocumentRef('tasks', task.id), {
    status,
    completedAt: status === 'completed' ? serverTimestamp() : null,
    completedBy: status === 'completed' ? userId : null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
}

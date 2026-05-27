import { Timestamp, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
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
  assignedToUid?: string
  assignedToName?: string
  assignedToEmail?: string
  dueAt?: string
  priority: LuccaTask['priority']
  status?: LuccaTask['status']
  eventId?: string
  eventName?: string
  notes?: string
}

const getCurrentUserAudit = async () => {
  const user = auth.currentUser
  if (!user) {
    return { uid: null, name: '' }
  }

  const profileSnapshot = await getDoc(getDocumentRef('users', user.uid)).catch(() => null)
  const profile = profileSnapshot?.data()
  return {
    uid: user.uid,
    name: String(profile?.displayName ?? user.displayName ?? user.email ?? 'Usuario no identificado'),
  }
}

export const saveTask = async (input: SaveTaskInput) => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  const taskRef = input.id ? getDocumentRef('tasks', input.id) : doc(getCollectionRef('tasks'))
  const assignedUid = normalizeWhitespace(input.assignedToUid ?? input.assignedTo ?? '')
  await setDoc(
    taskRef,
    {
      id: taskRef.id,
      title: normalizeWhitespace(input.title),
      description: normalizeWhitespace(input.description ?? ''),
      assignedTo: assignedUid,
      assignedToUid: assignedUid,
      assignedToName: normalizeWhitespace(input.assignedToName ?? ''),
      assignedToEmail: normalizeWhitespace(input.assignedToEmail ?? ''),
      assignedByUid: userAudit.uid,
      assignedByName: userAudit.name,
      dueAt: input.dueAt ? Timestamp.fromDate(new Date(input.dueAt)) : null,
      priority: input.priority,
      status: input.status ?? 'pending',
      eventId: input.eventId ?? '',
      eventName: normalizeWhitespace(input.eventName ?? ''),
      notes: normalizeWhitespace(input.notes ?? ''),
      updatedAt: serverTimestamp(),
      updatedBy: userAudit.uid,
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: userAudit.uid, createdByName: userAudit.name }),
    },
    { merge: true },
  )
  return taskRef.id
}

export const updateTaskStatus = async (task: LuccaTask, status: LuccaTask['status']) => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  await updateDoc(getDocumentRef('tasks', task.id), {
    status,
    completedAt: status === 'completed' ? serverTimestamp() : null,
    completedBy: status === 'completed' ? userAudit.uid : null,
    updatedAt: serverTimestamp(),
    updatedBy: userAudit.uid,
  })
}

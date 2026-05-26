import { Timestamp, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, firebaseConfig, storage } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { normalizeWhitespace } from '../utils/textFormat'
import type { ExpenseCategory, PaymentMethod } from '../types'

export interface SaveExpenseInput {
  id?: string
  date: string
  category: ExpenseCategory
  description: string
  amount: number
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  type: 'general' | 'event'
  eventId?: string
  eventName?: string
  receiptFile?: File | null
  receiptUrl?: string
  notes?: string
}

const allowedReceiptTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maxReceiptSize = 5 * 1024 * 1024

const uploadExpenseReceipt = async (expenseId: string, file: File) => {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Necesitas iniciar sesion para subir comprobantes.')
  }
  if (!allowedReceiptTypes.has(file.type)) {
    throw new Error('Selecciona una imagen PNG, JPG o WEBP.')
  }
  if (file.size > maxReceiptSize) {
    throw new Error('El comprobante supera el limite de 5 MB.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const storagePath = `expense-receipts/${expenseId}/${Date.now()}-${safeName}`
  const storageRef = ref(storage, storagePath)
  try {
    console.info('[Gastos Storage] Upload start', {
      bucket: firebaseConfig.storageBucket,
      contentType: file.type,
      path: storagePath,
      size: file.size,
      uid: user.uid,
    })
    await uploadBytes(storageRef, file, { contentType: file.type })
    return await getDownloadURL(storageRef)
  } catch (error) {
    console.error('[Gastos Storage] upload failed', { error, path: storagePath, uid: user.uid })
    throw error
  }
}

export const saveExpense = async (input: SaveExpenseInput) => {
  await ensureReceptionSession()
  const userId = auth.currentUser?.uid ?? null
  const expenseRef = input.id ? getDocumentRef('expenses', input.id) : doc(getCollectionRef('expenses'))
  const receiptUrl = input.receiptFile ? await uploadExpenseReceipt(expenseRef.id, input.receiptFile) : input.receiptUrl ?? ''
  const spentAt = new Date(`${input.date}T12:00:00`)

  await setDoc(
    expenseRef,
    {
      id: expenseRef.id,
      date: input.date,
      spentAt: Timestamp.fromDate(spentAt),
      category: input.category,
      description: normalizeWhitespace(input.description),
      amount: Number(input.amount),
      paymentMethod: input.paymentMethod,
      cardType: input.paymentMethod === 'card' ? input.cardType ?? '' : '',
      type: input.type,
      eventId: input.type === 'event' ? input.eventId ?? '' : '',
      eventName: input.type === 'event' ? normalizeWhitespace(input.eventName ?? '') : '',
      receiptUrl,
      notes: normalizeWhitespace(input.notes ?? ''),
      status: 'active',
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: userId }),
    },
    { merge: true },
  )

  return expenseRef.id
}

export const voidExpense = async (expenseId: string) => {
  await ensureReceptionSession()
  await updateDoc(getDocumentRef('expenses', expenseId), {
    status: 'void',
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid ?? null,
  })
}

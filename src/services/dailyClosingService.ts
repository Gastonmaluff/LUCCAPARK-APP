import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import type { DailyClosing } from '../types'

export const saveDailyClosing = async (closing: Omit<DailyClosing, 'id' | 'createdAt' | 'createdBy'>) => {
  await ensureReceptionSession()

  const closingRef = getDocumentRef('dailyClosings', closing.date)
  await setDoc(
    closingRef,
    {
      ...closing,
      id: closing.date,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid ?? null,
    },
    { merge: true },
  )

  return closing.date
}

export const createManualPaymentRecord = async (payload: Record<string, unknown>) => {
  await ensureReceptionSession()

  const paymentRef = doc(getCollectionRef('payments'))
  await setDoc(paymentRef, {
    id: paymentRef.id,
    ...payload,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid ?? null,
  })

  return paymentRef.id
}

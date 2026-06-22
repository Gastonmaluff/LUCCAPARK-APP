import { serverTimestamp, setDoc } from 'firebase/firestore'
import { auth } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getDocumentRef } from './firestoreCollections'
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
  void payload
  throw new Error('Los pagos manuales arbitrarios estan deshabilitados. Usa el cobro seguro de la operacion correspondiente.')
}

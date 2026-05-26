import { Timestamp, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth } from '../config/firebase'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { ensureReceptionSession } from './authSession'
import { getRealDurationMinutes } from '../utils/visitTime'
import { getVisitBillingSummary } from '../utils/visitBilling'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../types'

interface ConsolidatedCheckoutInput {
  visit: ActiveVisit
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisit?: boolean
}

const currentUserId = () => auth.currentUser?.uid ?? null

export const checkoutVisitBalance = async ({
  cardType = '',
  finishVisit = false,
  orders,
  paymentMethod,
  source,
  visit,
}: ConsolidatedCheckoutInput) => {
  await ensureReceptionSession()

  const summary = getVisitBillingSummary(visit, orders)
  if (summary.totalPendingAmount <= 0 && !finishVisit) {
    return
  }

  const now = new Date()
  const userId = currentUserId()
  const batch = writeBatch(getDocumentRef('visits', visit.id).firestore)

  if (summary.pendingParkAmount > 0) {
    const parkPayload = {
      paymentStatus: 'paid',
      paymentMethod,
      cardType,
      amountCharged: summary.parkChargeAmount,
      parkChargeAmount: summary.parkChargeAmount,
      parkPaymentStatus: 'paid',
      parkPaidAt: Timestamp.fromDate(now),
      parkPaymentMethod: paymentMethod,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    }
    batch.update(getDocumentRef('visits', visit.id), parkPayload)
    if (!finishVisit) {
      batch.update(getDocumentRef('activeVisits', visit.id), parkPayload)
    }
  }

  summary.openCanteenOrders.forEach((order) => {
    batch.update(getDocumentRef('canteenOrders', order.id), {
      status: 'paid',
      paymentStatus: 'paid',
      paymentMethod,
      cardType,
      paidAt: Timestamp.fromDate(now),
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    })
  })

  if (finishVisit) {
    const finishPayload = {
      status: 'finished',
      endedAt: Timestamp.fromDate(now),
      realDurationMinutes: getRealDurationMinutes(visit.startedAt, now),
      paymentStatus: summary.pendingParkAmount > 0 ? 'paid' : visit.paymentStatus,
      paymentMethod: summary.pendingParkAmount > 0 ? paymentMethod : visit.paymentMethod ?? '',
      amountCharged: summary.pendingParkAmount > 0 ? summary.parkChargeAmount : visit.amountCharged ?? null,
      parkChargeAmount: summary.parkChargeAmount,
      parkPaymentStatus: summary.pendingParkAmount > 0 ? 'paid' : visit.parkPaymentStatus ?? 'pending',
      parkPaidAt: summary.pendingParkAmount > 0 ? Timestamp.fromDate(now) : visit.parkPaidAt ?? null,
      parkPaymentMethod: summary.pendingParkAmount > 0 ? paymentMethod : visit.parkPaymentMethod ?? '',
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    }
    batch.update(getDocumentRef('visits', visit.id), finishPayload)
    batch.delete(getDocumentRef('activeVisits', visit.id))
  }

  if (summary.totalPendingAmount > 0) {
    const paymentRef = doc(getCollectionRef('payments'))
    batch.set(paymentRef, {
      id: paymentRef.id,
      visitId: visit.id,
      source: source === 'reception' ? 'reception_exit' : 'canteen',
      concepts:
        summary.pendingParkAmount > 0 && summary.pendingCanteenAmount > 0
          ? 'both'
          : summary.pendingParkAmount > 0
            ? 'park'
            : 'canteen',
      canteenOrderIds: summary.openCanteenOrders.map((order) => order.id),
      parkAmountPaid: summary.pendingParkAmount,
      canteenAmountPaid: summary.pendingCanteenAmount,
      totalPaid: summary.totalPendingAmount,
      paymentMethod,
      cardType,
      childName: visit.childName,
      customerName: visit.customerName,
      description: source === 'reception' ? `Salida ${visit.childName}` : `Cobro cantina ${visit.childName}`,
      paidAt: Timestamp.fromDate(now),
      createdAt: serverTimestamp(),
      createdBy: userId,
    })
  }

  await batch.commit()
}

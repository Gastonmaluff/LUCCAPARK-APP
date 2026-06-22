import { Timestamp, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { ensureReceptionSession } from './authSession'
import { getCurrentUserAudit } from './userAudit'
import { getRealDurationMinutes } from '../utils/visitTime'
import { getVisitBillingSummary, getVisitGroupBillingSummary, getVisitParkChargeAmount } from '../utils/visitBilling'
import { formatGroupChildNames } from '../utils/visitGroups'
import type { ActiveVisit, CanteenOrder, PaymentMethod } from '../types'

interface ConsolidatedCheckoutInput {
  visit: ActiveVisit
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisit?: boolean
}

interface ConsolidatedGroupCheckoutInput {
  visits: ActiveVisit[]
  orders: CanteenOrder[]
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  source: 'reception' | 'canteen'
  finishVisits?: boolean
}

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
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid
  const batch = writeBatch(getDocumentRef('visits', visit.id).firestore)

  if (summary.pendingParkAmount > 0) {
    const parkPayload = {
      paymentStatus: 'paid',
      paymentMethod,
      cardType,
      amountCharged: summary.parkChargeAmount,
      parkChargeAmount: summary.parkChargeAmount,
      paidParkAmount: summary.parkChargeAmount,
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
      paidParkAmount: summary.pendingParkAmount > 0 ? summary.parkChargeAmount : visit.paidParkAmount ?? null,
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
      createdByName: userAudit.name,
    })
  }

  await batch.commit()
}

export const checkoutVisitGroupBalance = async ({
  cardType = '',
  finishVisits = false,
  orders,
  paymentMethod,
  source,
  visits,
}: ConsolidatedGroupCheckoutInput) => {
  await ensureReceptionSession()

  const activeVisits = visits.filter((visit) => visit.status === 'active')
  if (activeVisits.length === 0) return

  const summary = getVisitGroupBillingSummary(activeVisits, orders)
  if (summary.totalPendingAmount <= 0 && !finishVisits) {
    return
  }

  const now = new Date()
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid
  const batch = writeBatch(getDocumentRef('visits', activeVisits[0].id).firestore)
  const groupEntryId = activeVisits.find((visit) => visit.groupEntryId)?.groupEntryId ?? ''
  const childNames = formatGroupChildNames(activeVisits)
  let parkAmountPaid = 0

  activeVisits.forEach((visit) => {
    const parkChargeAmount = getVisitParkChargeAmount(visit)
    const paidParkAmount =
      visit.paidParkAmount === null || visit.paidParkAmount === undefined
        ? visit.paymentStatus === 'paid'
          ? parkChargeAmount
          : 0
        : Number(visit.paidParkAmount)
    const pendingParkAmount = Math.max(0, parkChargeAmount - paidParkAmount)
    parkAmountPaid += pendingParkAmount

    const parkPayload =
      pendingParkAmount > 0
        ? {
            paymentStatus: 'paid' as const,
            paymentMethod,
            cardType,
            amountCharged: parkChargeAmount,
            parkChargeAmount,
            paidParkAmount: parkChargeAmount,
            parkPaymentStatus: 'paid' as const,
            parkPaidAt: Timestamp.fromDate(now),
            parkPaymentMethod: paymentMethod,
            updatedAt: serverTimestamp(),
            updatedBy: userId,
          }
        : {
            updatedAt: serverTimestamp(),
            updatedBy: userId,
          }

    if (finishVisits) {
      batch.update(getDocumentRef('visits', visit.id), {
        ...parkPayload,
        status: 'finished',
        endedAt: Timestamp.fromDate(now),
        realDurationMinutes: getRealDurationMinutes(visit.startedAt, now),
      })
      batch.delete(getDocumentRef('activeVisits', visit.id))
      return
    }

    if (pendingParkAmount > 0) {
      batch.update(getDocumentRef('visits', visit.id), parkPayload)
      batch.update(getDocumentRef('activeVisits', visit.id), parkPayload)
    }
  })

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

  if (summary.totalPendingAmount > 0) {
    const paymentRef = doc(getCollectionRef('payments'))
    batch.set(paymentRef, {
      id: paymentRef.id,
      visitId: activeVisits[0].id,
      visitIds: activeVisits.map((visit) => visit.id),
      groupEntryId,
      source: source === 'reception' ? 'reception_exit' : 'canteen',
      concepts:
        parkAmountPaid > 0 && summary.pendingCanteenAmount > 0
          ? 'both'
          : parkAmountPaid > 0
            ? 'park'
            : 'canteen',
      canteenOrderIds: summary.openCanteenOrders.map((order) => order.id),
      parkAmountPaid,
      canteenAmountPaid: summary.pendingCanteenAmount,
      totalPaid: summary.totalPendingAmount,
      paymentMethod,
      cardType,
      childName: childNames,
      childNames: activeVisits.map((visit) => visit.childName),
      customerName: activeVisits[0].customerName,
      description: source === 'reception' ? `Salida grupal ${childNames}` : `Cobro cantina grupal ${childNames}`,
      paidAt: Timestamp.fromDate(now),
      createdAt: serverTimestamp(),
      createdBy: userId,
      createdByName: userAudit.name,
    })
  }

  await batch.commit()
}

import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import { parseCurrencyInput } from '../utils/money'
import { calculateFinanceOperations, isDateInFinanceRange, type FinanceVisit } from '../utils/financeCalculations'
import type { ActiveVisit, CanteenOrder, ExpenseRecord, FinancialClosureRecord, LuccaEvent, PaymentMethod, PaymentRecord } from '../types'

export interface DateRange {
  from: string
  to: string
}

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const inRange = (date: Date | null | undefined, range: DateRange) => {
  if (!date) return false
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return dateKey >= range.from && dateKey <= range.to
}

const mapPayment = (id: string, data: Record<string, unknown>): PaymentRecord => ({
  id,
  paymentMethod: (data.paymentMethod as PaymentMethod) ?? '',
  cardType: (data.cardType as PaymentRecord['cardType']) ?? '',
  paidAt: dateFromTimestamp(data.paidAt) ?? dateFromTimestamp(data.createdAt),
  createdAt: dateFromTimestamp(data.createdAt),
  status: String(data.status ?? 'paid'),
  source: String(data.source ?? 'legacy'),
  concepts: String(data.concepts ?? ''),
  description: String(data.description ?? ''),
  accountType: String(data.accountType ?? ''),
  childName: String(data.childName ?? ''),
  customerName: String(data.customerName ?? ''),
  eventName: String(data.eventName ?? ''),
  visitId: String(data.visitId ?? ''),
  visitIds: Array.isArray(data.visitIds) ? data.visitIds.map(String) : [],
  groupEntryId: String(data.groupEntryId ?? ''),
  canteenOrderId: String(data.canteenOrderId ?? ''),
  canteenOrderIds: Array.isArray(data.canteenOrderIds) ? data.canteenOrderIds.map(String) : [],
  eventId: String(data.eventId ?? ''),
  totalPaid: parseCurrencyInput(data.totalPaid ?? data.amount ?? 0),
  parkAmountPaid: parseCurrencyInput(data.parkAmountPaid ?? 0),
  canteenAmountPaid: parseCurrencyInput(data.canteenAmountPaid ?? 0),
  eventAmountPaid: parseCurrencyInput(data.eventAmountPaid ?? 0),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
})

const mapExpense = (id: string, data: Record<string, unknown>): ExpenseRecord => ({
  id,
  date: String(data.date ?? ''),
  spentAt: dateFromTimestamp(data.spentAt) ?? dateFromTimestamp(data.createdAt),
  category: (data.category as ExpenseRecord['category']) ?? 'other',
  description: String(data.description ?? ''),
  amount: parseCurrencyInput(data.amount ?? 0),
  paymentMethod: (data.paymentMethod as Exclude<PaymentMethod, ''>) ?? 'cash',
  cardType: (data.cardType as ExpenseRecord['cardType']) ?? '',
  type: (data.type as ExpenseRecord['type']) ?? 'general',
  eventId: String(data.eventId ?? ''),
  eventName: String(data.eventName ?? ''),
  receiptUrl: String(data.receiptUrl ?? ''),
  receiptPath: String(data.receiptPath ?? ''),
  notes: String(data.notes ?? ''),
  status: (data.status as ExpenseRecord['status']) ?? 'active',
  createdAt: dateFromTimestamp(data.createdAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByUid: data.createdByUid ? String(data.createdByUid) : null,
  createdByName: String(data.createdByName ?? ''),
  createdByRole: String(data.createdByRole ?? ''),
  updatedAt: dateFromTimestamp(data.updatedAt),
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
  updatedByUid: data.updatedByUid ? String(data.updatedByUid) : null,
  updatedByName: String(data.updatedByName ?? ''),
})

const mapClosure = (id: string, data: Record<string, unknown>): FinancialClosureRecord => {
  const snapshot = (data.totalsSnapshot as Record<string, unknown> | undefined) ?? {}
  const snapshotTotals = (snapshot.totals as Record<string, unknown> | undefined) ?? snapshot
  return {
    id,
    dateFrom: String(data.dateFrom ?? ''),
    dateTo: String(data.dateTo ?? ''),
    generatedAt: dateFromTimestamp(data.generatedAt) ?? dateFromTimestamp(data.createdAt),
    generatedBy: data.generatedBy ? String(data.generatedBy) : null,
    totalCollected: parseCurrencyInput(data.totalCollected ?? snapshotTotals.totalCollected ?? 0),
    totalExpenses: parseCurrencyInput(data.totalExpenses ?? snapshotTotals.totalExpenses ?? 0),
    netResult: parseCurrencyInput(data.netResult ?? snapshotTotals.netResult ?? 0),
    pendingAmount: parseCurrencyInput(data.pendingAmount ?? snapshotTotals.pendingAmount ?? 0),
    pdfUrl: String(data.pdfUrl ?? ''),
    totalsSnapshot: snapshot,
  }
}

const mapOrder = (id: string, data: Record<string, unknown>): CanteenOrder => ({
  id,
  type: (data.type as CanteenOrder['type']) ?? 'free',
  visitId: String(data.visitId ?? ''),
  visitIds: Array.isArray(data.visitIds) ? data.visitIds.map(String) : [],
  groupEntryId: String(data.groupEntryId ?? ''),
  eventId: String(data.eventId ?? ''),
  childId: String(data.childId ?? ''),
  childIds: Array.isArray(data.childIds) ? data.childIds.map(String) : [],
  childName: String(data.childName ?? ''),
  childNames: Array.isArray(data.childNames) ? data.childNames.map(String) : [],
  customerId: String(data.customerId ?? ''),
  accountName: String(data.accountName ?? ''),
  customerName: String(data.customerName ?? ''),
  items: Array.isArray(data.items) ? (data.items as CanteenOrder['items']) : [],
  total: parseCurrencyInput(data.total ?? 0),
  status: (data.status as CanteenOrder['status']) ?? 'open',
  paymentStatus: (data.paymentStatus as CanteenOrder['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as PaymentMethod) ?? '',
  paidAt: dateFromTimestamp(data.paidAt),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapVisit = (id: string, data: Record<string, unknown>): FinanceVisit => ({
  id,
  groupEntryId: data.groupEntryId ? String(data.groupEntryId) : undefined,
  childId: String(data.childId ?? ''),
  childName: String(data.childName ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  childrenCount: parseCurrencyInput(data.childrenCount ?? 1),
  planId: (data.planId as ActiveVisit['planId']) ?? 'one-hour',
  planName: String(data.planName ?? 'Parque'),
  durationMinutes: data.durationMinutes === null ? null : parseCurrencyInput(data.durationMinutes ?? 0),
  isUnlimited: Boolean(data.isUnlimited),
  startedAt: dateFromTimestamp(data.startedAt) ?? new Date(),
  expectedEndAt: dateFromTimestamp(data.expectedEndAt),
  paymentStatus: (data.paymentStatus as ActiveVisit['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as PaymentMethod) ?? '',
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? null : parseCurrencyInput(data.amountCharged),
  parkChargeAmount: data.parkChargeAmount === null || data.parkChargeAmount === undefined ? null : parseCurrencyInput(data.parkChargeAmount),
  paidParkAmount: data.paidParkAmount === null || data.paidParkAmount === undefined ? null : parseCurrencyInput(data.paidParkAmount),
  extensionChargeAmount: data.extensionChargeAmount === null || data.extensionChargeAmount === undefined ? null : parseCurrencyInput(data.extensionChargeAmount),
  parkPaymentStatus: (data.parkPaymentStatus as ActiveVisit['parkPaymentStatus']) ?? (data.paymentStatus === 'paid' ? 'paid' : 'pending'),
  parkPaidAt: dateFromTimestamp(data.parkPaidAt),
  parkPaymentMethod: (data.parkPaymentMethod as PaymentMethod) ?? '',
  defaultAmount: data.defaultAmount === null || data.defaultAmount === undefined ? null : parseCurrencyInput(data.defaultAmount),
  status: 'active',
  financeStatus: String(data.status ?? 'active'),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
})

const mapEvent = (id: string, data: Record<string, unknown>): LuccaEvent => ({
  id,
  title: String(data.title ?? ''),
  birthdayChildName: String(data.birthdayChildName ?? ''),
  childId: data.childId ? String(data.childId) : null,
  childBirthDate: data.childBirthDate ? String(data.childBirthDate) : null,
  customerName: String(data.customerName ?? ''),
  customerId: data.customerId ? String(data.customerId) : null,
  customerPhone: String(data.customerPhone ?? ''),
  date: String(data.date ?? ''),
  startTime: String(data.startTime ?? ''),
  endTime: String(data.endTime ?? ''),
  contractedChildrenCount: parseCurrencyInput(data.contractedChildrenCount ?? 0),
  registeredGuestsCount: parseCurrencyInput(data.registeredGuestsCount ?? 0),
  status: (data.status as LuccaEvent['status']) ?? 'reserved',
  eventType: (data.eventType as LuccaEvent['eventType']) ?? 'birthday',
  totalAmount: data.totalAmount === null || data.totalAmount === undefined ? null : parseCurrencyInput(data.totalAmount),
  depositAmount: data.depositAmount === null || data.depositAmount === undefined ? null : parseCurrencyInput(data.depositAmount),
  pendingAmount: data.pendingAmount === null || data.pendingAmount === undefined ? null : parseCurrencyInput(data.pendingAmount),
  eventPaidAmount: data.eventPaidAmount === null || data.eventPaidAmount === undefined ? null : parseCurrencyInput(data.eventPaidAmount),
  financialStatus: String(data.financialStatus ?? ''),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
  tvModeEnabled: data.tvModeEnabled !== false,
  showGuestCounterOnTv: data.showGuestCounterOnTv !== false,
  showEventNameOnTv: data.showEventNameOnTv !== false,
  hideSensitiveInfoOnTv: Boolean(data.hideSensitiveInfoOnTv),
})

function useCollection<T>(name: Parameters<typeof getCollectionRef>[0], mapper: (id: string, data: Record<string, unknown>) => T) {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let mounted = true
    ensureReceptionSession().then(() => {
      if (!mounted) return
      unsubscribe = onSnapshot(
        getCollectionRef(name),
        (snapshot) => {
          setItems(snapshot.docs.map((item) => mapper(item.id, item.data())))
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
  }, [mapper, name])

  return { error, isLoading, items }
}

export function useFinanceData(range: DateRange) {
  const payments = useCollection('payments', mapPayment)
  const expenses = useCollection('expenses', mapExpense)
  const closures = useCollection('financialClosures', mapClosure)
  const canteen = useCollection('canteenOrders', mapOrder)
  const visits = useCollection('visits', mapVisit)
  const activeVisits = useCollection('activeVisits', mapVisit)
  const events = useCollection('events', mapEvent)

  return useMemo(() => {
    const calculation = calculateFinanceOperations({
      activeVisits: activeVisits.items,
      canteenOrders: canteen.items,
      events: events.items,
      payments: payments.items,
      range,
      visits: visits.items,
    })
    const allPayments = calculation.payments
    const expenseItems = expenses.items.filter((expense) => expense.status !== 'void' && inRange(expense.spentAt ?? expense.createdAt, range))
    const canteenOrdersInRange = canteen.items.filter((order) => order.status === 'paid' && isDateInFinanceRange(order.paidAt, range))
    const visitsInRange = visits.items.filter((visit) => inRange(visit.startedAt, range))
    const closuresInRange = closures.items.filter((closure) => closure.dateFrom >= range.from && closure.dateTo <= range.to)

    const methodTotals = {
      cash: 0,
      transfer: 0,
      qr: 0,
      debit: 0,
      credit: 0,
      other: 0,
      missing: 0,
    }
    allPayments.forEach((payment) => {
      if (payment.paymentMethod === 'card' && payment.cardType === 'debit') methodTotals.debit += payment.totalPaid
      else if (payment.paymentMethod === 'card' && payment.cardType === 'credit') methodTotals.credit += payment.totalPaid
      else if (payment.paymentMethod === 'cash') methodTotals.cash += payment.totalPaid
      else if (payment.paymentMethod === 'transfer') methodTotals.transfer += payment.totalPaid
      else if (payment.paymentMethod === 'qr') methodTotals.qr += payment.totalPaid
      else if (payment.paymentMethod === 'other') methodTotals.other += payment.totalPaid
      else methodTotals.missing += payment.totalPaid
    })

    const parkCollected = calculation.parkCollected
    const canteenCollected = calculation.canteenCollected
    const eventCollected = calculation.eventCollected
    const totalCollected = calculation.totalCollected
    const totalExpenses = expenseItems.reduce((sum, expense) => sum + expense.amount, 0)
    const pendingAmount = calculation.pendingAmount

    return {
      closures: closures.items,
      closuresInRange,
      canteenOrders: canteen.items,
      canteenOrdersInRange,
      error: payments.error || expenses.error || closures.error || canteen.error || visits.error || activeVisits.error || events.error,
      events: events.items,
      expenses: expenseItems,
      isLoading: payments.isLoading || expenses.isLoading || closures.isLoading || canteen.isLoading || visits.isLoading || activeVisits.isLoading || events.isLoading,
      methodTotals,
      openCanteen: calculation.openCanteen,
      payments: allPayments.sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0)),
      pendingEventItems: calculation.pendingEventItems,
      pendingEventAmounts: calculation.pendingEventAmounts,
      pendingVisits: calculation.pendingVisits,
      range,
      totals: {
        canteenCollected,
        eventCollected,
        netResult: totalCollected - totalExpenses,
        parkCollected,
        pendingAmount,
        totalCollected,
        totalExpenses,
      },
      visitsInRange,
    }
  }, [activeVisits.items, canteen, closures, events, expenses, payments, range, visits.items])
}

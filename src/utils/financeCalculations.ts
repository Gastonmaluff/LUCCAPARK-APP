import type { ActiveVisit, CanteenOrder, LuccaEvent, PaymentRecord } from '../types'

export interface FinanceDateRange {
  from: string
  to: string
}

export interface FinanceVisit extends ActiveVisit {
  financeStatus?: string
}

export interface PendingVisitOperation {
  id: string
  groupEntryId?: string
  visitIds: string[]
  childName: string
  startedAt: Date
  pendingAmount: number
  isGroup: boolean
}

interface FinanceCalculationInput {
  activeVisits: FinanceVisit[]
  canteenOrders: CanteenOrder[]
  events: LuccaEvent[]
  payments: PaymentRecord[]
  range: FinanceDateRange
  visits: FinanceVisit[]
}

const invalidPaymentStates = new Set(['void', 'voided', 'cancelled', 'refunded'])
const invalidVisitStates = new Set(['cancelled', 'void', 'voided'])
const pendingEventStates = new Set(['inquiry', 'reserved', 'confirmed', 'active'])

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const isDateInFinanceRange = (date: Date | null | undefined, range: FinanceDateRange) => {
  if (!date) return false
  const key = localDateKey(date)
  return key >= range.from && key <= range.to
}

const uniqueById = <T extends { id: string }>(items: T[]) => {
  const byId = new Map<string, T>()
  items.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item)
  })
  return [...byId.values()]
}

const validPayments = (payments: PaymentRecord[]) =>
  uniqueById(payments).filter((payment) => {
    const status = String(payment.status ?? 'paid').toLowerCase()
    return numberValue(payment.totalPaid) !== 0 && !invalidPaymentStates.has(status)
  })

const paymentParkAmount = (payment: PaymentRecord) => {
  const explicit = numberValue(payment.parkAmountPaid)
  if (explicit !== 0) return explicit
  return payment.concepts === 'park' ? numberValue(payment.totalPaid) : 0
}

const paymentCanteenAmount = (payment: PaymentRecord) => {
  const explicit = numberValue(payment.canteenAmountPaid)
  if (explicit !== 0) return explicit
  return payment.concepts === 'canteen' ? numberValue(payment.totalPaid) : 0
}

const paymentEventAmount = (payment: PaymentRecord) => {
  const explicit = numberValue(payment.eventAmountPaid)
  if (explicit !== 0) return explicit
  return payment.source === 'event_payment' || payment.concepts === 'event' ? numberValue(payment.totalPaid) : 0
}

const paymentMatchesVisit = (payment: PaymentRecord, visit: FinanceVisit) =>
  payment.visitId === visit.id ||
  Boolean(payment.visitIds?.includes(visit.id)) ||
  Boolean(visit.groupEntryId && payment.groupEntryId === visit.groupEntryId)

const paymentMatchesVisitOperation = (payment: PaymentRecord, visits: FinanceVisit[]) => {
  const groupEntryId = visits.find((visit) => visit.groupEntryId)?.groupEntryId
  const visitIds = new Set(visits.map((visit) => visit.id))
  if (groupEntryId && payment.groupEntryId === groupEntryId) return true
  if (payment.visitId && visitIds.has(payment.visitId)) return true
  return Boolean(payment.visitIds?.some((visitId) => visitIds.has(visitId)))
}

const paymentMatchesOrder = (payment: PaymentRecord, orderId: string) =>
  payment.canteenOrderId === orderId || Boolean(payment.canteenOrderIds?.includes(orderId))

const visitCharge = (visit: FinanceVisit) =>
  numberValue(visit.parkChargeAmount ?? visit.amountCharged ?? visit.defaultAmount)

const storedVisitPaidAmount = (visit: FinanceVisit) => {
  if (visit.paidParkAmount !== null && visit.paidParkAmount !== undefined) return numberValue(visit.paidParkAmount)
  return visit.paymentStatus === 'paid' || visit.parkPaymentStatus === 'paid' ? visitCharge(visit) : 0
}

const formatNames = (visits: FinanceVisit[]) => {
  const names = [...new Set(visits.map((visit) => visit.childName).filter(Boolean))]
  if (names.length <= 2) return names.join(' y ')
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

const eventPendingAmount = (event: LuccaEvent, payments: PaymentRecord[]) => {
  const relatedPayments = payments.filter((payment) => payment.eventId === event.id && paymentEventAmount(payment) !== 0)
  const paidFromPayments = relatedPayments.reduce((sum, payment) => sum + paymentEventAmount(payment), 0)
  const storedPaid = numberValue(event.eventPaidAmount) || numberValue(event.depositAmount)
  const paid = relatedPayments.length > 0 ? paidFromPayments : storedPaid
  const total = numberValue(event.totalAmount)
  return total > 0 ? Math.max(0, total - paid) : Math.max(0, numberValue(event.pendingAmount))
}

const buildLegacyVisitPayments = (
  visits: FinanceVisit[],
  payments: PaymentRecord[],
  range: FinanceDateRange,
) =>
  uniqueById(visits)
    .filter((visit) => {
      const paidAmount = storedVisitPaidAmount(visit)
      const hasRealPayment = payments.some((payment) => paymentParkAmount(payment) !== 0 && paymentMatchesVisit(payment, visit))
      const paidAt = visit.parkPaidAt ?? visit.startedAt
      return paidAmount !== 0 && !hasRealPayment && isDateInFinanceRange(paidAt, range)
    })
    .map((visit): PaymentRecord => {
      const paidAt = visit.parkPaidAt ?? visit.startedAt
      const totalPaid = storedVisitPaidAmount(visit)
      return {
        id: `legacy-visit-${visit.id}`,
        source: 'legacy',
        concepts: 'park',
        totalPaid,
        parkAmountPaid: totalPaid,
        paymentMethod: visit.parkPaymentMethod || visit.paymentMethod || '',
        paidAt,
        visitId: visit.id,
        visitIds: [visit.id],
        groupEntryId: visit.groupEntryId,
        childName: visit.childName,
        customerName: visit.customerName,
        description: `Entrada ${visit.planName}`,
      }
    })

const buildLegacyCanteenPayments = (
  orders: CanteenOrder[],
  payments: PaymentRecord[],
  range: FinanceDateRange,
) =>
  uniqueById(orders)
    .filter((order) => {
      const paidAt = order.paidAt ?? order.updatedAt ?? order.createdAt
      const hasRealPayment = payments.some((payment) => paymentCanteenAmount(payment) !== 0 && paymentMatchesOrder(payment, order.id))
      return order.status === 'paid' && order.total !== 0 && !hasRealPayment && isDateInFinanceRange(paidAt, range)
    })
    .map((order): PaymentRecord => ({
      id: `legacy-canteen-${order.id}`,
      source: 'legacy',
      concepts: 'canteen',
      totalPaid: numberValue(order.total),
      canteenAmountPaid: numberValue(order.total),
      paymentMethod: order.paymentMethod ?? '',
      paidAt: order.paidAt ?? order.updatedAt ?? order.createdAt,
      canteenOrderId: order.id,
      canteenOrderIds: [order.id],
      visitId: order.visitId,
      visitIds: order.visitIds,
      groupEntryId: order.groupEntryId,
      eventId: order.eventId,
      childName: order.childName || order.accountName,
      customerName: order.customerName,
      description: `Cantina - ${order.accountName}`,
    }))

const buildPendingVisitOperations = (
  visits: FinanceVisit[],
  activeVisits: FinanceVisit[],
  payments: PaymentRecord[],
) => {
  const visitById = new Map<string, FinanceVisit>()
  visits.forEach((visit) => visitById.set(visit.id, visit))
  activeVisits.forEach((visit) => visitById.set(visit.id, visit))

  const operations = new Map<string, FinanceVisit[]>()
  visitById.forEach((visit) => {
    if (invalidVisitStates.has(String(visit.financeStatus ?? visit.status).toLowerCase())) return
    const key = visit.groupEntryId ? `group:${visit.groupEntryId}` : `visit:${visit.id}`
    operations.set(key, [...(operations.get(key) ?? []), visit])
  })

  return [...operations.entries()].flatMap(([id, operationVisits]): PendingVisitOperation[] => {
    const relatedPayments = payments.filter(
      (payment) => paymentParkAmount(payment) !== 0 && paymentMatchesVisitOperation(payment, operationVisits),
    )
    const charge = operationVisits.reduce((sum, visit) => sum + visitCharge(visit), 0)
    const paid = relatedPayments.length > 0
      ? relatedPayments.reduce((sum, payment) => sum + paymentParkAmount(payment), 0)
      : operationVisits.reduce((sum, visit) => sum + storedVisitPaidAmount(visit), 0)
    const pendingAmount = Math.max(0, charge - paid)
    if (pendingAmount <= 0) return []
    const sortedVisits = [...operationVisits].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    return [{
      id,
      groupEntryId: sortedVisits[0]?.groupEntryId,
      visitIds: sortedVisits.map((visit) => visit.id),
      childName: formatNames(sortedVisits),
      startedAt: sortedVisits[0]?.startedAt ?? new Date(0),
      pendingAmount,
      isGroup: sortedVisits.length > 1,
    }]
  })
}

export const calculateFinanceOperations = ({
  activeVisits,
  canteenOrders,
  events,
  payments,
  range,
  visits,
}: FinanceCalculationInput) => {
  const allValidPayments = validPayments(payments)
  const realPeriodPayments = allValidPayments.filter((payment) =>
    isDateInFinanceRange(payment.paidAt ?? payment.createdAt, range),
  )
  const legacyVisitPayments = buildLegacyVisitPayments(visits, allValidPayments, range)
  const legacyCanteenPayments = buildLegacyCanteenPayments(canteenOrders, allValidPayments, range)
  const periodPayments = uniqueById([...realPeriodPayments, ...legacyVisitPayments, ...legacyCanteenPayments])

  // Pending balances are current obligations; the selected range only scopes collected income.
  const pendingVisits = buildPendingVisitOperations(visits, activeVisits, allValidPayments)
  const openCanteen = uniqueById(canteenOrders).filter(
    (order) => order.status === 'open' && order.paymentStatus !== 'paid',
  )
  const pendingEventItems = uniqueById(events).filter(
    (event) => pendingEventStates.has(event.status) && eventPendingAmount(event, allValidPayments) > 0,
  )
  const pendingEventAmounts = Object.fromEntries(
    pendingEventItems.map((event) => [event.id, eventPendingAmount(event, allValidPayments)]),
  )
  const pendingAmount =
    pendingVisits.reduce((sum, visit) => sum + visit.pendingAmount, 0) +
    openCanteen.reduce((sum, order) => sum + numberValue(order.total), 0) +
    pendingEventItems.reduce((sum, event) => sum + (pendingEventAmounts[event.id] ?? 0), 0)

  return {
    allValidPayments,
    canteenCollected: periodPayments.reduce((sum, payment) => sum + paymentCanteenAmount(payment), 0),
    eventCollected: periodPayments.reduce((sum, payment) => sum + paymentEventAmount(payment), 0),
    openCanteen,
    parkCollected: periodPayments.reduce((sum, payment) => sum + paymentParkAmount(payment), 0),
    payments: periodPayments,
    pendingAmount,
    pendingEventAmounts,
    pendingEventItems,
    pendingVisits,
    totalCollected: periodPayments.reduce((sum, payment) => sum + numberValue(payment.totalPaid), 0),
  }
}

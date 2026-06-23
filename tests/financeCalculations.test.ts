import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculateFinanceOperations, type FinanceDateRange, type FinanceVisit } from '../src/utils/financeCalculations.js'
import type { CanteenOrder, LuccaEvent, PaymentRecord } from '../src/types.js'

const day = (date: number, hour = 12) => new Date(2026, 4, date, hour, 0, 0)
const range = (from: number, to = from): FinanceDateRange => ({
  from: `2026-05-${String(from).padStart(2, '0')}`,
  to: `2026-05-${String(to).padStart(2, '0')}`,
})

const visit = (overrides: Partial<FinanceVisit> = {}): FinanceVisit => ({
  id: 'visit-1',
  childId: 'child-1',
  childName: 'Mia',
  customerId: 'customer-1',
  customerName: 'Responsable',
  childrenCount: 1,
  planId: 'one-hour',
  planName: 'Una hora',
  durationMinutes: 60,
  isUnlimited: false,
  startedAt: day(28, 10),
  expectedEndAt: day(28, 11),
  paymentStatus: 'pending',
  parkChargeAmount: 60000,
  paidParkAmount: 0,
  status: 'active',
  financeStatus: 'active',
  ...overrides,
})

const payment = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'payment-1',
  totalPaid: 60000,
  parkAmountPaid: 60000,
  paymentMethod: 'cash',
  paidAt: day(28, 12),
  status: 'paid',
  source: 'reception_exit',
  concepts: 'park',
  visitId: 'visit-1',
  visitIds: ['visit-1'],
  ...overrides,
})

const order = (overrides: Partial<CanteenOrder> = {}): CanteenOrder => ({
  id: 'order-1',
  type: 'visit',
  visitId: 'visit-1',
  visitIds: ['visit-1'],
  accountName: 'Cuenta Mia',
  items: [],
  total: 30000,
  status: 'open',
  paymentStatus: 'pending',
  createdAt: day(28, 10),
  ...overrides,
})

const event = (overrides: Partial<LuccaEvent> = {}): LuccaEvent => ({
  id: 'event-1',
  title: 'Cumpleaños',
  birthdayChildName: 'Mia',
  customerName: 'Responsable',
  date: '2026-05-30',
  startTime: '16:00',
  endTime: '19:00',
  contractedChildrenCount: 20,
  registeredGuestsCount: 0,
  status: 'reserved',
  eventType: 'birthday',
  totalAmount: 1000000,
  eventPaidAmount: 0,
  tvModeEnabled: true,
  showGuestCounterOnTv: true,
  showEventNameOnTv: true,
  hideSensitiveInfoOnTv: false,
  ...overrides,
})

const calculate = ({
  activeVisits = [],
  canteenOrders = [],
  events = [],
  payments = [],
  selectedRange = range(28),
  visits = [],
}: {
  activeVisits?: FinanceVisit[]
  canteenOrders?: CanteenOrder[]
  events?: LuccaEvent[]
  payments?: PaymentRecord[]
  selectedRange?: FinanceDateRange
  visits?: FinanceVisit[]
}) => calculateFinanceOperations({ activeVisits, canteenOrders, events, payments, range: selectedRange, visits })

describe('cobros por fecha real', () => {
  test('incluye una visita pagada dentro de Hoy', () => {
    const result = calculate({ payments: [payment()], visits: [visit({ paymentStatus: 'paid' })] })
    assert.equal(result.totalCollected, 60000)
    assert.equal(result.payments.length, 1)
  })

  test('una visita iniciada Hoy pero pagada Ayer no entra en Hoy', () => {
    const result = calculate({ payments: [payment({ paidAt: day(27) })], visits: [visit({ paymentStatus: 'paid' })] })
    assert.equal(result.totalCollected, 0)
    assert.equal(result.payments.length, 0)
  })

  test('una visita iniciada Ayer pero pagada Hoy entra en Hoy', () => {
    const result = calculate({ payments: [payment()], visits: [visit({ startedAt: day(27), paymentStatus: 'paid' })] })
    assert.equal(result.totalCollected, 60000)
  })

  test('un pago fuera del rango personalizado no aparece', () => {
    const result = calculate({ payments: [payment({ paidAt: day(25) })], selectedRange: range(26, 27) })
    assert.equal(result.totalCollected, 0)
  })

  test('Hoy, Ayer y Mes respetan el timestamp del pago', () => {
    const payments = [
      payment({ id: 'today', paidAt: day(28), totalPaid: 10000, parkAmountPaid: 10000 }),
      payment({ id: 'yesterday', paidAt: day(27), totalPaid: 20000, parkAmountPaid: 20000 }),
      payment({ id: 'month', paidAt: day(5), totalPaid: 30000, parkAmountPaid: 30000 }),
    ]
    assert.equal(calculate({ payments, selectedRange: range(28) }).totalCollected, 10000)
    assert.equal(calculate({ payments, selectedRange: range(27) }).totalCollected, 20000)
    assert.equal(calculate({ payments, selectedRange: range(1, 28) }).totalCollected, 60000)
  })

  test('el rango personalizado incluye ambos límites', () => {
    const payments = [
      payment({ id: 'from', paidAt: day(10), totalPaid: 10000, parkAmountPaid: 10000 }),
      payment({ id: 'inside', paidAt: day(12), totalPaid: 20000, parkAmountPaid: 20000 }),
      payment({ id: 'to', paidAt: day(15), totalPaid: 30000, parkAmountPaid: 30000 }),
      payment({ id: 'outside', paidAt: day(16), totalPaid: 40000, parkAmountPaid: 40000 }),
    ]
    assert.equal(calculate({ payments, selectedRange: range(10, 15) }).totalCollected, 60000)
  })
})

describe('fallbacks legacy', () => {
  test('no crea fallback cuando existe un pago real fuera del rango visible', () => {
    const legacyVisit = visit({ paymentStatus: 'paid', paidParkAmount: 60000 })
    const result = calculate({ payments: [payment({ paidAt: day(27) })], visits: [legacyVisit] })
    assert.equal(result.payments.length, 0)
  })

  test('crea un solo fallback cuando no existe pago real', () => {
    const legacyVisit = visit({ paymentStatus: 'paid', paidParkAmount: 60000 })
    const result = calculate({ visits: [legacyVisit, legacyVisit] })
    assert.equal(result.payments.length, 1)
    assert.equal(result.totalCollected, 60000)
  })

  test('una cuenta legacy pagada no duplica un pago real relacionado', () => {
    const paidOrder = order({ status: 'paid', paymentStatus: 'paid', paidAt: day(28) })
    const canteenPayment = payment({
      concepts: 'canteen',
      source: 'canteen',
      parkAmountPaid: 0,
      canteenAmountPaid: 30000,
      totalPaid: 30000,
      canteenOrderId: paidOrder.id,
      canteenOrderIds: [paidOrder.id],
      visitId: '',
      visitIds: [],
    })
    const result = calculate({ canteenOrders: [paidOrder], payments: [canteenPayment] })
    assert.equal(result.payments.length, 1)
    assert.equal(result.canteenCollected, 30000)
  })
})

describe('grupos, cuentas y pendientes actuales', () => {
  const groupVisits = [
    visit({ id: 'visit-a', childName: 'Mia', groupEntryId: 'group-1' }),
    visit({ id: 'visit-b', childId: 'child-2', childName: 'Mar', groupEntryId: 'group-1' }),
  ]

  test('un grupo de dos niños genera un solo movimiento y total', () => {
    const groupPayment = payment({
      totalPaid: 120000,
      parkAmountPaid: 120000,
      visitId: 'visit-a',
      visitIds: ['visit-a', 'visit-b'],
      groupEntryId: 'group-1',
    })
    const result = calculate({ payments: [groupPayment, groupPayment], visits: groupVisits })
    assert.equal(result.payments.length, 1)
    assert.equal(result.totalCollected, 120000)
    assert.equal(result.pendingVisits.length, 0)
  })

  test('una cuenta compartida se cuenta una sola vez', () => {
    const sharedOrder = order({
      groupEntryId: 'group-1',
      visitId: 'visit-a',
      visitIds: ['visit-a', 'visit-b'],
    })
    const result = calculate({ activeVisits: groupVisits, canteenOrders: [sharedOrder, sharedOrder] })
    assert.equal(result.openCanteen.length, 1)
    assert.equal(result.pendingVisits.length, 1)
    assert.equal(result.pendingAmount, 150000)
  })

  test('una cuenta abierta no se suma globalmente y otra vez por visita', () => {
    const result = calculate({ activeVisits: [visit()], canteenOrders: [order()] })
    const visibleDetail =
      result.pendingVisits.reduce((sum, item) => sum + item.pendingAmount, 0) +
      result.openCanteen.reduce((sum, item) => sum + item.total, 0)
    assert.equal(result.pendingAmount, 90000)
    assert.equal(result.pendingAmount, visibleDetail)
  })

  test('un pago parcial calcula cobrado y pendiente', () => {
    const partial = payment({ totalPaid: 20000, parkAmountPaid: 20000 })
    const result = calculate({ activeVisits: [visit()], payments: [partial] })
    assert.equal(result.totalCollected, 20000)
    assert.equal(result.pendingVisits[0]?.pendingAmount, 40000)
  })

  test('dos pagos parciales se suman sin duplicarse', () => {
    const payments = [
      payment({ id: 'partial-1', totalPaid: 20000, parkAmountPaid: 20000 }),
      payment({ id: 'partial-2', totalPaid: 40000, parkAmountPaid: 40000 }),
    ]
    const result = calculate({ activeVisits: [visit()], payments })
    assert.equal(result.totalCollected, 60000)
    assert.equal(result.pendingVisits.length, 0)
  })

  test('una extensión conserva solamente su cargo pendiente', () => {
    const extendedVisit = visit({ parkChargeAmount: 90000, extensionChargeAmount: 30000 })
    const initialPayment = payment({ totalPaid: 60000, parkAmountPaid: 60000 })
    const result = calculate({ activeVisits: [extendedVisit], payments: [initialPayment] })
    assert.equal(result.totalCollected, 60000)
    assert.equal(result.pendingVisits[0]?.pendingAmount, 30000)
  })

  test('el pendiente actual no cambia al mover el filtro de cobros', () => {
    const today = calculate({ activeVisits: [visit()], canteenOrders: [order()], selectedRange: range(28) })
    const oldRange = calculate({ activeVisits: [visit()], canteenOrders: [order()], selectedRange: range(1, 5) })
    assert.equal(today.pendingAmount, oldRange.pendingAmount)
  })
})

describe('separación de orígenes y conciliación', () => {
  test('evento y Cantina conservan componentes separados', () => {
    const payments = [
      payment({
        id: 'canteen',
        concepts: 'canteen',
        source: 'canteen',
        totalPaid: 30000,
        parkAmountPaid: 0,
        canteenAmountPaid: 30000,
        visitId: '',
        visitIds: [],
      }),
      payment({
        id: 'event',
        concepts: 'event',
        source: 'event_payment',
        totalPaid: 100000,
        parkAmountPaid: 0,
        eventAmountPaid: 100000,
        eventId: 'event-1',
        visitId: '',
        visitIds: [],
      }),
    ]
    const result = calculate({ payments })
    assert.equal(result.canteenCollected, 30000)
    assert.equal(result.eventCollected, 100000)
    assert.equal(result.parkCollected, 0)
    assert.equal(result.totalCollected, 130000)
  })

  test('un evento con pago parcial conserva el saldo real', () => {
    const eventPayment = payment({
      concepts: 'event',
      source: 'event_payment',
      totalPaid: 250000,
      parkAmountPaid: 0,
      eventAmountPaid: 250000,
      eventId: 'event-1',
      visitId: '',
      visitIds: [],
    })
    const result = calculate({ events: [event()], payments: [eventPayment] })
    assert.equal(result.pendingEventAmounts['event-1'], 750000)
  })

  test('el total general coincide con el detalle visible', () => {
    const result = calculate({
      activeVisits: [visit()],
      canteenOrders: [order()],
      events: [event()],
    })
    const detailTotal =
      result.pendingVisits.reduce((sum, item) => sum + item.pendingAmount, 0) +
      result.openCanteen.reduce((sum, item) => sum + item.total, 0) +
      Object.values(result.pendingEventAmounts).reduce((sum, amount) => sum + amount, 0)
    assert.equal(result.pendingAmount, detailTotal)
  })
})

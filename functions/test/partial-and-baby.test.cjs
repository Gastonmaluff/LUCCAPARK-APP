const assert = require('node:assert/strict')
const { beforeEach, describe, test } = require('node:test')

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-luccapark-functions'

const { db } = require('../lib/common')
const { chargeCanteenOrderSecure, confirmCanteenConsumptionSecure } = require('../lib/canteen')
const {
  checkoutVisitGroupSecure,
  createVisitSecure,
  finishVisitSecure,
  registerPartialPaymentSecure,
} = require('../lib/visits')

const projectId = process.env.GCLOUD_PROJECT
let sequence = 0
const key = (prefix) => `${prefix}-${++sequence}-partial`

const profiles = {
  admin: { uid: 'admin', displayName: 'Admin', email: 'admin@test.local', role: 'admin', isActive: true },
  socio: { uid: 'socio', displayName: 'Socio', email: 'socio@test.local', role: 'socio', isActive: true },
  recepcion: { uid: 'recepcion', displayName: 'Recepcion', email: 'recepcion@test.local', role: 'recepcion', isActive: true },
  cantina: { uid: 'cantina', displayName: 'Cantina', email: 'cantina@test.local', role: 'cantina', isActive: true },
}

const activeLine = (quantity = 2) => ({
  lineItemId: 'line-1', productId: 'product-1', productName: 'Agua', category: 'Bebidas',
  unitPrice: 10000, unitCost: 4000, quantity, subtotal: quantity * 10000, costSubtotal: quantity * 4000,
  status: 'active', pricingSource: 'server_catalog',
})

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST debe estar configurado')
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
  assert.ok(response.ok, `No se pudo limpiar Firestore: ${response.status}`)
}

async function seedBase() {
  const batch = db.batch()
  Object.values(profiles).forEach((profile) => batch.set(db.collection('users').doc(profile.uid), profile))
  batch.set(db.collection('canteenProducts').doc('product-1'), {
    id: 'product-1', name: 'Agua', category: 'Bebidas', price: 10000, salePrice: 10000, unitCost: 4000, stock: 50, minStock: 2, isActive: true,
  })
  batch.set(db.collection('canteenCategories').doc('bebidas'), { id: 'bebidas', name: 'Bebidas', normalizedName: 'bebidas', isActive: true })
  await batch.commit()
}

async function seedBabyConfig(enabled = true, maxAgeMonths = 24) {
  await db.collection('settings').doc('visitPricing').set({ unlimitedHourlyRate: 30000, babyFreeEntryEnabled: enabled, babyFreeMaxAgeMonths: maxAgeMonths }, { merge: true })
}

async function seedVisit(id = 'visit-1', overrides = {}) {
  const visit = {
    id, childId: `child-${id}`, childName: 'Mateo', customerId: 'customer-1', customerName: 'Maria',
    planId: 'one-hour', planName: '1 hora', durationMinutes: 60, isUnlimited: false,
    startedAt: new Date(Date.now() - 10 * 60 * 1000), expectedEndAt: new Date(Date.now() + 50 * 60 * 1000),
    paymentStatus: 'pending', parkPaymentStatus: 'pending', amountCharged: 60000, parkChargeAmount: 60000,
    paidParkAmount: 0, extensionChargeAmount: 0, timeExtensions: [], status: 'active', sourceIntegrity: 'secure_backend',
    ...overrides,
  }
  await db.collection('activeVisits').doc(id).set(visit)
  await db.collection('visits').doc(id).set(visit)
}

async function seedOrder(id = 'order-1', visitId = 'visit-1', overrides = {}) {
  await db.collection('canteenOrders').doc(id).set({
    id, type: 'visit', visitId, visitIds: [visitId], accountName: 'Mateo', customerName: 'Maria',
    items: [activeLine()], total: 20000, costTotal: 8000, estimatedProfit: 12000,
    status: 'open', paymentStatus: 'pending', createdAt: new Date(), ...overrides,
  })
}

async function seedGroup() {
  const batch = db.batch()
  for (const [id, childName, minutesAgo] of [['visit-a', 'Ana', 20], ['visit-b', 'Beto', 10]]) {
    const visit = {
      id, groupEntryId: 'group-1', childId: `child-${id}`, childName, customerId: 'customer-1', customerName: 'Maria',
      planId: 'one-hour', planName: '1 hora', durationMinutes: 60, isUnlimited: false,
      startedAt: new Date(Date.now() - minutesAgo * 60 * 1000), expectedEndAt: new Date(Date.now() + 40 * 60 * 1000),
      paymentStatus: 'pending', parkPaymentStatus: 'pending', amountCharged: 60000, parkChargeAmount: 60000,
      paidParkAmount: 0, extensionChargeAmount: 0, timeExtensions: [], status: 'active', sourceIntegrity: 'secure_backend',
    }
    batch.set(db.collection('activeVisits').doc(id), visit)
    batch.set(db.collection('visits').doc(id), visit)
  }
  batch.set(db.collection('canteenOrders').doc('group-order'), {
    id: 'group-order', type: 'visit', groupEntryId: 'group-1', visitId: 'visit-a', visitIds: ['visit-a', 'visit-b'],
    accountName: 'Maria - Ana y Beto', customerName: 'Maria', items: [activeLine()], total: 20000,
    costTotal: 8000, estimatedProfit: 12000, status: 'open', paymentStatus: 'pending', createdAt: new Date(),
  })
  await batch.commit()
}

const monthsAgoIso = (months) => {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return date.toISOString().slice(0, 10)
}

const paymentsSize = async () => (await db.collection('payments').get()).size
const getVisit = async (id) => (await db.collection('activeVisits').doc(id).get()).data()
const getOrder = async (id) => (await db.collection('canteenOrders').doc(id).get()).data()

beforeEach(async () => {
  sequence = 0
  await clearFirestore()
  await seedBase()
})

describe('pagos parciales', () => {
  test('registra un pago menor al saldo, mantiene visita y cuenta abiertas', async () => {
    await seedVisit()
    await seedOrder()
    const result = await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 60000, paymentMethod: 'cash', target: 'general',
      clientPaymentId: 'cp-1', idempotencyKey: key('partial-a'),
    })
    assert.equal(result.parkAmountPaid, 60000)
    assert.equal(result.canteenAmountPaid, 0)
    assert.equal(result.balanceBefore, 80000)
    assert.equal(result.balanceAfter, 20000)
    const visit = await getVisit('visit-1')
    assert.equal(visit.status, 'active')
    assert.equal(visit.paidParkAmount, 60000)
    assert.equal(visit.parkPaymentStatus, 'paid')
    const order = await getOrder('order-1')
    assert.equal(order.status, 'open')
    const payment = await db.collection('payments').doc(result.paymentId).get()
    assert.equal(payment.data().source, 'reception_partial')
    assert.equal(payment.data().totalPaid, 60000)
  })

  test('cobrar solo la entrada del parque deja cantina abierta', async () => {
    await seedVisit()
    await seedOrder()
    const result = await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 60000, paymentMethod: 'cash', target: 'park',
      clientPaymentId: 'cp-park', idempotencyKey: key('park-only'),
    })
    assert.equal(result.parkAmountPaid, 60000)
    assert.equal(result.canteenAmountPaid, 0)
    const order = await getOrder('order-1')
    assert.equal(order.status, 'open')
    assert.equal(order.paidAmount ?? 0, 0)
  })

  test('permite un segundo pago y luego cobra solo el saldo restante (sin doble cobro)', async () => {
    await seedVisit()
    await seedOrder()
    await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 60000, paymentMethod: 'cash', target: 'park',
      clientPaymentId: 'cp-1', idempotencyKey: key('first'),
    })
    // Nuevo consumo posterior
    await confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-1', items: [{ productId: 'product-1', quantity: 1 }], idempotencyKey: key('add'),
    })
    // Cobro final del saldo (park 0 + canteen 30000)
    const checkout = await checkoutVisitGroupSecure('recepcion', {
      visitId: 'visit-1', visitIds: ['visit-1'], paymentMethod: 'cash', source: 'reception', finishVisit: true,
      idempotencyKey: key('checkout'),
    })
    assert.equal(checkout.parkAmountPaid, 0)
    assert.equal(checkout.canteenAmountPaid, 30000)
    assert.equal(checkout.totalPaid, 30000)
  })

  test('rechaza monto cero, negativo y mayor al saldo', async () => {
    await seedVisit()
    await seedOrder()
    await assert.rejects(() => registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 0, paymentMethod: 'cash', target: 'general', clientPaymentId: 'z', idempotencyKey: key('zero'),
    }), /mayor a cero/i)
    await assert.rejects(() => registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: -5000, paymentMethod: 'cash', target: 'general', clientPaymentId: 'n', idempotencyKey: key('neg'),
    }), /no negativo|mayor a cero/i)
    await assert.rejects(() => registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 90000, paymentMethod: 'cash', target: 'general', clientPaymentId: 'o', idempotencyKey: key('over'),
    }), /supera el saldo/i)
    assert.equal(await paymentsSize(), 0)
  })

  test('doble clic (misma idempotencyKey) no duplica el pago', async () => {
    await seedVisit()
    await seedOrder()
    const idempotencyKey = key('double')
    const first = await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 40000, paymentMethod: 'cash', target: 'general', clientPaymentId: 'cp-d', idempotencyKey,
    })
    const second = await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 40000, paymentMethod: 'cash', target: 'general', clientPaymentId: 'cp-d', idempotencyKey,
    })
    assert.deepEqual(second, first)
    assert.equal(await paymentsSize(), 1)
  })

  test('saldo cero con cuenta todavia abierta (visita activa)', async () => {
    await seedVisit()
    await seedOrder()
    const result = await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 80000, paymentMethod: 'cash', target: 'general', clientPaymentId: 'cp-full', idempotencyKey: key('full'),
    })
    assert.equal(result.balanceAfter, 0)
    const visit = await getVisit('visit-1')
    assert.equal(visit.status, 'active')
    const order = await getOrder('order-1')
    assert.equal(order.status, 'open')
    assert.equal(order.paidAmount, 20000)
  })

  test('no permite finalizar con saldo pendiente y si permite al saldar', async () => {
    await seedVisit()
    await seedOrder()
    await registerPartialPaymentSecure('recepcion', {
      visitId: 'visit-1', amount: 60000, paymentMethod: 'cash', target: 'park', clientPaymentId: 'cp-1', idempotencyKey: key('p'),
    })
    await assert.rejects(() => finishVisitSecure('recepcion', { visitId: 'visit-1', idempotencyKey: key('finish-block') }), /saldo pendiente/i)
    await chargeCanteenOrderSecure('cantina', { orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('charge-canteen') })
    const finished = await finishVisitSecure('recepcion', { visitId: 'visit-1', idempotencyKey: key('finish-ok') })
    assert.equal(finished.status, 'finished')
  })

  test('funciona con grupos familiares de forma atomica', async () => {
    await seedGroup()
    const result = await registerPartialPaymentSecure('recepcion', {
      groupEntryId: 'group-1', amount: 60000, paymentMethod: 'cash', target: 'general', clientPaymentId: 'cp-g', idempotencyKey: key('group'),
    })
    // Aplica al parque de la visita mas antigua (visit-a)
    assert.equal(result.parkAmountPaid, 60000)
    assert.equal(result.balanceBefore, 140000)
    assert.equal(result.balanceAfter, 80000)
    const a = await getVisit('visit-a')
    const b = await getVisit('visit-b')
    assert.equal(a.paidParkAmount, 60000)
    assert.equal(b.paidParkAmount, 0)
  })
})

describe('entrada gratuita por bebe', () => {
  test('nino dentro del limite obtiene entrada gratuita automatica sin cargo ni pago', async () => {
    await seedBabyConfig(true, 24)
    const result = await createVisitSecure('recepcion', {
      childName: 'Bebe Uno', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(10), idempotencyKey: key('baby-auto'),
    })
    assert.equal(result.isBaby, true)
    assert.equal(result.babyMode, 'auto')
    assert.equal(result.amount, 0)
    const visit = await getVisit(result.visitId)
    assert.equal(visit.isBaby, true)
    assert.equal(visit.parkChargeAmount, 0)
    assert.equal(visit.paymentStatus, 'paid')
    assert.equal(visit.durationMinutes, null)
    assert.equal(visit.expectedEndAt, null)
    assert.equal(visit.babyFreeEntry.mode, 'auto')
    assert.equal(await paymentsSize(), 0)
  })

  test('nino fuera del limite conserva precio normal', async () => {
    await seedBabyConfig(true, 24)
    const result = await createVisitSecure('recepcion', {
      childName: 'Nino Grande', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(40), idempotencyKey: key('baby-out'),
    })
    assert.equal(result.isBaby, false)
    const visit = await getVisit(result.visitId)
    assert.equal(visit.isBaby, false)
    assert.equal(visit.parkChargeAmount, 60000)
  })

  test('configuracion desactivada no aplica gratuidad automatica', async () => {
    await seedBabyConfig(false, 24)
    const result = await createVisitSecure('recepcion', {
      childName: 'Bebe Dos', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(10), idempotencyKey: key('baby-off'),
    })
    assert.equal(result.isBaby, false)
    const visit = await getVisit(result.visitId)
    assert.equal(visit.parkChargeAmount, 60000)
  })

  test('fecha de nacimiento faltante no aplica gratuidad automatica', async () => {
    await seedBabyConfig(true, 24)
    const result = await createVisitSecure('recepcion', {
      childName: 'Sin Fecha', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), idempotencyKey: key('baby-nodate'),
    })
    assert.equal(result.isBaby, false)
  })

  test('seleccion manual funciona y exige motivo cuando no cumple por edad', async () => {
    await seedBabyConfig(true, 24)
    await assert.rejects(() => createVisitSecure('recepcion', {
      childName: 'Manual', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(40),
      babyFreeEntry: { requested: true }, idempotencyKey: key('manual-noreason'),
    }), /motivo/i)
    const result = await createVisitSecure('recepcion', {
      childName: 'Manual2', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(40),
      babyFreeEntry: { requested: true, reason: 'Autorizacion del dueno' }, idempotencyKey: key('manual-ok'),
    })
    assert.equal(result.isBaby, true)
    const visit = await getVisit(result.visitId)
    assert.equal(visit.babyFreeEntry.mode, 'manual')
    assert.equal(visit.babyFreeEntry.reason, 'Autorizacion del dueno')
    assert.equal(visit.parkChargeAmount, 0)
  })

  test('recepcion no puede cobrar un bebe elegible; admin si con motivo', async () => {
    await seedBabyConfig(true, 24)
    await assert.rejects(() => createVisitSecure('recepcion', {
      childName: 'Elegible', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'paid', paymentMethod: 'cash',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(10),
      babyFreeEntry: { requested: false }, idempotencyKey: key('reject-charge'),
    }), /Admin o Socio/i)
    const result = await createVisitSecure('admin', {
      childName: 'Elegible2', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'paid', paymentMethod: 'cash',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(10),
      babyFreeEntry: { requested: false, overrideReason: 'Excepcion confirmada' }, idempotencyKey: key('admin-charge'),
    })
    assert.equal(result.isBaby, false)
    const visit = await getVisit(result.visitId)
    assert.equal(visit.parkChargeAmount, 60000)
    assert.equal(visit.babyFreeOverride.chargedEligibleBaby, true)
  })

  test('un price:0 arbitrario en un plan normal es ignorado (se cobra el precio real)', async () => {
    await seedBabyConfig(true, 24)
    const result = await createVisitSecure('recepcion', {
      childName: 'Precio Cero', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'paid', paymentMethod: 'cash',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(60), amountCharged: 0, idempotencyKey: key('price-zero'),
    })
    assert.equal(result.isBaby, false)
    const visit = await getVisit(result.visitId)
    assert.equal(visit.parkChargeAmount, 60000)
  })

  test('bebe cuenta como visita activa y admite consumo de cantina cobrable', async () => {
    await seedBabyConfig(true, 24)
    const result = await createVisitSecure('recepcion', {
      childName: 'Bebe Cantina', customerName: 'Ana', planId: 'one-hour', paymentStatus: 'pending',
      startedAt: new Date().toISOString(), childBirthDate: monthsAgoIso(8), idempotencyKey: key('baby-canteen'),
    })
    const active = await getVisit(result.visitId)
    assert.equal(active.status, 'active')
    await seedOrder('baby-order', result.visitId)
    const charge = await chargeCanteenOrderSecure('cantina', { orderId: 'baby-order', paymentMethod: 'cash', idempotencyKey: key('baby-charge') })
    assert.equal(charge.total, 20000)
  })
})

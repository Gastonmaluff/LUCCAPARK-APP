const assert = require('node:assert/strict')
const { beforeEach, describe, test } = require('node:test')

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-luccapark-functions'

const { db } = require('../lib/common')
const {
  adjustCanteenStockSecure,
  chargeCanteenOrderSecure,
  confirmCanteenConsumptionSecure,
  createCanteenOrderSecure,
  refundCanteenOrderSecure,
  requestCanteenVoidSecure,
  reviewCanteenVoidSecure,
  upsertCanteenProductSecure,
} = require('../lib/canteen')
const { registerEventPaymentSecure } = require('../lib/events')
const { checkoutVisitGroupSecure, createVisitSecure, extendVisitTimeSecure } = require('../lib/visits')

const projectId = process.env.GCLOUD_PROJECT
let sequence = 0
const key = (prefix) => `${prefix}-${++sequence}-secure`

const profiles = {
  admin: { uid: 'admin', displayName: 'Admin', email: 'admin@test.local', role: 'admin', isActive: true },
  socio: { uid: 'socio', displayName: 'Socio', email: 'socio@test.local', role: 'socio', isActive: true },
  recepcion: { uid: 'recepcion', displayName: 'Recepcion', email: 'recepcion@test.local', role: 'recepcion', isActive: true },
  cantina: { uid: 'cantina', displayName: 'Cantina', email: 'cantina@test.local', role: 'cantina', isActive: true },
  eventos: { uid: 'eventos', displayName: 'Eventos', email: 'eventos@test.local', role: 'encargado_eventos', isActive: true },
  inactivo: { uid: 'inactivo', displayName: 'Inactivo', email: 'inactive@test.local', role: 'cantina', isActive: false },
}

const activeLine = (quantity = 2) => ({
  lineItemId: 'line-1',
  productId: 'product-1',
  productName: 'Agua',
  category: 'Bebidas',
  unitPrice: 10000,
  unitCost: 4000,
  quantity,
  subtotal: quantity * 10000,
  costSubtotal: quantity * 4000,
  status: 'active',
  pricingSource: 'server_catalog',
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
    id: 'product-1', name: 'Agua', category: 'Bebidas', price: 10000, salePrice: 10000,
    unitCost: 4000, stock: 10, minStock: 2, isActive: true,
  })
  batch.set(db.collection('canteenCategories').doc('bebidas'), {
    id: 'bebidas', name: 'Bebidas', normalizedName: 'bebidas', isActive: true,
  })
  batch.set(db.collection('events').doc('event-1'), {
    id: 'event-1', title: 'Cumple de Ana', customerName: 'Maria', status: 'confirmed', totalAmount: 100000,
    eventPaidAmount: 0, pendingAmount: 100000, financialStatus: 'unpaid',
  })
  await batch.commit()
}

async function seedOrder(id = 'order-1', overrides = {}) {
  await db.collection('canteenOrders').doc(id).set({
    id,
    type: 'free',
    accountName: 'Cuenta de prueba',
    customerName: 'Cliente',
    items: [activeLine()],
    total: 20000,
    costTotal: 8000,
    estimatedProfit: 12000,
    status: 'open',
    paymentStatus: 'pending',
    ...overrides,
  })
}

async function seedGroup({ withOrder = true } = {}) {
  const batch = db.batch()
  for (const [id, childName] of [['visit-a', 'Ana'], ['visit-b', 'Beto']]) {
    const visit = {
      id, groupEntryId: 'group-1', childId: `child-${id}`, childName, customerId: 'customer-1', customerName: 'Maria',
      planId: 'one-hour', planName: '1 hora', durationMinutes: 60, isUnlimited: false,
      startedAt: new Date(Date.now() - 10 * 60 * 1000), expectedEndAt: new Date(Date.now() + 50 * 60 * 1000),
      paymentStatus: 'pending', parkPaymentStatus: 'pending', amountCharged: 60000, parkChargeAmount: 60000,
      paidParkAmount: 0, extensionChargeAmount: 0, timeExtensions: [], status: 'active', sourceIntegrity: 'secure_backend',
    }
    batch.set(db.collection('activeVisits').doc(id), visit)
    batch.set(db.collection('visits').doc(id), visit)
  }
  if (withOrder) {
    batch.set(db.collection('canteenOrders').doc('group-order'), {
      id: 'group-order', type: 'visit', groupEntryId: 'group-1', visitId: 'visit-a', visitIds: ['visit-a', 'visit-b'],
      accountName: 'Maria - Ana y Beto', customerName: 'Maria', items: [activeLine()], total: 20000,
      costTotal: 8000, estimatedProfit: 12000, status: 'open', paymentStatus: 'pending',
    })
  }
  await batch.commit()
}

async function seedUnlimitedVisit(id = 'unlimited-visit', minutesAgo = 130, overrides = {}) {
  const startedAt = new Date(Date.now() - minutesAgo * 60 * 1000)
  const visit = {
    id,
    childId: `child-${id}`,
    childName: 'Lito VIP',
    customerId: 'customer-1',
    customerName: 'Maria',
    planId: 'unlimited',
    planName: 'Libre / sin limite',
    durationMinutes: null,
    isUnlimited: true,
    startedAt,
    expectedEndAt: null,
    paymentStatus: 'pending',
    parkPaymentStatus: 'pending',
    amountCharged: null,
    parkChargeAmount: null,
    paidParkAmount: 0,
    extensionChargeAmount: 0,
    timeExtensions: [],
    status: 'active',
    sourceIntegrity: 'secure_backend',
    ...overrides,
  }
  await db.collection('activeVisits').doc(id).set(visit)
  await db.collection('visits').doc(id).set(visit)
}

async function seedUnlimitedRate(rate = 30000) {
  await db.collection('settings').doc('visitPricing').set({ unlimitedHourlyRate: rate })
}

beforeEach(async () => {
  sequence = 0
  await clearFirestore()
  await seedBase()
})

describe('autenticacion, perfiles y autorizacion', () => {
  test('1. usuario no autenticado no puede cobrar', async () => {
    await seedOrder()
    await assert.rejects(() => chargeCanteenOrderSecure(null, {
      orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('anonymous'),
    }), /iniciar sesion/i)
  })

  test('2. usuario sin perfil no puede cobrar', async () => {
    await seedOrder()
    await assert.rejects(() => chargeCanteenOrderSecure('sin-perfil', {
      orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('missing-profile'),
    }), /perfil autorizado/i)
  })

  test('3. usuario inactivo no puede cobrar', async () => {
    await seedOrder()
    await assert.rejects(() => chargeCanteenOrderSecure('inactivo', {
      orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('inactive'),
    }), /no esta activo/i)
  })

  test('4. rol no autorizado no puede cobrar Cantina', async () => {
    await seedOrder()
    await assert.rejects(() => chargeCanteenOrderSecure('eventos', {
      orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('role'),
    }), /rol no permite/i)
  })
})

describe('pagos e idempotencia', () => {
  test('5. el total enviado por el cliente es ignorado', async () => {
    await seedOrder('order-1', { total: 1 })
    const result = await chargeCanteenOrderSecure('cantina', {
      orderId: 'order-1', paymentMethod: 'cash', total: 1, idempotencyKey: key('trusted-total'),
    })
    assert.equal(result.total, 20000)
    const payment = await db.collection('payments').doc(result.paymentId).get()
    assert.equal(payment.data().totalPaid, 20000)
  })

  test('6. una cuenta pagada no puede cobrarse otra vez con otra key', async () => {
    await seedOrder()
    await chargeCanteenOrderSecure('cantina', { orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('first') })
    await assert.rejects(() => chargeCanteenOrderSecure('cantina', {
      orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('second'),
    }), /ya fue cobrada/i)
  })

  test('7. la misma idempotencyKey devuelve el resultado y no duplica pago', async () => {
    await seedOrder()
    const idempotencyKey = key('same-key')
    const first = await chargeCanteenOrderSecure('cantina', { orderId: 'order-1', paymentMethod: 'cash', idempotencyKey })
    const second = await chargeCanteenOrderSecure('cantina', { orderId: 'order-1', paymentMethod: 'cash', idempotencyKey })
    assert.deepEqual(second, first)
    assert.equal((await db.collection('payments').get()).size, 1)
  })

  test('8. dos solicitudes concurrentes generan un solo pago', async () => {
    await seedOrder()
    const results = await Promise.allSettled([
      chargeCanteenOrderSecure('cantina', { orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('race-a') }),
      chargeCanteenOrderSecure('cantina', { orderId: 'order-1', paymentMethod: 'cash', idempotencyKey: key('race-b') }),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal((await db.collection('payments').get()).size, 1)
  })

  test('9. pago de evento mayor al saldo es rechazado', async () => {
    await assert.rejects(() => registerEventPaymentSecure('eventos', {
      eventId: 'event-1', amount: 120000, paymentMethod: 'cash', concept: 'balance', idempotencyKey: key('overpay'),
    }), /supera el saldo/i)
    assert.equal((await db.collection('payments').get()).size, 0)
  })

  test('10. pago de evento con saldo cero es rechazado', async () => {
    await db.collection('payments').doc('event-paid').set({
      id: 'event-paid', eventId: 'event-1', source: 'event_payment', concepts: 'event', status: 'paid', eventAmountPaid: 100000, totalPaid: 100000,
    })
    await assert.rejects(() => registerEventPaymentSecure('eventos', {
      eventId: 'event-1', amount: 1000, paymentMethod: 'cash', concept: 'partial', idempotencyKey: key('zero-balance'),
    }), /no tiene saldo/i)
  })
})

describe('consumos y stock', () => {
  test('11. precio enviado por el cliente es ignorado', async () => {
    await seedOrder('order-empty', { items: [], total: 0, costTotal: 0, estimatedProfit: 0 })
    const result = await confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'product-1', quantity: 2, unitPrice: 1 }], idempotencyKey: key('price'),
    })
    assert.equal(result.total, 20000)
    const order = await db.collection('canteenOrders').doc('order-empty').get()
    assert.equal(order.data().items[0].unitPrice, 10000)
  })

  test('12. producto inexistente es rechazado', async () => {
    await seedOrder('order-empty', { items: [], total: 0 })
    await assert.rejects(() => confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'missing', quantity: 1 }], idempotencyKey: key('missing-product'),
    }), /no existe/i)
  })

  test('13. cantidades negativas o decimales son rechazadas', async () => {
    await seedOrder('order-empty', { items: [], total: 0 })
    await assert.rejects(() => confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'product-1', quantity: -1 }], idempotencyKey: key('negative'),
    }), /entero mayor a cero/i)
    await assert.rejects(() => confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'product-1', quantity: 1.5 }], idempotencyKey: key('decimal'),
    }), /entero mayor a cero/i)
  })

  test('14. stock insuficiente es rechazado', async () => {
    await seedOrder('order-empty', { items: [], total: 0 })
    await assert.rejects(() => confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'product-1', quantity: 11 }], idempotencyKey: key('stock'),
    }), /stock insuficiente/i)
  })

  test('15. un fallo por stock nunca deja stock negativo', async () => {
    await seedOrder('order-empty', { items: [], total: 0 })
    await assert.rejects(() => confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'product-1', quantity: 11 }], idempotencyKey: key('stock-safe'),
    }))
    assert.equal((await db.collection('canteenProducts').doc('product-1').get()).data().stock, 10)
  })

  test('16. una venta descuenta stock y crea movimiento', async () => {
    await seedOrder('order-empty', { items: [], total: 0 })
    await confirmCanteenConsumptionSecure('cantina', {
      orderId: 'order-empty', items: [{ productId: 'product-1', quantity: 2 }], idempotencyKey: key('sale'),
    })
    assert.equal((await db.collection('canteenProducts').doc('product-1').get()).data().stock, 8)
    const movements = await db.collection('canteenInventoryMovements').where('type', '==', 'sale').get()
    assert.equal(movements.size, 1)
    assert.equal(movements.docs[0].data().stockAfter, 8)
  })

  test('17. anulacion no entregada devuelve stock y crea movimiento', async () => {
    await seedOrder()
    await db.collection('canteenProducts').doc('product-1').update({ stock: 8 })
    const request = await requestCanteenVoidSecure('cantina', {
      orderId: 'order-1', scope: 'account', reason: 'Carga duplicada', idempotencyKey: key('void-request'),
    })
    await reviewCanteenVoidSecure('admin', {
      requestId: request.requestId, decision: 'approved', productsDelivered: false, idempotencyKey: key('void-review'),
    })
    assert.equal((await db.collection('canteenProducts').doc('product-1').get()).data().stock, 10)
    assert.equal((await db.collection('canteenInventoryMovements').where('type', '==', 'void_return').get()).size, 1)
  })

  test('18. ajuste de stock requiere Admin o Socio', async () => {
    await assert.rejects(() => adjustCanteenStockSecure('cantina', {
      productId: 'product-1', quantity: 2, direction: 'increase', reason: 'Compra', idempotencyKey: key('forbidden-adjustment'),
    }), /rol no permite/i)
    const result = await adjustCanteenStockSecure('admin', {
      productId: 'product-1', quantity: 2, direction: 'increase', reason: 'Compra', idempotencyKey: key('admin-adjustment'),
    })
    assert.equal(result.stockAfter, 12)
  })

  test('19. Socio puede realizar un ajuste auditado', async () => {
    const result = await adjustCanteenStockSecure('socio', {
      productId: 'product-1', quantity: 3, direction: 'decrease', reason: 'Conteo fisico', idempotencyKey: key('partner-adjustment'),
    })
    assert.equal(result.stockAfter, 7)
    const movement = await db.collection('canteenInventoryMovements').doc(result.movementId).get()
    assert.equal(movement.data().createdBy, 'socio')
  })

  test('19b. producto nuevo requiere categoria activa configurada', async () => {
    const productId = await upsertCanteenProductSecure('admin', {
      category: 'Bebidas',
      idempotencyKey: key('new-product-valid-category'),
      isActive: true,
      name: 'Jugo',
      price: 12000,
      stock: 5,
    })
    assert.ok(productId.productId)
    await assert.rejects(() => upsertCanteenProductSecure('admin', {
      category: 'Categoria fantasma',
      idempotencyKey: key('new-product-invalid-category'),
      isActive: true,
      name: 'Producto fantasma',
      price: 12000,
      stock: 5,
    }), /categoria seleccionada no esta activa/i)
  })

  test('19c. producto legacy puede conservar su categoria existente', async () => {
    await db.collection('canteenCategories').doc('bebidas').delete()
    const result = await upsertCanteenProductSecure('admin', {
      id: 'product-1',
      category: 'Bebidas',
      idempotencyKey: key('legacy-product-same-category'),
      isActive: true,
      name: 'Agua editada',
      price: 11000,
      unitCost: 4000,
    })
    assert.equal(result.productId, 'product-1')
    assert.equal((await db.collection('canteenProducts').doc('product-1').get()).data().stock, 10)
  })

  test('20. productos entregados no restauran stock y quedan como cortesia', async () => {
    await seedOrder()
    await db.collection('canteenProducts').doc('product-1').update({ stock: 8 })
    const request = await requestCanteenVoidSecure('cantina', {
      orderId: 'order-1', scope: 'account', reason: 'Cortesia autorizada', idempotencyKey: key('courtesy-request'),
    })
    await reviewCanteenVoidSecure('admin', {
      requestId: request.requestId, decision: 'approved', productsDelivered: true,
      deliveredDisposition: 'courtesy', idempotencyKey: key('courtesy-review'),
    })
    assert.equal((await db.collection('canteenProducts').doc('product-1').get()).data().stock, 8)
    assert.equal((await db.collection('canteenInventoryMovements').where('type', '==', 'courtesy').get()).size, 1)
  })
})

describe('checkout grupal atomico', () => {
  test('21. grupo de dos ninos genera un solo pago', async () => {
    await seedGroup()
    const result = await checkoutVisitGroupSecure('recepcion', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey: key('group-payment'),
    })
    assert.equal(result.visitIds.length, 2)
    assert.equal((await db.collection('payments').get()).size, 1)
  })

  test('22. la Cantina compartida se cuenta una sola vez', async () => {
    await seedGroup()
    const result = await checkoutVisitGroupSecure('recepcion', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: false, source: 'reception', idempotencyKey: key('shared-canteen'),
    })
    assert.equal(result.parkAmountPaid, 120000)
    assert.equal(result.canteenAmountPaid, 20000)
    assert.equal(result.totalPaid, 140000)
  })

  test('23. al finalizar se cierran las dos visitas y la cuenta', async () => {
    await seedGroup()
    await checkoutVisitGroupSecure('recepcion', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey: key('group-finish'),
    })
    assert.equal((await db.collection('activeVisits').get()).size, 0)
    const historical = await db.collection('visits').get()
    assert.deepEqual(historical.docs.map((document) => document.data().status).sort(), ['finished', 'finished'])
    assert.equal((await db.collection('canteenOrders').doc('group-order').get()).data().status, 'paid')
  })

  test('24. un fallo simulado no deja el grupo parcialmente cerrado', async () => {
    await seedGroup()
    await assert.rejects(() => checkoutVisitGroupSecure('recepcion', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey: key('group-failure'),
    }, { failBeforeWrites: true }), /simulado/i)
    assert.equal((await db.collection('activeVisits').get()).size, 2)
    assert.equal((await db.collection('payments').get()).size, 0)
    assert.equal((await db.collection('canteenOrders').doc('group-order').get()).data().status, 'open')
  })
})

describe('operaciones complementarias protegidas', () => {
  test('25. alta de visita ignora un precio estandar manipulado', async () => {
    const result = await createVisitSecure('recepcion', {
      childName: 'Luna', customerName: 'Maria', customerPhone: '0981000000',
      planId: 'one-hour', startedAt: new Date().toISOString(), paymentStatus: 'paid',
      paymentMethod: 'cash', amountCharged: 1, customAmount: false, idempotencyKey: key('visit-price'),
    })
    assert.equal(result.amount, 60000)
    assert.equal((await db.collection('payments').doc(result.paymentId).get()).data().totalPaid, 60000)
  })

  test('26. Recepcion no puede aplicar precios especiales arbitrarios', async () => {
    await assert.rejects(() => createVisitSecure('recepcion', {
      childName: 'Luna', customerName: 'Maria', planId: 'one-hour', startedAt: new Date().toISOString(),
      paymentStatus: 'pending', amountCharged: 1, customAmount: true, idempotencyKey: key('custom-price'),
    }), /solo Administracion/i)
  })

  test('27. extension usa importe fijo del servidor', async () => {
    await seedGroup({ withOrder: false })
    const result = await extendVisitTimeSecure('recepcion', {
      visitId: 'visit-a', minutes: 30, amount: 1, idempotencyKey: key('extension-price'),
    })
    assert.equal(result.amount, 30000)
    assert.equal((await db.collection('activeVisits').doc('visit-a').get()).data().parkChargeAmount, 90000)
  })

  test('28. reembolso conserva pago original y es idempotente', async () => {
    await seedOrder('order-1', { status: 'paid', paymentStatus: 'paid' })
    await db.collection('payments').doc('original').set({
      id: 'original', source: 'canteen', status: 'paid', canteenOrderIds: ['order-1'],
      canteenAmountPaid: 20000, totalPaid: 20000,
    })
    const idempotencyKey = key('refund')
    const first = await refundCanteenOrderSecure('admin', {
      orderId: 'order-1', reason: 'Devolucion autorizada', paymentMethod: 'cash', idempotencyKey,
    })
    const second = await refundCanteenOrderSecure('admin', {
      orderId: 'order-1', reason: 'Devolucion autorizada', paymentMethod: 'cash', idempotencyKey,
    })
    assert.deepEqual(second, first)
    assert.equal((await db.collection('payments').get()).size, 2)
    assert.equal((await db.collection('payments').doc(first.paymentId).get()).data().totalPaid, -20000)
  })

  test('29. Cantina no puede finalizar visitas desde checkout', async () => {
    await seedGroup()
    await assert.rejects(() => checkoutVisitGroupSecure('cantina', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: true,
      source: 'canteen', idempotencyKey: key('canteen-finish'),
    }), /salida debe finalizar desde Recepcion/i)
    assert.equal((await db.collection('activeVisits').get()).size, 2)
  })

  test('30. pago valido de evento es atomico e idempotente', async () => {
    const idempotencyKey = key('event-valid')
    const first = await registerEventPaymentSecure('eventos', {
      eventId: 'event-1', amount: 40000, paymentMethod: 'transfer', concept: 'deposit', idempotencyKey,
    })
    const second = await registerEventPaymentSecure('eventos', {
      eventId: 'event-1', amount: 40000, paymentMethod: 'transfer', concept: 'deposit', idempotencyKey,
    })
    assert.deepEqual(second, first)
    assert.equal((await db.collection('payments').get()).size, 1)
    const event = await db.collection('events').doc('event-1').get()
    assert.equal(event.data().eventPaidAmount, 40000)
    assert.equal(event.data().pendingAmount, 60000)
  })

  test('31. apertura de cuenta queda en backend y no acepta precio del cliente', async () => {
    const result = await createCanteenOrderSecure('cantina', {
      type: 'free', accountName: 'Cliente libre', chargeNow: false,
      items: [{ productId: 'product-1', quantity: 1, unitPrice: 1 }],
      idempotencyKey: key('create-order'),
    })
    const order = await db.collection('canteenOrders').doc(result.orderId).get()
    assert.equal(order.data().total, 10000)
    assert.equal(order.data().items[0].unitPrice, 10000)
    assert.equal((await db.collection('canteenProducts').doc('product-1').get()).data().stock, 9)
  })
})

describe('plan libre seguro', () => {
  test('32. plan libre puede ingresar sin monto inicial y sin pago', async () => {
    const result = await createVisitSecure('recepcion', {
      childName: 'Lito VIP', customerName: 'Maria', planId: 'unlimited',
      startedAt: new Date().toISOString(), paymentStatus: 'payAtExit', amountCharged: null,
      idempotencyKey: key('unlimited-entry'),
    })
    assert.equal(result.amount, 0)
    assert.equal(result.paymentId, '')
    assert.equal((await db.collection('payments').get()).size, 0)
    const active = await db.collection('activeVisits').doc(result.visitId).get()
    assert.equal(active.data().isUnlimited, true)
    assert.equal(active.data().expectedEndAt, null)
    assert.equal(active.data().parkChargeAmount, null)
  })

  test('33. plan libre rechaza cobro o importe inicial', async () => {
    await assert.rejects(() => createVisitSecure('recepcion', {
      childName: 'Lito VIP', customerName: 'Maria', planId: 'unlimited',
      startedAt: new Date().toISOString(), paymentStatus: 'paid', paymentMethod: 'cash',
      idempotencyKey: key('unlimited-paid'),
    }), /se cobra al finalizar/i)
    await assert.rejects(() => createVisitSecure('admin', {
      childName: 'Lito VIP', customerName: 'Maria', planId: 'unlimited',
      startedAt: new Date().toISOString(), paymentStatus: 'pending', amountCharged: 50000,
      customAmount: true, idempotencyKey: key('unlimited-amount'),
    }), /se cobra y confirma al finalizar/i)
  })

  test('34. horas facturables usan horas completas con minimo de una hora', async () => {
    await seedUnlimitedRate(30000)
    for (const [visitId, minutesAgo, expectedHours] of [
      ['free-45', 45, 1],
      ['free-90', 90, 1],
      ['free-130', 130, 2],
      ['free-220', 220, 3],
    ]) {
      await seedUnlimitedVisit(visitId, minutesAgo)
      const result = await checkoutVisitGroupSecure('recepcion', {
        visitId, paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey: key(`checkout-${visitId}`),
      })
      assert.equal(result.parkAmountPaid, expectedHours * 30000)
      const history = await db.collection('visits').doc(visitId).get()
      assert.equal(history.data().unlimitedPricing.billableHours, expectedHours)
      assert.equal(history.data().unlimitedPricing.suggestedAmount, expectedHours * 30000)
      assert.equal(history.data().status, 'finished')
    }
  })

  test('35. monto final distinto exige motivo y queda auditado', async () => {
    await seedUnlimitedRate(30000)
    await seedUnlimitedVisit('free-adjust', 130)
    await assert.rejects(() => checkoutVisitGroupSecure('recepcion', {
      visitId: 'free-adjust', paymentMethod: 'cash', finishVisits: true, source: 'reception',
      unlimitedAdjustments: { 'free-adjust': { finalAmount: 50000 } },
      idempotencyKey: key('adjust-missing-reason'),
    }), /motivo/i)
    assert.equal((await db.collection('activeVisits').doc('free-adjust').get()).exists, true)

    const result = await checkoutVisitGroupSecure('recepcion', {
      visitId: 'free-adjust', paymentMethod: 'cash', finishVisits: true, source: 'reception',
      unlimitedAdjustments: { 'free-adjust': { finalAmount: 50000, reason: 'tarifa VIP acordada' } },
      idempotencyKey: key('adjust-with-reason'),
    })
    assert.equal(result.parkAmountPaid, 50000)
    const history = await db.collection('visits').doc('free-adjust').get()
    assert.equal(history.data().unlimitedPricing.finalAmount, 50000)
    assert.equal(history.data().unlimitedPricing.suggestedAmount, 60000)
    assert.equal(history.data().unlimitedPricing.difference, -10000)
    assert.equal(history.data().unlimitedPricing.reason, 'tarifa VIP acordada')
    assert.equal(history.data().unlimitedPricing.adjustedBy, 'recepcion')
  })

  test('36. monto cero o negativo es rechazado y no duplica cobros por idempotencia', async () => {
    await seedUnlimitedRate(30000)
    await seedUnlimitedVisit('free-zero', 130)
    await assert.rejects(() => checkoutVisitGroupSecure('recepcion', {
      visitId: 'free-zero', paymentMethod: 'cash', finishVisits: true, source: 'reception',
      unlimitedAdjustments: { 'free-zero': { finalAmount: 0, reason: 'cortesia' } },
      idempotencyKey: key('zero-free'),
    }), /mayor a cero/i)

    await seedUnlimitedVisit('free-idempotent', 130)
    const idempotencyKey = key('free-idempotent')
    const first = await checkoutVisitGroupSecure('recepcion', {
      visitId: 'free-idempotent', paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey,
    })
    const second = await checkoutVisitGroupSecure('recepcion', {
      visitId: 'free-idempotent', paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey,
    })
    assert.deepEqual(second, first)
    assert.equal((await db.collection('payments').get()).size, 1)
  })

  test('37. grupo mixto suma plan temporal, libre y cantina compartida una sola vez', async () => {
    await seedUnlimitedRate(30000)
    await seedGroup()
    await db.collection('activeVisits').doc('visit-b').update({
      planId: 'unlimited', planName: 'Libre / sin limite', durationMinutes: null, isUnlimited: true,
      startedAt: new Date(Date.now() - 130 * 60 * 1000), expectedEndAt: null,
      amountCharged: null, parkChargeAmount: null, paidParkAmount: 0,
    })
    await db.collection('visits').doc('visit-b').update({
      planId: 'unlimited', planName: 'Libre / sin limite', durationMinutes: null, isUnlimited: true,
      startedAt: new Date(Date.now() - 130 * 60 * 1000), expectedEndAt: null,
      amountCharged: null, parkChargeAmount: null, paidParkAmount: 0,
    })
    const result = await checkoutVisitGroupSecure('recepcion', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: true, source: 'reception', idempotencyKey: key('mixed-group'),
    })
    assert.equal(result.parkAmountPaid, 120000)
    assert.equal(result.canteenAmountPaid, 20000)
    assert.equal(result.totalPaid, 140000)
    assert.equal((await db.collection('payments').get()).size, 1)
  })

  test('38. grupo con ajuste invalido no queda parcialmente cerrado', async () => {
    await seedUnlimitedRate(30000)
    await seedGroup()
    await db.collection('activeVisits').doc('visit-b').update({
      planId: 'unlimited', planName: 'Libre / sin limite', durationMinutes: null, isUnlimited: true,
      startedAt: new Date(Date.now() - 130 * 60 * 1000), expectedEndAt: null,
      amountCharged: null, parkChargeAmount: null, paidParkAmount: 0,
    })
    await db.collection('visits').doc('visit-b').update({
      planId: 'unlimited', planName: 'Libre / sin limite', durationMinutes: null, isUnlimited: true,
      startedAt: new Date(Date.now() - 130 * 60 * 1000), expectedEndAt: null,
      amountCharged: null, parkChargeAmount: null, paidParkAmount: 0,
    })
    await assert.rejects(() => checkoutVisitGroupSecure('recepcion', {
      groupEntryId: 'group-1', paymentMethod: 'cash', finishVisits: true, source: 'reception',
      unlimitedAdjustments: { 'visit-b': { finalAmount: 50000 } },
      idempotencyKey: key('mixed-group-invalid'),
    }), /motivo/i)
    assert.equal((await db.collection('activeVisits').get()).size, 2)
    assert.equal((await db.collection('payments').get()).size, 0)
    assert.equal((await db.collection('canteenOrders').doc('group-order').get()).data().status, 'open')
  })
})

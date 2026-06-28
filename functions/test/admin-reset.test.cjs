const assert = require('node:assert/strict')
const { beforeEach, describe, test } = require('node:test')

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-luccapark-reset'
process.env.FUNCTIONS_EMULATOR = process.env.FUNCTIONS_EMULATOR || 'true'

const { db } = require('../lib/common')
const { createCanteenOrderSecure } = require('../lib/canteen')
const { resetOperationalTestDataConfig, resetOperationalTestDataSecure } = require('../lib/adminReset')

const projectId = process.env.GCLOUD_PROJECT

const profiles = {
  admin: { uid: 'admin', displayName: 'Admin', email: 'admin@test.local', role: 'admin', isActive: true },
  socio: { uid: 'socio', displayName: 'Socio', email: 'socio@test.local', role: 'socio', isActive: true },
  cantina: { uid: 'cantina', displayName: 'Cantina', email: 'cantina@test.local', role: 'cantina', isActive: true },
  inactivo: { uid: 'inactivo', displayName: 'Inactivo', email: 'inactive@test.local', role: 'admin', isActive: false },
}

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST debe estar configurado')
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
  assert.ok(response.ok, `No se pudo limpiar Firestore: ${response.status}`)
}

async function count(collection) {
  const snapshot = await db.collection(collection).get()
  return snapshot.size
}

async function seedBase() {
  const batch = db.batch()
  Object.values(profiles).forEach((profile) => batch.set(db.collection('users').doc(profile.uid), profile))
  batch.set(db.collection('settings').doc('app'), { id: 'app', venueName: 'Lucca Park' })
  batch.set(db.collection('landingContent').doc('main'), { title: 'Lucca Park' })
  batch.set(db.collection('tvDisplaySettings').doc('main'), { mode: 'default' })
  await batch.commit()
}

async function seedOperationalData() {
  const batch = db.batch()
  batch.set(db.collection('customers').doc('customer-1'), { id: 'customer-1', name: 'Cliente de prueba' })
  batch.set(db.collection('children').doc('child-1'), { id: 'child-1', name: 'Nino prueba', customerId: 'customer-1' })
  batch.set(db.collection('activeVisits').doc('visit-1'), { id: 'visit-1', childId: 'child-1', status: 'active' })
  batch.set(db.collection('visits').doc('visit-1'), { id: 'visit-1', childId: 'child-1', status: 'finished' })
  batch.set(db.collection('canteenOrders').doc('order-1'), { id: 'order-1', total: 10000, status: 'open' })
  batch.set(db.collection('payments').doc('payment-1'), { id: 'payment-1', amount: 10000, source: 'test' })
  batch.set(db.collection('canteenProducts').doc('product-1'), {
    id: 'product-1',
    name: 'Producto falso',
    stock: 4,
    imageStoragePath: 'canteen-products/product-1.webp',
  })
  batch.set(db.collection('canteenCategories').doc('cat-1'), { id: 'cat-1', name: 'Categoria falsa' })
  batch.set(db.collection('canteenInventoryMovements').doc('move-1'), { id: 'move-1', productId: 'product-1', quantity: 4 })
  batch.set(db.collection('canteenVoidRequests').doc('void-1'), { id: 'void-1', accountId: 'order-1', status: 'pending' })
  batch.set(db.collection('events').doc('event-1'), { id: 'event-1', title: 'Evento prueba' })
  batch.set(db.collection('eventGuests').doc('guest-1'), { id: 'guest-1', eventId: 'event-1' })
  batch.set(db.collection('eventBudgets').doc('budget-1'), { id: 'budget-1', childName: 'Cumple prueba' })
  batch.set(db.collection('expenses').doc('expense-1'), { id: 'expense-1', amount: 5000 })
  batch.set(db.collection('financialClosures').doc('closure-1'), { id: 'closure-1', totalCollected: 10000 })
  batch.set(db.collection('dailyClosings').doc('daily-1'), { id: 'daily-1', total: 10000 })
  batch.set(db.collection('tasks').doc('task-1'), { id: 'task-1', title: 'Tarea prueba' })
  await batch.commit()
}

beforeEach(async () => {
  await clearFirestore()
  await seedBase()
})

describe('resetOperationalTestData', () => {
  test('1. usuario no autenticado rechazado', async () => {
    await assert.rejects(() => resetOperationalTestDataSecure(null, { mode: 'dryRun' }), /iniciar sesion/i)
  })

  test('2. usuario no Admin rechazado', async () => {
    await assert.rejects(() => resetOperationalTestDataSecure('socio', { mode: 'dryRun' }), /rol no permite/i)
  })

  test('3. Admin inactivo rechazado', async () => {
    await assert.rejects(() => resetOperationalTestDataSecure('inactivo', { mode: 'dryRun' }), /no esta activo/i)
  })

  test('4. dry-run no modifica datos', async () => {
    await seedOperationalData()
    const beforePayments = await count('payments')
    const result = await resetOperationalTestDataSecure('admin', { mode: 'dryRun' })
    assert.equal(result.mode, 'dryRun')
    assert.equal(await count('payments'), beforePayments)
    assert.equal(await count('cleanupDryRuns'), 0)
    assert.ok(result.totalDocuments > 0)
  })

  test('5. ejecucion requiere frase exacta', async () => {
    await assert.rejects(() => resetOperationalTestDataSecure('admin', {
      mode: 'execute',
      operationId: 'reset-confirmation-test',
      confirmation: 'limpiar',
    }), /LIMPIAR DATOS DE PRUEBA/)
  })

  test('6. coleccion no permitida no puede eliminarse', async () => {
    await assert.rejects(() => resetOperationalTestDataSecure('admin', {
      mode: 'dryRun',
      collections: ['users'],
    }), /colecciones dinamicas/i)
  })

  test('7 y 8. usuarios y configuracion se conservan', async () => {
    await seedOperationalData()
    await resetOperationalTestDataSecure('admin', {
      mode: 'execute',
      operationId: 'reset-preserve-test',
      confirmation: resetOperationalTestDataConfig.confirmationPhrase,
    })
    assert.equal(await count('users'), Object.keys(profiles).length)
    assert.equal(await count('settings'), 1)
    assert.equal(await count('landingContent'), 1)
    assert.equal(await count('tvDisplaySettings'), 1)
  })

  test('9 a 13. pagos, visitas, clientes, cuentas, movimientos, reservas y presupuestos se eliminan', async () => {
    await seedOperationalData()
    const result = await resetOperationalTestDataSecure('admin', {
      mode: 'execute',
      operationId: 'reset-operational-test',
      confirmation: resetOperationalTestDataConfig.confirmationPhrase,
    })
    assert.equal(result.remainingDocuments, 0)
    for (const collection of ['payments', 'activeVisits', 'visits', 'children', 'customers', 'canteenOrders', 'canteenInventoryMovements', 'events', 'eventBudgets']) {
      assert.equal(await count(collection), 0, `${collection} debe quedar vacia`)
    }
  })

  test('14 y 15. archivos asociados se clasifican y archivos no relacionados se conservan', async () => {
    await seedOperationalData()
    await db.collection('settings').doc('branding').set({ imageStoragePath: 'public/branding/logo.png' })
    const result = await resetOperationalTestDataSecure('admin', { mode: 'dryRun' })
    assert.ok(result.files.some((file) => file.storagePath === 'canteen-products/product-1.webp'))
    assert.equal(result.files.some((file) => file.storagePath === 'public/branding/logo.png'), false)
    assert.equal(result.files.some((file) => file.storagePath.startsWith('event-budgets/')), false)
  })

  test('16. no quedan referencias huerfanas operativas en colecciones limpiables', async () => {
    await seedOperationalData()
    await resetOperationalTestDataSecure('admin', {
      mode: 'execute',
      operationId: 'reset-orphans-test',
      confirmation: resetOperationalTestDataConfig.confirmationPhrase,
    })
    for (const collection of resetOperationalTestDataConfig.deleteCollections) {
      assert.equal(await count(collection), 0, `${collection} debe quedar vacia`)
    }
  })

  test('17. una repeticion con mismo operationId no duplica acciones', async () => {
    await seedOperationalData()
    const payload = {
      mode: 'execute',
      operationId: 'reset-idempotent-test',
      confirmation: resetOperationalTestDataConfig.confirmationPhrase,
    }
    const first = await resetOperationalTestDataSecure('admin', payload)
    const activityCount = await count('activityLogs')
    const second = await resetOperationalTestDataSecure('admin', payload)
    assert.deepEqual(second, first)
    assert.equal(await count('activityLogs'), activityCount)
  })

  test('18. fallo no informa exito', async () => {
    await seedOperationalData()
    await assert.rejects(() => resetOperationalTestDataSecure('admin', {
      mode: 'execute',
      operationId: 'reset-failure-test',
      confirmation: resetOperationalTestDataConfig.confirmationPhrase,
      simulateFailure: true,
    }), /se detuvo/i)
    const operations = await db.collection('secureOperations').where('operationId', '==', 'reset-failure-test').get()
    assert.equal(operations.docs[0].data().status, 'failed')
    assert.equal(await count('payments'), 1)
    assert.equal((await db.collection('systemFlags').doc('maintenance').get()).data()?.active, false)
  })

  test('19. mantenimiento bloquea operaciones normales', async () => {
    await db.collection('systemFlags').doc('maintenance').set({ active: true, reason: 'test' })
    await assert.rejects(() => createCanteenOrderSecure('admin', {
      type: 'free',
      accountName: 'Bloqueada',
      idempotencyKey: 'maintenance-test-key',
    }), /mantenimiento/i)
  })

  test('20. estado final muestra ceros', async () => {
    await seedOperationalData()
    await resetOperationalTestDataSecure('admin', {
      mode: 'execute',
      operationId: 'reset-final-zero-test',
      confirmation: resetOperationalTestDataConfig.confirmationPhrase,
    })
    const dryRun = await resetOperationalTestDataSecure('admin', { mode: 'dryRun' })
    assert.equal(dryRun.totalDocuments, 0)
  })
})

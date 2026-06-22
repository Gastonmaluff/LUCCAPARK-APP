import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, describe, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const projectId = 'demo-luccapark-rules'
let testEnv

const profiles = {
  admin: { uid: 'admin', displayName: 'Admin', email: 'admin@test.local', role: 'admin', isActive: true },
  socio: { uid: 'socio', displayName: 'Socio', email: 'socio@test.local', role: 'socio', isActive: true },
  eventos: { uid: 'eventos', displayName: 'Eventos', email: 'eventos@test.local', role: 'encargado_eventos', isActive: true },
  recepcion: { uid: 'recepcion', displayName: 'Recepción', email: 'recepcion@test.local', role: 'recepcion', isActive: true },
  cantina: { uid: 'cantina', displayName: 'Cantina', email: 'cantina@test.local', role: 'cantina', isActive: true },
  inactivo: { uid: 'inactivo', displayName: 'Inactivo', email: 'inactivo@test.local', role: 'recepcion', isActive: false },
  visualizacion: { uid: 'visualizacion', displayName: 'Visualización', email: 'visual@test.local', role: 'visualizacion', isActive: true },
}

const dbFor = (uid) => testEnv.authenticatedContext(uid, { email: `${uid}@test.local` }).firestore()
const anonymousDb = () => testEnv.unauthenticatedContext().firestore()

async function seedFixture() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all(Object.values(profiles).map((profile) => setDoc(doc(db, 'users', profile.uid), profile)))
    await Promise.all([
      setDoc(doc(db, 'customers', 'customer-1'), { name: 'Cliente', createdBy: 'recepcion' }),
      setDoc(doc(db, 'children', 'child-1'), { name: 'Niño', customerId: 'customer-1' }),
      setDoc(doc(db, 'visits', 'visit-1'), { childName: 'Niño', status: 'active' }),
      setDoc(doc(db, 'activeVisits', 'visit-1'), { childName: 'Niño', status: 'active' }),
      setDoc(doc(db, 'events', 'event-1'), { title: 'Evento', registeredGuestsCount: 0 }),
      setDoc(doc(db, 'eventGuests', 'guest-1'), { eventId: 'event-1', childName: 'Invitado' }),
      setDoc(doc(db, 'canteenProducts', 'product-1'), { name: 'Agua', stock: 10, updatedAt: new Date() }),
      setDoc(doc(db, 'canteenOrders', 'order-1'), { status: 'open', items: [], total: 0 }),
      setDoc(doc(db, 'payments', 'payment-1'), { source: 'canteen', totalPaid: 10000, createdBy: 'cantina' }),
      setDoc(doc(db, 'expenses', 'expense-1'), { amount: 5000, createdBy: 'eventos', eventId: 'event-1' }),
      setDoc(doc(db, 'financialClosures', 'closure-1'), { totalCollected: 10000 }),
      setDoc(doc(db, 'settings', 'settings-1'), { enabled: true }),
      setDoc(doc(db, 'landingContent', 'publicPage'), { title: 'Lucca Park' }),
      setDoc(doc(db, 'eventBudgets', 'budget-1'), { status: 'draft' }),
      setDoc(doc(db, 'activityLogs', 'log-1'), { userId: 'recepcion', description: 'Ingreso' }),
      setDoc(doc(db, 'tasks', 'task-1'), { assignedTo: 'recepcion', status: 'pending' }),
    ])
  })
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedFixture()
})

after(async () => {
  await testEnv.cleanup()
})

describe('sesión, perfil y estado activo', () => {
  test('usuario no autenticado solo puede leer contenido público', async () => {
    await assertSucceeds(getDoc(doc(anonymousDb(), 'landingContent', 'publicPage')))
    await assertFails(getDoc(doc(anonymousDb(), 'customers', 'customer-1')))
    await assertFails(setDoc(doc(anonymousDb(), 'customers', 'anonymous'), { name: 'Sin sesión' }))
  })

  test('usuario autenticado sin perfil no puede leer ni escribir datos administrativos', async () => {
    const db = dbFor('sin-perfil')
    await assertFails(getDoc(doc(db, 'customers', 'customer-1')))
    await assertFails(setDoc(doc(db, 'visits', 'sin-perfil'), { status: 'active' }))
  })

  test('usuario inactivo no puede leer ni escribir datos administrativos', async () => {
    const db = dbFor('inactivo')
    await assertFails(getDoc(doc(db, 'activeVisits', 'visit-1')))
    await assertFails(setDoc(doc(db, 'customers', 'inactivo'), { name: 'Bloqueado' }))
  })

  test('rol desconocido de visualización no recibe privilegios', async () => {
    const db = dbFor('visualizacion')
    await assertFails(getDoc(doc(db, 'events', 'event-1')))
    await assertFails(setDoc(doc(db, 'customers', 'visualizacion'), { name: 'Sin rol válido' }))
  })
})

describe('permisos de recepción', () => {
  test('recepción puede operar responsables, niños y visitas', async () => {
    const db = dbFor('recepcion')
    await assertSucceeds(setDoc(doc(db, 'customers', 'customer-r'), { name: 'Responsable' }))
    await assertSucceeds(setDoc(doc(db, 'children', 'child-r'), { name: 'Niño' }))
    await assertSucceeds(setDoc(doc(db, 'visits', 'visit-r'), { status: 'active' }))
    await assertSucceeds(setDoc(doc(db, 'activeVisits', 'visit-r'), { status: 'active' }))
    await assertSucceeds(getDoc(doc(db, 'events', 'event-1')))
  })

  test('recepción puede retirar la copia activa pero no borrar históricos', async () => {
    const db = dbFor('recepcion')
    await assertSucceeds(deleteDoc(doc(db, 'activeVisits', 'visit-1')))
    await assertFails(deleteDoc(doc(db, 'visits', 'visit-1')))
    await assertFails(deleteDoc(doc(db, 'customers', 'customer-1')))
    await assertFails(deleteDoc(doc(db, 'children', 'child-1')))
  })

  test('recepción no puede gestionar usuarios, finanzas, configuración o presupuestos', async () => {
    const db = dbFor('recepcion')
    await assertFails(updateDoc(doc(db, 'users', 'cantina'), { isActive: false }))
    await assertFails(getDoc(doc(db, 'financialClosures', 'closure-1')))
    await assertFails(setDoc(doc(db, 'settings', 'reception'), { enabled: false }))
    await assertFails(setDoc(doc(db, 'eventBudgets', 'budget-r'), { status: 'draft' }))
  })

  test('recepción puede crear pagos propios pero no leer el historial financiero', async () => {
    const db = dbFor('recepcion')
    await assertSucceeds(setDoc(doc(db, 'payments', 'payment-r'), { source: 'reception_exit', totalPaid: 60000, createdBy: 'recepcion' }))
    await assertFails(setDoc(doc(db, 'payments', 'payment-forged'), { source: 'reception_exit', totalPaid: 60000, createdBy: 'admin' }))
    await assertFails(getDoc(doc(db, 'payments', 'payment-1')))
  })
})

describe('borrado de visitas activas', () => {
  test('admin activo puede borrar activeVisits', async () => {
    await assertSucceeds(deleteDoc(doc(dbFor('admin'), 'activeVisits', 'visit-1')))
  })

  test('socio activo puede borrar activeVisits', async () => {
    await assertSucceeds(deleteDoc(doc(dbFor('socio'), 'activeVisits', 'visit-1')))
  })

  test('recepción activa puede borrar activeVisits', async () => {
    await assertSucceeds(deleteDoc(doc(dbFor('recepcion'), 'activeVisits', 'visit-1')))
  })

  test('cantina no puede borrar activeVisits', async () => {
    await assertFails(deleteDoc(doc(dbFor('cantina'), 'activeVisits', 'visit-1')))
  })

  test('encargado de eventos no puede borrar activeVisits', async () => {
    await assertFails(deleteDoc(doc(dbFor('eventos'), 'activeVisits', 'visit-1')))
  })

  test('usuario inactivo no puede borrar activeVisits', async () => {
    await assertFails(deleteDoc(doc(dbFor('inactivo'), 'activeVisits', 'visit-1')))
  })

  test('usuario autenticado sin perfil no puede borrar activeVisits', async () => {
    await assertFails(deleteDoc(doc(dbFor('sin-perfil'), 'activeVisits', 'visit-1')))
  })

  test('usuario con rol desconocido no puede borrar activeVisits', async () => {
    await assertFails(deleteDoc(doc(dbFor('visualizacion'), 'activeVisits', 'visit-1')))
  })

  test('usuario no autenticado no puede borrar activeVisits', async () => {
    await assertFails(deleteDoc(doc(anonymousDb(), 'activeVisits', 'visit-1')))
  })

  test('ningún usuario operativo puede borrar una visita histórica', async () => {
    for (const uid of ['socio', 'recepcion', 'cantina', 'eventos']) {
      await assertFails(deleteDoc(doc(dbFor(uid), 'visits', 'visit-1')))
    }
  })
})

describe('permisos de cantina', () => {
  test('cantina puede leer y operar cuentas, productos, visitas y eventos', async () => {
    const db = dbFor('cantina')
    await assertSucceeds(getDoc(doc(db, 'canteenProducts', 'product-1')))
    await assertSucceeds(getDoc(doc(db, 'activeVisits', 'visit-1')))
    await assertSucceeds(getDoc(doc(db, 'events', 'event-1')))
    await assertSucceeds(setDoc(doc(db, 'canteenOrders', 'order-c'), { status: 'open', items: [], total: 0 }))
    await assertSucceeds(setDoc(doc(db, 'payments', 'payment-c'), { source: 'canteen', totalPaid: 15000, createdBy: 'cantina' }))
  })

  test('cantina no puede modificar clientes, reservas, configuración o usuarios', async () => {
    const db = dbFor('cantina')
    await assertFails(setDoc(doc(db, 'customers', 'customer-c'), { name: 'No permitido' }))
    await assertFails(setDoc(doc(db, 'events', 'event-c'), { title: 'No permitido' }))
    await assertFails(setDoc(doc(db, 'settings', 'canteen'), { enabled: false }))
    await assertFails(updateDoc(doc(db, 'users', 'cantina'), { role: 'admin' }))
  })
})

describe('permisos de eventos y administración', () => {
  test('socio puede operar finanzas y configuración sin administrar usuarios', async () => {
    const db = dbFor('socio')
    await assertSucceeds(getDoc(doc(db, 'payments', 'payment-1')))
    await assertSucceeds(getDoc(doc(db, 'financialClosures', 'closure-1')))
    await assertSucceeds(setDoc(doc(db, 'settings', 'partner'), { enabled: true }))
    await assertFails(updateDoc(doc(db, 'users', 'cantina'), { isActive: false }))
  })

  test('encargado de eventos puede gestionar reservas, invitados, clientes y presupuestos', async () => {
    const db = dbFor('eventos')
    await assertSucceeds(setDoc(doc(db, 'customers', 'customer-e'), { name: 'Responsable evento' }))
    await assertSucceeds(setDoc(doc(db, 'children', 'child-e'), { name: 'Cumpleañero' }))
    await assertSucceeds(setDoc(doc(db, 'events', 'event-e'), { title: 'Cumpleaños', registeredGuestsCount: 0 }))
    await assertSucceeds(setDoc(doc(db, 'eventGuests', 'guest-e'), { eventId: 'event-e' }))
    await assertSucceeds(setDoc(doc(db, 'eventBudgets', 'budget-e'), { status: 'draft' }))
    await assertSucceeds(setDoc(doc(db, 'payments', 'payment-e'), { source: 'event_payment', totalPaid: 100000, createdBy: 'eventos' }))
  })

  test('encargado de eventos no puede crear pagos ajenos al evento ni tocar configuración', async () => {
    const db = dbFor('eventos')
    await assertFails(setDoc(doc(db, 'payments', 'payment-e-canteen'), { source: 'canteen', totalPaid: 10000, createdBy: 'eventos' }))
    await assertFails(setDoc(doc(db, 'settings', 'events'), { enabled: false }))
    await assertFails(setDoc(doc(db, 'financialClosures', 'closure-e'), { totalCollected: 0 }))
  })

  test('admin conserva acceso operativo y puede gestionar perfiles ajenos', async () => {
    const db = dbFor('admin')
    await assertSucceeds(setDoc(doc(db, 'customers', 'customer-a'), { name: 'Cliente admin' }))
    await assertSucceeds(setDoc(doc(db, 'events', 'event-a'), { title: 'Evento admin' }))
    await assertSucceeds(setDoc(doc(db, 'settings', 'admin'), { enabled: true }))
    await assertSucceeds(updateDoc(doc(db, 'users', 'recepcion'), {
      role: 'cantina',
      isActive: true,
      updatedAt: new Date(),
      updatedBy: 'admin',
      updatedByName: 'Admin',
    }))
  })

  test('admin no puede autoasignarse otro rol ni reactivar/desactivar su propia cuenta', async () => {
    const db = dbFor('admin')
    await assertFails(updateDoc(doc(db, 'users', 'admin'), { role: 'socio' }))
    await assertFails(updateDoc(doc(db, 'users', 'admin'), { isActive: false }))
    await assertSucceeds(updateDoc(doc(db, 'users', 'admin'), {
      displayName: 'Administrador principal',
      updatedAt: new Date(),
      updatedBy: 'admin',
      updatedByName: 'Admin',
    }))
  })

  test('ningún rol puede borrar históricos críticos', async () => {
    const adminDb = dbFor('admin')
    await assertFails(deleteDoc(doc(adminDb, 'users', 'cantina')))
    await assertFails(deleteDoc(doc(adminDb, 'visits', 'visit-1')))
    await assertFails(deleteDoc(doc(adminDb, 'events', 'event-1')))
    await assertFails(deleteDoc(doc(adminDb, 'payments', 'payment-1')))
    await assertFails(deleteDoc(doc(adminDb, 'activityLogs', 'log-1')))
  })

  test('historial solo acepta identidad propia y nunca puede editarse', async () => {
    const receptionDb = dbFor('recepcion')
    const adminDb = dbFor('admin')
    await assertSucceeds(setDoc(doc(receptionDb, 'activityLogs', 'log-r'), { userId: 'recepcion', description: 'Ingreso' }))
    await assertFails(setDoc(doc(receptionDb, 'activityLogs', 'log-falso'), { userId: 'admin', description: 'Falso' }))
    await assertFails(updateDoc(doc(adminDb, 'activityLogs', 'log-1'), { description: 'Editado' }))
  })
})

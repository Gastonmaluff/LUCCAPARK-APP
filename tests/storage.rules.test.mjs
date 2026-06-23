import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, describe, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'

const projectId = 'demo-luccapark-storage'
const bucket = `${projectId}.appspot.com`
let testEnv

const profiles = {
  admin: { uid: 'admin', role: 'admin', isActive: true },
  socio: { uid: 'socio', role: 'socio', isActive: true },
  eventos: { uid: 'eventos', role: 'encargado_eventos', isActive: true },
  recepcion: { uid: 'recepcion', role: 'recepcion', isActive: true },
  cantina: { uid: 'cantina', role: 'cantina', isActive: true },
  inactivo: { uid: 'inactivo', role: 'admin', isActive: false },
  invalido: { uid: 'invalido', role: 'visualizacion', isActive: true },
}

const storageFor = (uid) => testEnv.authenticatedContext(uid).storage(bucket)
const anonymousStorage = () => testEnv.unauthenticatedContext().storage(bucket)
const objectRef = (storage, path) => ref(storage, path)
const bytes = (size = 8) => new Uint8Array(size).fill(1)
const upload = (storage, path, contentType = 'image/png', size = 8) =>
  uploadBytes(objectRef(storage, path), bytes(size), { contentType })
const read = (storage, path) => getBytes(objectRef(storage, path))
const remove = (storage, path) => deleteObject(objectRef(storage, path))

async function seedProfiles() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(Object.values(profiles).map((profile) =>
      setDoc(doc(context.firestore(), 'users', profile.uid), profile),
    ))
  })
}

async function seedFiles() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(bucket)
    await Promise.all([
      upload(storage, 'public-page-images/hero/main.jpg', 'image/jpeg'),
      upload(storage, 'event-tv-images/event-1/tv.jpg', 'image/jpeg'),
      upload(storage, 'canteen-products/product-1/product.png'),
      upload(storage, 'expense-receipts/recepcion/receipt.pdf', 'application/pdf'),
      upload(storage, 'financial-closures/closure-1/closure.pdf', 'application/pdf'),
      upload(storage, 'backups/manual/backup.json', 'application/json'),
      upload(storage, 'decoration-images/deco-1/main.webp', 'image/webp'),
    ])
  })
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
    storage: { rules: await readFile('storage.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
  await seedProfiles()
  await seedFiles()
})

after(async () => {
  await testEnv.cleanup()
})

describe('sesion, perfil y recursos publicos', () => {
  test('lectura anonima solo funciona en pagina publica y TV', async () => {
    await assertSucceeds(read(anonymousStorage(), 'public-page-images/hero/main.jpg'))
    await assertSucceeds(read(anonymousStorage(), 'event-tv-images/event-1/tv.jpg'))
    await assertFails(read(anonymousStorage(), 'canteen-products/product-1/product.png'))
    await assertFails(read(anonymousStorage(), 'backups/manual/backup.json'))
  })

  test('usuario anonimo nunca puede escribir', async () => {
    await assertFails(upload(anonymousStorage(), 'public-page-images/hero/new.jpg', 'image/jpeg'))
    await assertFails(upload(anonymousStorage(), 'event-tv-images/event-1/new.jpg', 'image/jpeg'))
  })

  test('usuario sin perfil no puede escribir ni leer archivos privados', async () => {
    const storage = storageFor('sin-perfil')
    await assertFails(upload(storage, 'canteen-products/product-2/new.png'))
    await assertFails(read(storage, 'backups/manual/backup.json'))
  })

  test('usuario inactivo no conserva acceso privado ni escritura', async () => {
    const storage = storageFor('inactivo')
    await assertFails(read(storage, 'financial-closures/closure-1/closure.pdf'))
    await assertFails(upload(storage, 'public-page-images/hero/inactive.png'))
  })

  test('rol invalido no recibe permisos privados', async () => {
    const storage = storageFor('invalido')
    await assertFails(read(storage, 'canteen-products/product-1/product.png'))
    await assertFails(upload(storage, 'event-tv-images/event-1/invalid.png'))
  })

  test('rutas fuera del inventario se rechazan', async () => {
    await assertFails(upload(storageFor('admin'), 'private/arbitrary.exe', 'application/octet-stream'))
    await assertFails(upload(storageFor('admin'), 'public-page-images/other/file.png'))
  })
})

describe('backups y archivos financieros', () => {
  test('admin y socio activos pueden leer y crear backups JSON', async () => {
    for (const uid of ['admin', 'socio']) {
      const storage = storageFor(uid)
      await assertSucceeds(read(storage, 'backups/manual/backup.json'))
      await assertSucceeds(upload(storage, `backups/automatic/${uid}.json`, 'application/json'))
    }
  })

  test('roles operativos no acceden a backups', async () => {
    for (const uid of ['eventos', 'recepcion', 'cantina']) {
      const storage = storageFor(uid)
      await assertFails(read(storage, 'backups/manual/backup.json'))
      await assertFails(upload(storage, `backups/manual/${uid}.json`, 'application/json'))
    }
  })

  test('backup con tipo o ruta no autorizada se rechaza', async () => {
    await assertFails(upload(storageFor('admin'), 'backups/pre_restore/file.json', 'application/json'))
    await assertFails(upload(storageFor('admin'), 'backups/manual/nested/file.json', 'application/json'))
  })

  test('backup exige JSON y limita el tamano', async () => {
    const storage = storageFor('admin')
    await assertFails(upload(storage, 'backups/manual/not-json.txt', 'text/plain'))
    await assertFails(upload(storage, 'backups/manual/too-large.json', 'application/json', 50 * 1024 * 1024 + 1))
  })

  test('cierres financieros solo admiten admin y socio', async () => {
    await assertSucceeds(read(storageFor('admin'), 'financial-closures/closure-1/closure.pdf'))
    await assertSucceeds(upload(storageFor('socio'), 'financial-closures/closure-2/new.pdf', 'application/pdf'))
    for (const uid of ['eventos', 'recepcion', 'cantina']) {
      await assertFails(read(storageFor(uid), 'financial-closures/closure-1/closure.pdf'))
    }
  })

  test('cierre financiero exige PDF y limite de 10 MB', async () => {
    const storage = storageFor('admin')
    await assertFails(upload(storage, 'financial-closures/c-3/file.png', 'image/png'))
    await assertFails(upload(storage, 'financial-closures/c-3/large.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))
  })

  test('propietario activo y Finanzas pueden leer comprobantes', async () => {
    await assertSucceeds(read(storageFor('recepcion'), 'expense-receipts/recepcion/receipt.pdf'))
    await assertSucceeds(read(storageFor('admin'), 'expense-receipts/recepcion/receipt.pdf'))
    await assertSucceeds(read(storageFor('socio'), 'expense-receipts/recepcion/receipt.pdf'))
  })

  test('otros usuarios no pueden leer comprobantes ajenos', async () => {
    for (const uid of ['eventos', 'cantina']) {
      await assertFails(read(storageFor(uid), 'expense-receipts/recepcion/receipt.pdf'))
    }
  })

  test('un usuario activo solo carga comprobantes en su carpeta', async () => {
    const storage = storageFor('eventos')
    await assertSucceeds(upload(storage, 'expense-receipts/eventos/own.webp', 'image/webp'))
    await assertFails(upload(storage, 'expense-receipts/recepcion/forged.webp', 'image/webp'))
  })

  test('comprobante exige formato permitido y limite de 8 MB', async () => {
    const storage = storageFor('recepcion')
    await assertFails(upload(storage, 'expense-receipts/recepcion/file.svg', 'image/svg+xml'))
    await assertFails(upload(storage, 'expense-receipts/recepcion/large.pdf', 'application/pdf', 8 * 1024 * 1024 + 1))
  })
})

describe('imagenes de operacion y contenido', () => {
  test('solo admin y socio crean imagenes de productos', async () => {
    await assertSucceeds(upload(storageFor('admin'), 'canteen-products/p-admin/image.png'))
    await assertSucceeds(upload(storageFor('socio'), 'canteen-products/p-socio/image.webp', 'image/webp'))
    for (const uid of ['eventos', 'recepcion', 'cantina']) {
      await assertFails(upload(storageFor(uid), `canteen-products/p-${uid}/image.png`))
    }
  })

  test('todos los roles activos pueden leer imagenes de productos', async () => {
    for (const uid of ['admin', 'socio', 'eventos', 'recepcion', 'cantina']) {
      await assertSucceeds(read(storageFor(uid), 'canteen-products/product-1/product.png'))
    }
  })

  test('admin socio y eventos crean imagenes de TV', async () => {
    for (const uid of ['admin', 'socio', 'eventos']) {
      await assertSucceeds(upload(storageFor(uid), `event-tv-images/event-2/${uid}.jpg`, 'image/jpeg'))
    }
    await assertFails(upload(storageFor('recepcion'), 'event-tv-images/event-2/reception.jpg', 'image/jpeg'))
    await assertFails(upload(storageFor('cantina'), 'event-tv-images/event-2/canteen.jpg', 'image/jpeg'))
  })

  test('solo admin y socio crean contenido de pagina publica', async () => {
    await assertSucceeds(upload(storageFor('admin'), 'public-page-images/hero/admin.jpg', 'image/jpeg'))
    await assertSucceeds(upload(storageFor('socio'), 'public-page-images/installations/socio.webp', 'image/webp'))
    for (const uid of ['eventos', 'recepcion', 'cantina']) {
      await assertFails(upload(storageFor(uid), `public-page-images/hero/${uid}.jpg`, 'image/jpeg'))
    }
  })

  test('imagenes operativas exigen PNG JPEG o WEBP', async () => {
    await assertFails(upload(storageFor('admin'), 'canteen-products/p-2/file.svg', 'image/svg+xml'))
    await assertFails(upload(storageFor('eventos'), 'event-tv-images/e-2/file.gif', 'image/gif'))
    await assertFails(upload(storageFor('admin'), 'public-page-images/hero/file.exe', 'application/octet-stream'))
  })

  test('limites de imagen coinciden con cada flujo', async () => {
    await assertFails(upload(storageFor('admin'), 'canteen-products/p-3/large.png', 'image/png', 5 * 1024 * 1024 + 1))
    await assertFails(upload(storageFor('eventos'), 'event-tv-images/e-3/large.png', 'image/png', 5 * 1024 * 1024 + 1))
    await assertFails(upload(storageFor('admin'), 'public-page-images/hero/large.png', 'image/png', 8 * 1024 * 1024 + 1))
  })

  test('decoraciones son privadas para presupuestos de eventos', async () => {
    for (const uid of ['admin', 'socio', 'eventos']) {
      await assertSucceeds(read(storageFor(uid), 'decoration-images/deco-1/main.webp'))
    }
    await assertFails(read(storageFor('recepcion'), 'decoration-images/deco-1/main.webp'))
    await assertFails(read(storageFor('cantina'), 'decoration-images/deco-1/main.webp'))
    await assertFails(read(anonymousStorage(), 'decoration-images/deco-1/main.webp'))
  })

  test('solo admin y socio crean reemplazan y borran decoraciones', async () => {
    await assertSucceeds(upload(storageFor('admin'), 'decoration-images/deco-2/main.jpg', 'image/jpeg'))
    await assertSucceeds(upload(storageFor('socio'), 'decoration-images/deco-1/main.webp', 'image/webp'))
    await assertSucceeds(remove(storageFor('admin'), 'decoration-images/deco-1/main.webp'))
    await assertFails(upload(storageFor('eventos'), 'decoration-images/deco-3/main.png'))
    await assertFails(remove(storageFor('eventos'), 'decoration-images/deco-1/main.webp'))
  })
})

describe('actualizacion y borrado explicitos', () => {
  test('imagenes con nombres historicos siguen siendo legibles', async () => {
    await assertSucceeds(read(storageFor('admin'), 'canteen-products/product-1/product.png'))
    await assertSucceeds(read(anonymousStorage(), 'public-page-images/hero/main.jpg'))
  })

  test('archivos inmutables no pueden reemplazarse', async () => {
    await assertFails(upload(storageFor('admin'), 'backups/manual/backup.json', 'application/json'))
    await assertFails(upload(storageFor('admin'), 'financial-closures/closure-1/closure.pdf', 'application/pdf'))
    await assertFails(upload(storageFor('admin'), 'canteen-products/product-1/product.png'))
    await assertFails(upload(storageFor('admin'), 'public-page-images/hero/main.jpg', 'image/jpeg'))
  })

  test('delete solo esta habilitado para decoraciones administrables', async () => {
    await assertFails(remove(storageFor('admin'), 'backups/manual/backup.json'))
    await assertFails(remove(storageFor('admin'), 'financial-closures/closure-1/closure.pdf'))
    await assertFails(remove(storageFor('admin'), 'canteen-products/product-1/product.png'))
    await assertFails(remove(storageFor('admin'), 'public-page-images/hero/main.jpg'))
  })
})

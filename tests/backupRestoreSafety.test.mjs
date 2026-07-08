import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, describe, test } from 'node:test'
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const projectId = 'demo-luccapark-restore'
let testEnv
let backupServiceSource
let backupPanelSource
let adminLayoutSource
let storageRulesSource

before(async () => {
  const [firestoreRules, backupService, backupPanel, adminLayout, storageRules] = await Promise.all([
    readFile('firestore.rules', 'utf8'),
    readFile('src/services/backupService.ts', 'utf8'),
    readFile('src/components/settings/BackupSettingsPanel.tsx', 'utf8'),
    readFile('src/layouts/AdminLayout.tsx', 'utf8'),
    readFile('storage.rules', 'utf8'),
  ])
  backupServiceSource = backupService
  backupPanelSource = backupPanel
  adminLayoutSource = adminLayout
  storageRulesSource = storageRules
  testEnv = await initializeTestEnvironment({ projectId, firestore: { rules: firestoreRules } })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'admin'), {
      uid: 'admin', role: 'admin', isActive: true,
    })
  })
})

after(async () => {
  await testEnv.cleanup()
})

describe('restore JSON deshabilitado en el cliente', () => {
  test('el servicio no contiene escrituras por lotes de restauracion', () => {
    assert.equal(backupServiceSource.includes('writeBatch'), false)
    assert.equal(backupServiceSource.includes('batch.set('), false)
  })

  test('el servicio no construye rutas desde nombres de coleccion del archivo', () => {
    assert.equal(backupServiceSource.includes('doc(db, collectionName'), false)
    assert.equal(backupServiceSource.includes('Object.entries(backup.collections)'), false)
  })

  test('la API peligrosa restoreBackupJson ya no existe', () => {
    assert.equal(backupServiceSource.includes('restoreBackupJson'), false)
    assert.equal(backupServiceSource.includes('validateBackupJson'), false)
  })

  test('la interfaz no acepta archivos JSON para restaurar', () => {
    assert.equal(backupPanelSource.includes('accept="application/json,.json"'), false)
    assert.equal(backupPanelSource.includes('handleRestoreFile'), false)
  })

  test('la interfaz no ofrece un boton que ejecute la restauracion', () => {
    assert.equal(backupPanelSource.includes('onClick={handleRestore}'), false)
    assert.equal(backupPanelSource.includes("'Restaurar backup'"), false)
  })

  test('la interfaz explica la recuperacion mediante Scheduled Backups', () => {
    assert.match(backupPanelSource, /restauración completa es un procedimiento administrativo realizado mediante Firestore Scheduled Backups/i)
    assert.match(backupPanelSource, /no restaura Firebase Authentication ni los archivos físicos de Storage/i)
  })
})

describe('backup JSON automatico obsoleto deshabilitado', () => {
  test('iniciar sesion en el panel admin no dispara backup automatico', () => {
    assert.equal(adminLayoutSource.includes('runAutomaticBackupIfDue'), false)
    assert.equal(adminLayoutSource.includes('generateBackup'), false)
  })

  test('el servicio ya no expone ni ejecuta el backup automatico por uso', () => {
    assert.equal(backupServiceSource.includes('runAutomaticBackupIfDue'), false)
    assert.equal(backupServiceSource.includes("generateBackup('automatic')"), false)
    assert.equal(backupServiceSource.includes('backupLocks'), false)
  })

  test('el servicio no contiene llamadas directas a backups/automatic', () => {
    assert.equal(backupServiceSource.includes('backups/automatic'), false)
    assert.equal(adminLayoutSource.includes('backups/automatic'), false)
    assert.equal(backupPanelSource.includes('backups/automatic'), false)
  })

  test('la exportacion JSON manual sigue disponible', () => {
    assert.match(backupPanelSource, /Generar backup manual/)
    assert.match(backupPanelSource, /generateBackup\('manual'\)/)
    assert.match(backupServiceSource, /export const generateBackup = async \(type: ExportableBackupType\)/)
  })

  test('la seccion de Scheduled Backups sigue visible como mecanismo oficial', () => {
    assert.match(backupPanelSource, /Scheduled Backups activo/)
    assert.match(backupPanelSource, /consulta el estado nativo de Firestore Scheduled Backups/i)
    assert.match(backupPanelSource, /recuperación completa es un procedimiento administrativo/i)
  })

  test('la interfaz no muestra el antiguo estado automatico por uso, JSON heredado ni el error de Storage', () => {
    assert.equal(backupPanelSource.includes('Activo por uso del sistema'), false)
    assert.equal(backupPanelSource.includes('más de 12 horas'), false)
    assert.equal(backupPanelSource.includes('Último JSON automático anterior'), false)
    assert.equal(backupPanelSource.includes('storage/unauthorized'), false)
  })

  test('la interfaz consulta el estado nativo real desde una Function segura', () => {
    assert.match(backupPanelSource, /getNativeBackupStatus/)
    assert.match(backupPanelSource, /Último backup nativo/)
    assert.match(backupPanelSource, /Estado última copia/)
    assert.match(backupServiceSource, /getNativeBackupStatusSecure/)
  })
})

describe('reglas impiden revivir el restore directo', () => {
  test('ni un admin puede crear operaciones de restore desde el cliente', async () => {
    const db = testEnv.authenticatedContext('admin').firestore()
    await assertFails(setDoc(doc(db, 'restoreOperations', 'operation-1'), { status: 'restoring' }))
  })

  test('ni un admin puede escribir una coleccion arbitraria desde el cliente', async () => {
    const db = testEnv.authenticatedContext('admin').firestore()
    await assertFails(setDoc(doc(db, 'collection-from-json', 'document-1'), { injected: true }))
  })

  test('Storage no admite cargas temporales de restore desde el cliente', () => {
    assert.equal(storageRulesSource.includes('match /restore-uploads/'), false)
    assert.match(storageRulesSource, /match \/\{allPaths=\*\*\}[\s\S]*allow read, write: if false;/)
  })
})

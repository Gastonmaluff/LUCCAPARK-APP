import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, describe, test } from 'node:test'
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const projectId = 'demo-luccapark-restore'
let testEnv
let backupServiceSource
let backupPanelSource
let storageRulesSource

before(async () => {
  const [firestoreRules, backupService, backupPanel, storageRules] = await Promise.all([
    readFile('firestore.rules', 'utf8'),
    readFile('src/services/backupService.ts', 'utf8'),
    readFile('src/components/settings/BackupSettingsPanel.tsx', 'utf8'),
    readFile('storage.rules', 'utf8'),
  ])
  backupServiceSource = backupService
  backupPanelSource = backupPanel
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

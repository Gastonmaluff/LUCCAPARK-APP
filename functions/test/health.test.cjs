const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { describe, test } = require('node:test')

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-luccapark-health'
process.env.FUNCTIONS_EMULATOR = process.env.FUNCTIONS_EMULATOR || 'true'

const { buildHealthReport } = require('../lib/health')

const ok = async () => undefined
const fail = (message) => async () => {
  throw new Error(message)
}
const options = {
  checkedAt: () => '2026-07-11T12:00:00.000Z',
  version: 'test-version',
}

describe('health report', () => {
  test('rewrite publico precede al fallback SPA y mantiene region real', () => {
    const firebaseConfig = JSON.parse(readFileSync(resolve(__dirname, '../../firebase.json'), 'utf8'))
    const [healthRewrite, spaRewrite] = firebaseConfig.hosting.rewrites
    assert.deepEqual(healthRewrite, {
      source: '/api/health',
      function: { functionId: 'healthCheck', region: 'southamerica-east1' },
    })
    assert.deepEqual(spaRewrite, { source: '**', destination: '/index.html' })
  })

  test('todos los componentes correctos devuelven ok', async () => {
    const report = await buildHealthReport({ database: ok, authentication: ok, storage: ok }, options)
    assert.equal(report.status, 'ok')
    assert.equal(report.database.status, 'ok')
    assert.equal(report.authentication.status, 'ok')
    assert.equal(report.functions.status, 'ok')
    assert.equal(report.storage.status, 'ok')
    assert.equal(report.version, 'test-version')
    assert.equal(report.checkedAt, '2026-07-11T12:00:00.000Z')
  })

  test('error de Firestore marca error general', async () => {
    const report = await buildHealthReport({
      database: fail('private firestore details'),
      authentication: ok,
      storage: ok,
    }, options)
    assert.equal(report.status, 'error')
    assert.deepEqual(report.database.errorCode, 'DATABASE_UNAVAILABLE')
  })

  test('error de Authentication marca error general', async () => {
    const report = await buildHealthReport({
      database: ok,
      authentication: fail('private auth details'),
      storage: ok,
    }, options)
    assert.equal(report.status, 'error')
    assert.equal(report.authentication.errorCode, 'AUTHENTICATION_UNAVAILABLE')
  })

  test('error de Storage conserva respuesta parcial y marca warn', async () => {
    const report = await buildHealthReport({
      database: ok,
      authentication: ok,
      storage: fail('private storage details'),
    }, options)
    assert.equal(report.status, 'warn')
    assert.equal(report.database.status, 'ok')
    assert.equal(report.authentication.status, 'ok')
    assert.equal(report.storage.errorCode, 'STORAGE_UNAVAILABLE')
  })

  test('componente no utilizado se omite completamente', async () => {
    const report = await buildHealthReport({ database: ok, authentication: ok }, options)
    assert.equal(report.status, 'ok')
    assert.equal(Object.hasOwn(report, 'storage'), false)
  })

  test('timeout se informa sin exponer detalles internos', async () => {
    const report = await buildHealthReport({
      database: () => new Promise(() => undefined),
      authentication: ok,
    }, { ...options, timeoutMs: 5 })
    assert.equal(report.status, 'error')
    assert.equal(report.database.errorCode, 'DATABASE_TIMEOUT')
  })

  test('los errores publicos quedan sanitizados', async () => {
    const secret = 'token-super-secreto@example.com'
    const report = await buildHealthReport({
      database: fail(secret),
      authentication: fail(secret),
      storage: fail(secret),
    }, options)
    const publicBody = JSON.stringify(report)
    assert.equal(publicBody.includes(secret), false)
    assert.equal(publicBody.includes('stack'), false)
    assert.equal(publicBody.includes('message'), false)
  })
})

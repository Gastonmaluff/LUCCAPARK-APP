import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('rol recepcion solo navega a recepcion y cantina dentro del admin', () => {
  const accessControl = read('src/auth/accessControl.ts')
  const adminLayout = read('src/layouts/AdminLayout.tsx')
  const protectedRoute = read('src/components/ProtectedRoute.tsx')

  assert.match(accessControl, /recepcion:\s*\['reception', 'canteen'\]/)
  assert.doesNotMatch(accessControl, /recepcion:\s*\[[^\]]*'clients'/)
  assert.match(accessControl, /\{ module: 'clients', prefix: '\/admin\/clientes' \}/)
  assert.match(protectedRoute, /canAccessPath\(profile\.role, location\.pathname\)/)
  assert.match(adminLayout, /visibleNavItems = profile \? adminNavItems\.filter\(\(item\) => canAccessAdminModule\(profile\.role, item\.module\)\) : \[\]/)
  assert.match(protectedRoute, /<AccessDenied[\s\S]*homeTo=\{getDefaultRouteForRole\(profile\.role\)\}/)
})

test('recepcion conserva operaciones minimas de clientes y ninos desde recepcion', () => {
  const rules = read('firestore.rules')
  const visitForm = read('src/components/reception/VisitForm.tsx')
  const visitService = read('src/services/visitService.ts')

  assert.match(rules, /function canManageClients\(\) \{[\s\S]*isReception\(\)/)
  assert.match(rules, /match \/customers\/\{customerId\} \{[\s\S]*allow read, create, update: if canManageClients\(\)/)
  assert.match(rules, /match \/children\/\{childId\} \{[\s\S]*allow read, create, update: if canManageClients\(\)/)
  assert.match(visitForm, /findResponsibleByDocument\(responsibleForm\.customerDocumentNumber\)/)
  assert.match(visitService, /query\(getCollectionRef\('customers'\), where\('documentNumberNormalized'/)
})

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

test('plan libre ingresa sin monto inicial y se cobra al finalizar', () => {
  const functionsVisits = read('functions/src/visits.ts')
  const visitForm = read('src/components/reception/VisitForm.tsx')
  const checkoutModal = read('src/components/reception/ConsolidatedCheckoutModal.tsx')
  const groupCheckoutModal = read('src/components/reception/ConsolidatedGroupCheckoutModal.tsx')

  assert.doesNotMatch(functionsVisits, /requiere un importe autorizado por Administracion/)
  assert.match(functionsVisits, /El plan libre se cobra y confirma al finalizar la visita/)
  assert.match(functionsVisits, /settings'\)\.doc\('visitPricing'\)/)
  assert.match(functionsVisits, /billableHoursForUnlimited/)
  assert.match(functionsVisits, /Math\.max\(1, Math\.floor\(elapsedMinutes \/ 60\)\)/)
  assert.match(functionsVisits, /unlimitedPricing:\s*\{/)
  assert.match(visitForm, /El importe se calculara y confirmara al finalizar la visita/)
  assert.match(visitForm, /paymentStatus: isUnlimitedPlan \? 'payAtExit'/)
  assert.match(checkoutModal, /Monto final a cobrar/)
  assert.match(checkoutModal, /Motivo del ajuste/)
  assert.match(groupCheckoutModal, /pendingUnlimitedVisits/)
  assert.match(groupCheckoutModal, /Cantina compartida/)
})

test('descuentos temporizados usan seccion colapsable y backend seguro', () => {
  const visitForm = read('src/components/reception/VisitForm.tsx')
  const functionsVisits = read('functions/src/visits.ts')
  const rules = read('firestore.rules')

  assert.match(visitForm, /Aplicar descuento o monto especial/)
  assert.match(visitForm, /isPromotionOpen:\s*false/)
  assert.match(visitForm, /Cancelar ajuste/)
  assert.match(visitForm, /promotionType:\s*'percentage'/)
  assert.match(visitForm, /promotionalAdjustment/)
  assert.doesNotMatch(visitForm, /Usar monto diferente/)
  assert.match(functionsVisits, /resolvePromotionalAdjustment/)
  assert.match(functionsVisits, /El motivo del descuento/)
  assert.match(functionsVisits, /finalAmount >= originalAmount/)
  assert.match(functionsVisits, /sourceIntegrity:\s*'secure_backend'/)
  assert.match(rules, /promotionalAdjustment/)
  assert.match(rules, /promotionAdjustment/)
})

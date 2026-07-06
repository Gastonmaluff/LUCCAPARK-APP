import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('admin tv tiene ruta protegida propia y roles autorizados', () => {
  const app = read('src/App.tsx')
  const accessControl = read('src/auth/accessControl.ts')

  assert.match(app, /<Route path="admin\/tv" element=\{<TVPage \/>\} \/>/)
  assert.match(app, /<Route path="tv" element=\{<TVPage \/>\} \/>/)
  assert.match(accessControl, /const tvViewerRoles: UserRole\[\] = \['admin', 'socio', 'recepcion'\]/)
  assert.match(accessControl, /pathname === '\/admin\/tv' \|\| pathname\.startsWith\('\/admin\/tv\/'\)/)
  assert.match(accessControl, /pathname === '\/tv' \|\| pathname\.startsWith\('\/tv\/'\)/)
  assert.match(accessControl, /export const canAccessTv = \(role: UserRole\) => tvViewerRoles\.includes\(role\)/)
  assert.doesNotMatch(accessControl, /const tvViewerRoles[^\n]*'cantina'/)
  assert.doesNotMatch(accessControl, /const tvViewerRoles[^\n]*'encargado_eventos'/)
})

test('recepcion mantiene clientes bloqueado aunque tenga tv', () => {
  const accessControl = read('src/auth/accessControl.ts')

  assert.match(accessControl, /recepcion:\s*\['reception', 'canteen'\]/)
  assert.doesNotMatch(accessControl, /recepcion:\s*\[[^\]]*'clients'/)
  assert.match(accessControl, /\{ module: 'clients', prefix: '\/admin\/clientes' \}/)
})

test('protector espera perfil vigente y no reutiliza rol anterior', () => {
  const protectedRoute = read('src/components/ProtectedRoute.tsx')
  const profileHook = read('src/hooks/useUserProfile.ts')

  assert.doesNotMatch(protectedRoute, /useAuthUser\(/)
  assert.match(protectedRoute, /const \{ isCheckingAuth, isLoadingProfile, profile, profileError, profileStatus, user \} = useUserProfile\(\)/)
  assert.match(protectedRoute, /isCheckingAuth \|\| \(user && isLoadingProfile\)/)
  assert.match(profileHook, /profileBelongsToCurrentUser = Boolean\(user && profile\?\.uid === user\.uid\)/)
  assert.match(profileHook, /currentProfile = profileBelongsToCurrentUser \? profile : null/)
  assert.match(profileHook, /currentProfileStatus: UserProfileStatus =[\s\S]*'loading' : profileStatus/)
})

test('tv es solo lectura y mantiene libre sin vencimiento', () => {
  const tvPage = read('src/pages/TVPage.tsx')
  const activeVisits = read('src/hooks/useActiveVisits.ts')

  assert.match(activeVisits, /onSnapshot\(/)
  assert.match(activeVisits, /query\(getCollectionRef\('activeVisits'\), where\('status', '==', 'active'\)\)/)
  assert.doesNotMatch(tvPage, /setDoc|updateDoc|deleteDoc|addDoc|runTransaction|callSecureFunction/)
  assert.doesNotMatch(tvPage, /Registrar ingreso|Cerrar visita|Extender|Cobrar/)
  assert.match(tvPage, /return 'LIBRE'/)
  assert.match(tvPage, /if \(remainingMs === null\) \{[\s\S]*return ''/)
  assert.match(tvPage, /motionState === 'time-expired'/)
})

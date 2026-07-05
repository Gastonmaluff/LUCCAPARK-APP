import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('plan libre usa modelo ilimitado real y no duracion cero', () => {
  const timePlans = read('src/config/timePlans.ts')

  assert.match(timePlans, /id:\s*'unlimited'[\s\S]*durationMinutes:\s*null/)
  assert.match(timePlans, /id:\s*'unlimited'[\s\S]*isUnlimited:\s*true/)
  assert.doesNotMatch(timePlans, /id:\s*'unlimited'[\s\S]*durationMinutes:\s*0/)
})

test('recepcion muestra plan libre como contador ascendente con fallback claro', () => {
  const visitTime = read('src/utils/visitTime.ts')
  const visitCard = read('src/components/reception/VisitCard.tsx')
  const visitGroupCard = read('src/components/reception/VisitGroupCard.tsx')
  const activeVisitsHook = read('src/hooks/useActiveVisits.ts')

  assert.match(visitTime, /export const formatElapsedTime/)
  assert.match(visitTime, /missingVisitStartTimeLabel = 'Hora de ingreso no disponible'/)
  assert.match(visitTime, /Math\.max\(0,\s*now\.getTime\(\) - startedAt\.getTime\(\)\)/)
  assert.match(activeVisitsHook, /startedAt:\s*dateFromTimestamp\(data\.startedAt\) \?\? new Date\(Number\.NaN\)/)
  assert.match(visitCard, /status === 'unlimited'[\s\S]*formatElapsedTime\(visit\.startedAt,\s*now\)/)
  assert.match(visitGroupCard, /status === 'unlimited'[\s\S]*formatElapsedTime\(visit\.startedAt,\s*now\)/)
  assert.doesNotMatch(visitCard, /detail:\s*'Sin límite'/)
  assert.doesNotMatch(visitGroupCard, /detail:\s*'Sin límite'/)
})

test('plan libre no ofrece ni permite extension de tiempo', () => {
  const visitCard = read('src/components/reception/VisitCard.tsx')
  const visitGroupCard = read('src/components/reception/VisitGroupCard.tsx')
  const visitService = read('src/services/visitService.ts')

  assert.match(visitCard, /const canExtendTime = !visit\.isUnlimited/)
  assert.match(visitGroupCard, /const canExtendVisits = visits\.filter\(\(visit\) => !visit\.isUnlimited\)/)
  assert.match(visitGroupCard, /visits\.filter\(\(visit\) => selectedVisitIds\.includes\(visit\.id\) && !visit\.isUnlimited\)/)
  assert.match(visitService, /if \(visit\.isUnlimited\) \{[\s\S]*El plan libre no se puede extender\./)
})

test('tv muestra LIBRE sin reloj numerico para ilimitados y mantiene orden estable', () => {
  const tvPage = read('src/pages/TVPage.tsx')

  assert.match(tvPage, /if \(remainingMs === null\) \{[\s\S]*return 'LIBRE'/)
  assert.doesNotMatch(tvPage, /return '--'/)
  assert.match(tvPage, /const TimeIcon = timeStatus === 'unlimited' \? InfinityIcon : Clock3/)
  assert.match(tvPage, /Number\.MAX_SAFE_INTEGER/)
  assert.match(tvPage, /a\.childName\.localeCompare\(b\.childName,\s*'es'\)/)
})

test('logout global se renderiza una vez desde layout admin y redirige al login', () => {
  const layout = read('src/layouts/AdminLayout.tsx')
  const sessionActions = read('src/components/AdminSessionActions.tsx')
  const settings = read('src/pages/admin/AdminSettingsPage.tsx')

  assert.match(layout, /<AdminSessionActions profile=\{profile\} profileStatus=\{profileStatus\} user=\{user\} \/>/)
  assert.match(sessionActions, /await signOut\(auth\)/)
  assert.match(sessionActions, /navigate\('\/login', \{ replace: true \}\)/)
  assert.match(sessionActions, /aria-label="Cerrar sesion"/)
  assert.match(sessionActions, /isSigningOut \? 'Cerrando\.\.\.' : 'Cerrar sesion'/)
  assert.doesNotMatch(settings, /signOut\(auth\)/)
  assert.doesNotMatch(settings, /Salir del sistema/)
})

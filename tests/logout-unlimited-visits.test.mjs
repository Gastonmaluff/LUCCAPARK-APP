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

test('cuenta admin se muestra como icono compacto sin tarjeta permanente', () => {
  const layout = read('src/layouts/AdminLayout.tsx')
  const sessionActions = read('src/components/AdminSessionActions.tsx')
  const styles = read('src/index.css')

  assert.match(layout, /<AdminSessionActions profile=\{profile\} profileStatus=\{profileStatus\} user=\{user\} \/>/)
  assert.match(sessionActions, /aria-label="Cuenta y cerrar sesión"/)
  assert.match(sessionActions, /title="Cuenta y cerrar sesión"/)
  assert.match(sessionActions, /className="admin-account-trigger"/)
  assert.match(sessionActions, /<LogOut size=\{19\}/)
  assert.doesNotMatch(sessionActions, /admin-session-card/)
  assert.doesNotMatch(sessionActions, /admin-logout-button/)
  assert.doesNotMatch(styles, /\.admin-session-card/)
  assert.doesNotMatch(styles, /\.admin-logout-button/)
})

test('modal de cuenta muestra datos y concentra el cierre de sesion', () => {
  const sessionActions = read('src/components/AdminSessionActions.tsx')
  const settings = read('src/pages/admin/AdminSettingsPage.tsx')

  assert.match(sessionActions, /const \[isAccountOpen, setIsAccountOpen\] = useState\(false\)/)
  assert.match(sessionActions, /const openAccountModal = \(\) => \{[\s\S]*setIsAccountOpen\(true\)/)
  assert.match(sessionActions, /role="dialog"/)
  assert.match(sessionActions, /aria-modal="true"/)
  assert.match(sessionActions, /account-modal-avatar[\s\S]*currentSessionName\.slice\(0, 1\)/)
  assert.match(sessionActions, /\{currentSessionName\}/)
  assert.match(sessionActions, /\{currentSessionEmail\}/)
  assert.match(sessionActions, /\{currentSessionRole\}/)
  assert.match(sessionActions, /\{currentSessionStatus\}/)
  assert.match(sessionActions, /className="button danger account-modal-signout"/)
  assert.match(sessionActions, /await signOut\(auth\)/)
  assert.match(sessionActions, /setIsAccountOpen\(false\)[\s\S]*navigate\('\/login', \{ replace: true \}\)/)
  assert.match(sessionActions, /navigate\('\/login', \{ replace: true \}\)/)
  assert.match(sessionActions, /isSigningOut \? 'Cerrando sesión\.\.\.' : 'Cerrar sesión'/)
  assert.doesNotMatch(settings, /signOut\(auth\)/)
  assert.doesNotMatch(settings, /Salir del sistema/)
})

test('modal de cuenta cierra sin ejecutar logout y soporta responsive', () => {
  const sessionActions = read('src/components/AdminSessionActions.tsx')
  const styles = read('src/index.css')
  const openModalBlock = sessionActions.slice(
    sessionActions.indexOf('const openAccountModal'),
    sessionActions.indexOf('const closeAccountModal'),
  )

  assert.doesNotMatch(openModalBlock, /signOut/)
  assert.match(sessionActions, /event\.key === 'Escape' && !isSigningOut[\s\S]*setIsAccountOpen\(false\)/)
  assert.match(sessionActions, /event\.target === event\.currentTarget && closeAccountModal\(\)/)
  assert.match(sessionActions, /closeButtonRef\.current\?\.focus\(\)/)
  assert.match(styles, /\.account-modal-backdrop/)
  assert.match(styles, /\.account-modal/)
  assert.match(styles, /max-width:\s*calc\(100vw - 32px\)/)
  assert.match(styles, /width:\s*min\(100%, 360px\)/)
})

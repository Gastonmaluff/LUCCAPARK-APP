import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const cssBlock = (source, selector) => {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `No se encontro ${selector}`)
  const end = source.indexOf('\n}', start)
  assert.notEqual(end, -1, `No se cerro ${selector}`)
  return source.slice(start, end)
}

test('ajustes operativos exponen precios configurables de extension con defaults', () => {
  const service = read('src/services/visitPricingService.ts')
  const settings = read('src/pages/admin/AdminSettingsPage.tsx')

  assert.match(service, /DEFAULT_EXTENSION_30_MINUTE_PRICE = 30000/)
  assert.match(service, /DEFAULT_EXTENSION_60_MINUTE_PRICE = 60000/)
  assert.match(service, /extension30MinutePrice/)
  assert.match(service, /extension60MinutePrice/)
  assert.match(service, /saveExtensionPriceSettings/)
  assert.match(settings, /Precio de extensión por 30 minutos/)
  assert.match(settings, /Precio de extensión por 60 minutos/)

  const unlimitedIndex = settings.indexOf('Tarifa por hora del plan libre')
  const babyIndex = settings.indexOf('Edad máxima para entrada gratuita de bebés')
  const extension30Index = settings.indexOf('Precio de extensión por 30 minutos')
  const extension60Index = settings.indexOf('Precio de extensión por 60 minutos')
  assert.ok(unlimitedIndex < babyIndex)
  assert.ok(babyIndex < extension30Index)
  assert.ok(extension30Index < extension60Index)
})

test('validacion de precios rechaza vacios, cero, negativos y decimales', () => {
  const service = read('src/services/visitPricingService.ts')
  const settings = read('src/pages/admin/AdminSettingsPage.tsx')

  assert.match(settings, /parseGuaraniDraft\(extension30Price/)
  assert.match(settings, /parseGuaraniDraft\(extension60Price/)
  assert.match(settings, /\^\\d\+\$/)
  assert.match(settings, /amount <= 0/)
  assert.match(service, /Number\.isSafeInteger\(config\.extension30MinutePrice\)/)
  assert.match(service, /config\.extension30MinutePrice <= 0/)
  assert.match(service, /Number\.isSafeInteger\(config\.extension60MinutePrice\)/)
  assert.match(service, /config\.extension60MinutePrice <= 0/)
})

test('modal de extension usa configuracion y no precios hardcodeados', () => {
  const visitCard = read('src/components/reception/VisitCard.tsx')
  const visitGroupCard = read('src/components/reception/VisitGroupCard.tsx')
  const visitService = read('src/services/visitService.ts')

  assert.match(visitCard, /useVisitPricing/)
  assert.match(visitCard, /extension30Price = pricing\.config\.extension30MinutePrice/)
  assert.match(visitCard, /extension60Price = pricing\.config\.extension60MinutePrice/)
  assert.doesNotMatch(visitCard, /formatGuarani\(30000\)/)
  assert.doesNotMatch(visitCard, /formatGuarani\(60000\)/)
  assert.match(visitGroupCard, /useVisitPricing/)
  assert.match(visitGroupCard, /selectedVisits\.length \* extension30Price/)
  assert.match(visitGroupCard, /selectedVisits\.length \* extension60Price/)
  assert.doesNotMatch(visitGroupCard, /formatGuarani\(30000\)/)
  assert.doesNotMatch(visitGroupCard, /formatGuarani\(60000\)/)
  assert.match(visitService, /if \(visit\.isUnlimited\)/)
})

test('backend lee precio configurado y conserva snapshot historico', () => {
  const visits = read('functions/src/visits.ts')
  const types = read('src/types.ts')

  assert.match(visits, /readExtensionPrice\(transaction, minutes\)/)
  assert.match(visits, /extension30MinutePrice/)
  assert.match(visits, /extension60MinutePrice/)
  assert.match(visits, /positiveMoney\(extension\.amount/)
  assert.match(visits, /pricingSnapshot:\s*\{/)
  assert.match(visits, /source:\s*'settings\/visitPricing'/)
  assert.match(types, /pricingSnapshot\?:\s*\{/)
})

test('cards operativas usan acciones compactas y espaciado estructural', () => {
  const settings = read('src/pages/admin/AdminSettingsPage.tsx')
  const styles = read('src/index.css')
  const stackBlock = cssBlock(styles, '.settings-panel-stack')
  const activityBlock = cssBlock(styles, '.settings-activity-panel')

  assert.match(settings, /settings-panel-stack/)
  assert.match(stackBlock, /gap:\s*18px/)
  assert.match(activityBlock, /gap:\s*16px/)
  assert.doesNotMatch(activityBlock, /margin-top:\s*18px/)
  assert.match(settings, /OperationalSettingCard/)
  assert.match(settings, /compact-save-button/)
  assert.match(styles, /\.compact-save-button\s*\{[\s\S]*?width:\s*auto/)
  assert.match(styles, /@media[\s\S]*\.compact-save-button\s*\{[\s\S]*width:\s*100%/)
  assert.match(styles, /\.operational-setting-fields\.two-columns/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('reportes ordena oportunidades e inicia secciones con el estado requerido', () => {
  const reports = read('src/pages/admin/AdminReportsPage.tsx')

  assert.match(reports, /const \[birthdaysOpen, setBirthdaysOpen\] = useState\(false\)/)
  assert.match(reports, /const \[receptionVisitsOpen, setReceptionVisitsOpen\] = useState\(true\)/)
  assert.match(reports, /const \[frequentOpen, setFrequentOpen\] = useState\(false\)/)
  assert.match(reports, /const \[reactivateOpen, setReactivateOpen\] = useState\(false\)/)

  const opportunitiesSection = reports.slice(reports.lastIndexOf('Oportunidades comerciales'))
  const birthdaysIndex = opportunitiesSection.indexOf('Próximos cumpleaños')
  const receptionIndex = opportunitiesSection.indexOf('<ReceptionVisitHistorySection')
  const frequentIndex = opportunitiesSection.indexOf('Clientes más frecuentes')
  const reactivateIndex = opportunitiesSection.indexOf('Clientes para reactivar')

  assert.ok(birthdaysIndex !== -1)
  assert.ok(receptionIndex > birthdaysIndex)
  assert.ok(frequentIndex > receptionIndex)
  assert.ok(reactivateIndex > frequentIndex)
})

test('historial de ingresos consulta visits por rango diario de America/Asuncion', () => {
  const reports = read('src/pages/admin/AdminReportsPage.tsx')
  const dateUtils = read('src/utils/date.ts')

  assert.match(dateUtils, /ASUNCION_TIME_ZONE = 'America\/Asuncion'/)
  assert.match(dateUtils, /getAsuncionDayRange/)
  assert.match(dateUtils, /asuncionDateTimeToUtc/)
  assert.match(reports, /getCollectionRef\('visits'\)/)
  assert.match(reports, /where\('startedAt', '>=', Timestamp\.fromDate\(start\)\)/)
  assert.match(reports, /where\('startedAt', '<', Timestamp\.fromDate\(end\)\)/)
  assert.match(reports, /orderBy\('startedAt', 'desc'\)/)
  assert.match(reports, /limit\(RECEPTION_VISIT_HISTORY_LIMIT\)/)
  assert.match(reports, /RECEPTION_VISIT_HISTORY_LIMIT = 150/)
})

test('historial de ingresos implementa filtros, busqueda y estados de resultado', () => {
  const reports = read('src/pages/admin/AdminReportsPage.tsx')

  assert.match(reports, /\['today', 'Hoy'\]/)
  assert.match(reports, /\['yesterday', 'Ayer'\]/)
  assert.match(reports, /\['custom', 'Elegir fecha'\]/)
  assert.match(reports, /<ReceptionVisitDatePicker/)
  assert.match(reports, /placeholder="Buscar niño o responsable"/)
  assert.match(reports, /visit\.childName/)
  assert.match(reports, /visit\.customerName/)
  assert.match(reports, /visit\.customerDocumentNumber/)
  assert.match(reports, /visit\.customerPhone/)
  assert.match(reports, /Cargando ingresos\.\.\./)
  assert.match(reports, /No se registraron ingresos en esta fecha/)
  assert.match(reports, /Reintentar/)
})

test('calendario inteligente distingue dias con y sin ingresos', () => {
  const reports = read('src/pages/admin/AdminReportsPage.tsx')
  const styles = read('src/index.css')

  assert.match(reports, /const visitCounts = useMemo/)
  assert.match(reports, /getAsuncionDateKey\(visit\.startedAt\)/)
  assert.match(reports, /count > 0 \? 'has-visits' : 'without-visits'/)
  assert.match(reports, /Con ingresos/)
  assert.match(reports, /Sin ingresos/)
  assert.match(styles, /\.smart-date-calendar-day\.has-visits\s*\{[\s\S]*background:\s*#eaf7df/)
  assert.match(styles, /\.smart-date-calendar-day\s*\{[\s\S]*background:\s*#f8fafc/)
})

test('calendario inteligente permite navegar, seleccionar y usarlo con teclado', () => {
  const reports = read('src/pages/admin/AdminReportsPage.tsx')

  assert.match(reports, /aria-label="Mes anterior"/)
  assert.match(reports, /aria-label="Mes siguiente"/)
  assert.match(reports, /role="dialog"/)
  assert.match(reports, /event\.key === 'Escape'/)
  assert.match(reports, /aria-pressed=\{isSelected\}/)
  assert.match(reports, /onClick=\{\(\) => selectDate\(dateKeyValue\)\}/)
})

test('historial de ingresos muestra datos, estados y planes especiales sin inventar datos', () => {
  const reports = read('src/pages/admin/AdminReportsPage.tsx')

  assert.match(reports, /Dentro del parque/)
  assert.match(reports, /Finalizado/)
  assert.match(reports, /Cancelado/)
  assert.match(reports, /if \(visit\.isBaby\) return 'Bebé'/)
  assert.match(reports, /if \(visit\.isUnlimited\) return 'Libre'/)
  assert.match(reports, /if \(visit\.planId === 'one-hour'\) return '1 hora'/)
  assert.match(reports, /if \(visit\.planId === 'two-hours'\) return '2 horas'/)
  assert.match(reports, /Ingreso: \{formatAsuncionTime\(visit\.startedAt\)\}/)
  assert.match(reports, /Salida: \{visit\.endedAt \? formatAsuncionTime\(visit\.endedAt\) : 'Sin salida'\}/)
  assert.match(reports, /Monto a definir/)
  assert.match(reports, /Saldo pendiente/)
})

test('historial de ingresos agrega estilos responsive sin tabla horizontal', () => {
  const styles = read('src/index.css')

  assert.match(styles, /\.reception-visit-history-toolbar\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(220px, 1fr\)\)/)
  assert.match(styles, /\.input-with-icon\s*\{[\s\S]*min-height:\s*44px/)
  assert.match(styles, /\.reception-visit-history-row\s*\{[\s\S]*align-items:\s*start/)
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.smart-date-calendar\s*\{[\s\S]*width:\s*min\(350px, calc\(100vw - 32px\)\)/)
})

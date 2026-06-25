import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { describe, test } from 'node:test'

const read = (path) => readFile(path, 'utf8')

describe('categorias dinamicas de Cantina', () => {
  test('no existe configuracion hardcodeada de categorias', async () => {
    await assert.rejects(() => stat('src/config/canteen.ts'))
  })

  test('el tipo de categoria admite valores dinamicos', async () => {
    const source = await read('src/types.ts')
    assert.match(source, /export type CanteenCategory = string/)
  })

  test('existe coleccion canteenCategories en el mapa de Firebase', async () => {
    const config = await read('src/config/firebase.ts')
    const collections = await read('src/services/firestoreCollections.ts')
    assert.match(config, /canteenCategories/)
    assert.match(collections, /canteenCategories: 'canteenCategories'/)
  })

  test('los helpers normalizan nombres de categoria sin depender de listas fijas', async () => {
    const source = await read('src/utils/canteenCategories.ts')
    assert.match(source, /normalizeCanteenCategoryName/)
    assert.match(source, /buildCanteenCategoryOptions/)
    assert.doesNotMatch(source, /Bebidas.*Snacks.*Comidas/s)
  })

  test('las categorias operativas se filtran por activas y con productos', async () => {
    const source = await read('src/utils/canteenCategories.ts')
    assert.match(source, /onlyOperational/)
    assert.match(source, /productCount/)
    assert.match(source, /category\.isActive !== false/)
  })

  test('la carga de productos usa tabs horizontales de categorias', async () => {
    const source = await read('src/components/canteen/CanteenOperations.tsx')
    assert.match(source, /canteen-category-tabs/)
    assert.match(source, /operationalCategories\.map/)
    assert.match(source, /filterCanteenProductsByCategory/)
  })

  test('la grilla muestra estado vacio por categoria', async () => {
    const source = await read('src/components/canteen/CanteenOperations.tsx')
    assert.match(source, /No hay productos activos en esta categoría/)
  })

  test('el inventario tiene administrador de categorias', async () => {
    const source = await read('src/components/canteen/ProductManager.tsx')
    assert.match(source, /Categorías de Cantina/)
    assert.match(source, /upsertCanteenCategory/)
    assert.match(source, /deleteCanteenCategory/)
  })

  test('el formulario de producto usa categorias activas dinamicas', async () => {
    const source = await read('src/components/canteen/ProductManager.tsx')
    assert.match(source, /activeCategoryOptions\.map/)
    assert.match(source, /Creá una categoría primero/)
  })

  test('las categorias legacy se muestran sin crear documentos duplicados', async () => {
    const source = await read('src/utils/canteenCategories.ts')
    assert.match(source, /isLegacy: true/)
    assert.match(source, /byKey\.set\(normalizedName/)
  })

  test('el inventario impide eliminar categorias con productos asociados desde el servicio', async () => {
    const source = await read('src/services/canteenService.ts')
    assert.match(source, /productos asociados/)
    assert.match(source, /where\('categoryNormalized', '==', normalizedName\)/)
  })

  test('productos nuevos exigen categoria activa en backend', async () => {
    const source = await read('functions/src/canteen.ts')
    assert.match(source, /canteenCategories/)
    assert.match(source, /La categoria seleccionada no esta activa/)
  })

  test('editar productos existentes no cambia stock por el formulario', async () => {
    const ui = await read('src/components/canteen/ProductManager.tsx')
    const backend = await read('functions/src/canteen.ts')
    assert.match(ui, /stock: form\.id \? undefined : form\.stock/)
    assert.match(backend, /stockWasProvided/)
  })
})

describe('ingreso seguro de stock', () => {
  test('Agregar stock llama a la Function segura existente', async () => {
    const service = await read('src/services/canteenService.ts')
    assert.match(service, /adjustCanteenStockSecure/)
    assert.match(service, /direction: 'increase'/)
  })

  test('la UI expone Agregar stock por producto', async () => {
    const source = await read('src/components/canteen/ProductManager.tsx')
    assert.match(source, /Agregar stock/)
    assert.match(source, /Confirmar ingreso/)
  })

  test('la cantidad de stock se valida como entero positivo en UI', async () => {
    const source = await read('src/components/canteen/ProductManager.tsx')
    assert.match(source, /Number\.isInteger\(quantity\)/)
    assert.match(source, /mayor a cero/)
  })

  test('el historial lee canteenInventoryMovements', async () => {
    const source = await read('src/hooks/useCanteen.ts')
    assert.match(source, /useCanteenInventoryMovements/)
    assert.match(source, /canteenInventoryMovements/)
  })

  test('el historial muestra ingresos de stock', async () => {
    const source = await read('src/components/canteen/ProductManager.tsx')
    assert.match(source, /Historial de ingresos de stock/)
    assert.match(source, /stock_entry/)
    assert.match(source, /initial_stock/)
  })

  test('la entrada de stock guarda motivo y usa idempotencia', async () => {
    const service = await read('src/services/canteenService.ts')
    assert.match(service, /reason/)
    assert.match(service, /operationScope\('stock-entry'/)
  })

  test('las reglas no permiten escribir movimientos de inventario desde cliente', async () => {
    const rules = await read('firestore.rules')
    assert.match(rules, /match \/canteenInventoryMovements\/\{movementId\}/)
    assert.match(rules, /allow create, update, delete: if false/)
  })

  test('las categorias solo las administran admin o socio', async () => {
    const rules = await read('firestore.rules')
    assert.match(rules, /function canManageCanteenInventory/)
    assert.match(rules, /match \/canteenCategories\/\{categoryId\}/)
  })
})

describe('reservas y presupuestos', () => {
  test('la fecha actual usa America/Asuncion', async () => {
    const source = await read('src/utils/asuncionDate.ts')
    assert.match(source, /America\/Asuncion/)
    assert.match(source, /isPastAsuncionDateKey/)
  })

  test('el formulario bloquea reservas en fechas pasadas', async () => {
    const source = await read('src/components/events/EventCreateForm.tsx')
    assert.match(source, /No se puede crear una reserva en una fecha que ya pasó/)
    assert.match(source, /min=\{getTodayDateKey\(\)\}/)
  })

  test('el servicio de eventos tambien valida fechas pasadas', async () => {
    const source = await read('src/services/eventService.ts')
    assert.match(source, /isPastAsuncionDateKey/)
    assert.match(source, /No se puede crear una reserva en una fecha que ya pasó/)
  })

  test('el calendario deshabilita dias pasados', async () => {
    const source = await read('src/pages/admin/AdminReservationsPage.tsx')
    assert.match(source, /disabled=\{isPast\}/)
    assert.match(source, /No disponible/)
  })

  test('el calendario muestra Dia seleccionado con tilde', async () => {
    const source = await read('src/pages/admin/AdminReservationsPage.tsx')
    assert.match(source, /Día seleccionado/)
    assert.match(source, /Agregar reserva a este día/)
  })

  test('Presupuestos tiene seccion colapsable para crear', async () => {
    const source = await read('src/components/events/EventBudgetsSection.tsx')
    assert.match(source, /Crear presupuesto de evento/)
    assert.match(source, /isCreateSectionOpen/)
  })

  test('Presupuestos tiene listado colapsable independiente', async () => {
    const source = await read('src/components/events/EventBudgetsSection.tsx')
    assert.match(source, /Presupuestos creados/)
    assert.match(source, /isListSectionOpen/)
  })

  test('Presupuestos conserva acciones existentes', async () => {
    const source = await read('src/components/events/EventBudgetsSection.tsx')
    assert.match(source, /downloadEventBudgetPdf/)
    assert.match(source, /convertBudgetToReservation/)
    assert.match(source, /updateEventBudgetStatus/)
  })

  test('los dias pasados se comunican como no disponibles', async () => {
    const source = await read('src/pages/admin/AdminReservationsPage.tsx')
    assert.match(source, /Las fechas pasadas no aceptan nuevas reservas/)
    assert.match(source, /available-chip/)
  })

  test('el CSS contiene estilos mobile-friendly para categorias e historial', async () => {
    const source = await read('src/index.css')
    assert.match(source, /canteen-category-tabs/)
    assert.match(source, /stock-history-row/)
    assert.match(source, /budget-collapsible-section/)
  })

  test('la exportacion manual de backup incluye categorias', async () => {
    const source = await read('src/services/backupService.ts')
    assert.match(source, /canteenCategories/)
  })
})

# Auditoría previa a entrega de LUCCAPARKWEB

**Fecha:** 21 de junio de 2026  
**Alcance:** inspección estática, build, lint, revisión de reglas/configuración, pruebas visuales públicas y consultas administrativas de solo lectura.  
**Restricciones respetadas:** no se modificó lógica funcional, reglas, dependencias ni datos; no se ejecutaron restauraciones, migraciones, escrituras reales o despliegues.

## 1. Resumen ejecutivo

LUCCAPARKWEB posee una cobertura funcional amplia y el build de producción compila, pero **no está todavía en condiciones seguras de entrega**. La causa principal no es visual: las reglas actuales permiten a cualquier cuenta autenticada, incluso sin perfil activo, leer, modificar o borrar datos operativos sensibles. Además, operaciones financieras e inventario confían demasiado en valores enviados por el cliente.

También se comprobaron riesgos de exactitud financiera en períodos y grupos familiares, operaciones de varios documentos que pueden quedar a medias, ausencia de idempotencia en cobros, un backup JSON incompleto y una página pública que todavía expone contenido demo y datos de contacto de ejemplo.

La capa de recuperación tiene una fortaleza real: mediante Firebase CLI en modo lectura se verificó un schedule nativo diario de Firestore con retención de 30 días y backups recientes en estado `READY`. Esto mitiga pérdida total de Firestore, pero no cubre Firebase Authentication ni los archivos físicos de Storage y no vuelve segura la restauración JSON de la aplicación.

## 2. Veredicto

# NO APTO TODAVÍA

| Prioridad | Cantidad |
|---|---:|
| P0 - Bloqueante | 2 |
| P1 - Antes de producción | 10 |
| P2 - Recomendado | 8 |
| P3 - Mejora futura | 3 |
| **Total** | **23** |

## 3. Inventario funcional y rutas reales

### Rutas públicas

- `/`: landing pública, instalaciones, paquetes, calendario demo, contacto, WhatsApp y ubicación.
- `/contacto`: contacto y ubicación.
- `/disponibilidad`: página pública adicional con horarios demo.
- `/precios`: redirección a `/#cumpleanos`.
- `/login`: acceso con Firebase Authentication.

### Rutas autenticadas

- `/admin/dashboard`: Control/Dashboard.
- `/admin/recepcion` y `/recepcion`: registro de ingresos, responsables, niños, visitas y cobro/finalización.
- `/admin/reservas`: calendario, reservas, pagos, invitados, presupuestos, servicios y decoración.
- `/admin/calendario`: redirección a Reservas.
- `/admin/cantina` y `/cantina`: productos, inventario, cuentas, consumo, cobros y anulaciones.
- `/admin/finanzas`: pagos, gastos, pendientes y cierres financieros/PDF.
- `/admin/reportes`: asistencia, perfil, cantina, eventos y oportunidades.
- `/admin/clientes`: niños, responsables y cumpleaños.
- `/admin/tareas`: tareas y asignaciones.
- `/admin/configuracion`: usuarios, permisos, historial, página pública y backups.
- `/tv`: temporizadores y evento activo.
- `/appmovil`: acceso móvil.

### Persistencia y servicios detectados

- Firebase Auth, Firestore y Storage.
- Colecciones: `users`, `customers`, `children`, `visits`, `activeVisits`, `events`, `eventGuests`, `eventBudgets`, catálogos de presupuestos, `canteenProducts`, `canteenOrders`, `canteenInventoryMovements`, `canteenVoidRequests`, `payments`, `expenses`, `financialClosures`, `dailyClosings`, `tasks`, `settings`, `landingContent`, `tvDisplaySettings`, `activityLogs`, `backups` y `backupLocks`.
- PDFs de presupuestos y cierres generados en cliente.
- Backup JSON manual y automático por uso; Firestore Scheduled Backups diario.
- Modo local alternativo de visitas mediante `localStorage`/`BroadcastChannel`, desactivado por defecto.

## 4. Hallazgos P0

### P0-01 - Cualquier cuenta autenticada puede alterar o borrar datos operativos sensibles

- **Módulo:** autenticación, clientes, recepción, reservas y seguridad.
- **Evidencia:** `canOperateBase()` solo exige `signedIn()` y otorga `read, write` sobre `customers`, `children`, `activeVisits`, `visits`, `events` y `eventGuests`. `ProtectedRoute` solo verifica que exista un usuario Firebase; no exige perfil, rol ni `isActive`. La navegación admin tampoco se filtra por rol.
- **Archivo y función:** `firestore.rules:123-164` (`canOperateBase` y matches); `src/components/ProtectedRoute.tsx:5-17`; `src/layouts/AdminLayout.tsx:19-68`.
- **Riesgo:** una cuenta desactivada, sin perfil o con rol operativo puede leer cédulas/teléfonos y crear, modificar o eliminar clientes, visitas y reservas. Es pérdida/exposición de datos y acceso no autorizado.
- **Reproducción segura:** inspeccionar las condiciones de reglas y acceder con una cuenta Auth sin perfil; no se ejecutó la escritura contra producción.
- **Recomendación:** exigir perfil activo y permisos por colección/operación; proteger rutas por rol; prohibir `delete` salvo flujo administrativo explícito; agregar tests de reglas en Emulator Suite.
- **Estimación:** grande.

### P0-02 - Pagos, stock y consumos pueden ser manipulados desde un cliente modificado

- **Módulo:** Finanzas, Cantina e inventario.
- **Evidencia:** un rol operativo puede crear `payments` con cualquier `totalPaid >= 0`, sin validar origen, saldo, método ni relación; puede bajar `canteenProducts.stock` a cualquier valor, incluso negativo; la regla de cuentas solo compara tamaño y total del array, por lo que no protege precio, producto o cantidad de líneas existentes. Visitas y eventos admiten escritura arbitraria por cualquier autenticado.
- **Archivo y función:** `firestore.rules:70-108`, `166-180`, `195-200` y `149-164`.
- **Riesgo:** falsificación de ingresos, cobros duplicados, cambio de precios/cantidades, stock negativo y saldos incoherentes. Ocultar botones no evita estas operaciones.
- **Reproducción segura:** evaluación estática de las reglas con payloads que conservan `items.size()` y aumentan `total`; no se enviaron escrituras reales.
- **Recomendación:** mover cobros, anulaciones y stock a backend/Cloud Functions o transacciones con reglas de esquema estrictas; validar invariantes, roles, IDs, montos y estados previos.
- **Estimación:** grande.

## 5. Hallazgos P1

### P1-01 - Finanzas puede asignar cobros al período equivocado y multiplicar pendientes grupales

- **Módulo:** Finanzas, Recepción y cuentas compartidas.
- **Evidencia:** para visitas legacy, el conjunto de pagos vinculados se construye solo con pagos del período; un pago real fuera del rango no evita que se sintetice otro pago usando `startedAt`. Además, `pendingAmount` suma primero cada cuenta abierta y luego vuelve a incluir la misma cuenta en cada visita vinculada del grupo.
- **Archivo y función:** `src/hooks/useFinance.ts:223-257` y `329-335` (`useFinance`); `src/utils/visitBilling.ts:17-45`; `src/utils/visitGroups.ts` (`getOrdersForVisit`).
- **Riesgo:** Totales de Hoy/Mes/Personalizado y saldos pendientes que no cierran; una cuenta compartida puede contarse una vez globalmente más una vez por niño.
- **Reproducción:** pago de visita en un día distinto del ingreso; grupo de dos visitas con una cuenta abierta compartida.
- **Recomendación:** deduplicar contra todos los pagos válidos, usar fecha real de cobro, calcular pendientes por operación/grupo y añadir tests de conciliación.
- **Estimación:** mediana.

### P1-02 - Cobros y cuentas no tienen idempotencia de servidor

- **Módulo:** Cantina y cobro/finalización grupal.
- **Evidencia:** `chargeCanteenOrder` y `checkoutVisitGroupBalance` crean un `paymentRef` nuevo desde el estado recibido por el componente y ejecutan batch sin releer/condicionar el estado actual. La apertura de cuenta consulta y luego crea sin clave única/transacción.
- **Archivo y función:** `src/services/canteenService.ts:206-253` y `324-374`; `src/services/checkoutService.ts:131-248`; `src/components/canteen/CanteenOperations.tsx:364-400`.
- **Riesgo:** doble clic muy rápido, reintento de red o dos dispositivos pueden crear dos cuentas o dos pagos para la misma operación.
- **Reproducción:** disparar dos confirmaciones concurrentes con el mismo snapshot de cuenta/grupo.
- **Recomendación:** clave de operación/idempotency key, transacción que verifique estado y ausencia de pago, y restricción equivalente en backend/reglas.
- **Estimación:** mediana.

### P1-03 - Flujos de varios documentos pueden quedar parcialmente guardados

- **Módulo:** Recepción, extensiones, Reservas y Presupuestos.
- **Evidencia:** el ingreso grupal crea visitas en un bucle secuencial; cada visita actualiza responsable/niño antes del batch de visita. Las extensiones actualizan `activeVisits` y `visits` con `Promise.all`, y la extensión grupal repite el patrón. Crear evento y convertir presupuesto realizan varios `setDoc/updateDoc` secuenciales.
- **Archivo y función:** `src/components/reception/VisitForm.tsx:305-311`; `src/services/visitService.ts:168-326` y `373-414`; `src/components/reception/VisitGroupCard.tsx:64-79`; `src/services/eventService.ts:129-224`; `src/services/eventBudgetService.ts:216-275`.
- **Riesgo:** grupo incompleto, contador de visitas incrementado sin visita, temporizador distinto entre copia activa/histórica, reserva creada sin presupuesto convertido.
- **Reproducción:** simular fallo en la segunda escritura/segunda visita usando emulador o mock.
- **Recomendación:** batches/transacciones por operación y estados de recuperación cuando la cantidad exceda límites.
- **Estimación:** grande.

### P1-04 - El backup JSON puede ser incompleto y la restauración no es recuperable de forma segura

- **Módulo:** Backup.
- **Evidencia:** `canteenVoidRequests` no integra `backupCollections`; errores por colección se guardan, pero el backup se marca `success` si exportó al menos un documento. La restauración no crea backup preventivo, acepta nombres de colección del archivo, hace upsert con `merge` y confirma lotes parciales sin rollback.
- **Archivo y función:** `src/services/backupService.ts:72-100`, `191-262`, `356-397`; `src/components/settings/BackupSettingsPanel.tsx:127-153` y `227-257`.
- **Riesgo:** respaldo presentado como correcto sin información crítica; restauración parcial o con datos viejos coexistiendo; ausencia de retorno automático al estado previo.
- **Reproducción segura:** lectura del flujo; no se restauró producción.
- **Recomendación:** lista cerrada de colecciones/versiones, fallar ante cualquier colección faltante, incluir solicitudes, backup `pre_restore` obligatorio, plan de reemplazo/fusión y restore en ambiente aislado antes de producción.
- **Estimación:** grande.

### P1-05 - El historial de actividad es incompleto y no es evidencia inmutable

- **Módulo:** Historial y seguridad.
- **Evidencia:** no se registra de forma consistente cobro de evento, apertura/carga/cobro normal de Cantina, ventas/ajustes de stock, tareas ni altas/desactivaciones de usuarios. `logActivity` ignora fallos. Las reglas permiten a cualquier autenticado crear logs sin obligar `userId == request.auth.uid`, y Admin puede actualizarlos.
- **Archivo y función:** `src/services/activityLogService.ts:49-66`; `src/services/taskService.ts`; `src/services/userService.ts`; `src/services/eventService.ts:266-341`; `src/services/canteenService.ts:206-374`; `firestore.rules:221-225`.
- **Riesgo:** acciones críticas sin trazabilidad, autor falsificable y registro editable; dificulta investigar errores o fraude.
- **Reproducción:** comparar operaciones exportadas con llamadas a `logActivity`; evaluar regla de create/update.
- **Recomendación:** escritura de auditoría en la misma operación backend/batch, identidad derivada de Auth y logs append-only incluso para Admin.
- **Estimación:** mediana.

### P1-06 - Reservas permiten sobrepago y pagos cuando el saldo ya es cero

- **Módulo:** Reservas y Finanzas.
- **Evidencia:** la UI solo pide confirmación si el monto supera el pendiente; el servicio valida únicamente `amount > 0` y acumula `eventPaidAmount` por encima del total.
- **Archivo y función:** `src/components/events/EventPaymentModal.tsx:38-58`; `src/services/eventService.ts:266-339` (`registerEventPayment`).
- **Riesgo:** saldo cero con cobros adicionales, totales cobrados mayores al contrato y conciliación incorrecta.
- **Reproducción:** evento pagado o con pendiente menor al monto ingresado.
- **Recomendación:** validar saldo y estado dentro de la transacción; separar explícitamente ajustes autorizados y exigir motivo/rol.
- **Estimación:** pequeña.

### P1-07 - La página pública todavía presenta información demo y datos de contacto de ejemplo

- **Módulo:** página pública y preparación de dominio.
- **Evidencia:** en prueba visual se mostró calendario “Mayo 2025” con `aria-label="Calendario demo de disponibilidad"`, WhatsApp `595981000000`, “Direccion configurable” y texto “Fase 2”. `/disponibilidad` también consume horarios demo.
- **Archivo y función:** `src/components/CalendarPreview.tsx`; `src/data/demoData.ts`; `src/config/app.ts:8-9`; `src/layouts/PublicLayout.tsx:62`; `src/pages/AvailabilityPage.tsx`.
- **Riesgo:** clientes reciben disponibilidad falsa, contacto incorrecto y una imagen pública no profesional.
- **Reproducción:** abrir `/` y `/contacto`; se verificó a 390 px y desktop local sin escritura.
- **Recomendación:** ocultar el calendario demo o conectarlo a reservas reales; cargar contacto/contenido definitivo antes del dominio.
- **Estimación:** mediana.

### P1-08 - La versión de entrega no es reproducible ni está respaldada por CI/tests

- **Módulo:** release y calidad.
- **Evidencia:** `main` tiene 29 archivos modificados, 3.611 inserciones, archivos críticos nuevos sin seguimiento y cambios locales de reglas; `HEAD/origin/main` sigue en `b287024`. No existe `.github/workflows`, suite de tests ni tests de reglas. `npm run lint` falla con 5 errores y 2 warnings.
- **Archivo y función:** estado Git completo; `package.json` scripts; errores en `ProductImageView.tsx`, `eventBudgetService.ts`, `financialClosureService.ts`, más warnings en `CanteenOperations.tsx` y `useFinance.ts`.
- **Riesgo:** no hay versión identificable para rollback; producción puede no coincidir con repositorio/reglas; regresiones sin detección.
- **Reproducción:** `git status --short`, `git diff --stat`, búsqueda de tests, `npm run lint`.
- **Recomendación:** estabilizar, revisar diff, pruebas mínimas, commit/tag de release y CI build/lint/tests antes de desplegar.
- **Estimación:** mediana.

### P1-09 - Storage no aplica roles ni estado activo en varias rutas sensibles

- **Módulo:** Firebase Storage y seguridad.
- **Evidencia:** cualquier autenticado puede crear/actualizar imágenes públicas, de productos, TV y decoración. `canManageBackups` lee rol pero no `isActive`, por lo que un usuario desactivado que conserve rol puede descargar backups. Los PDFs de cierre admiten create/read para cualquier autenticado.
- **Archivo y función:** `storage.rules:9-22`, `53-85`.
- **Riesgo:** vandalismo de contenido público/TV, acceso de exusuarios a backups y carga de archivos financieros fuera de rol.
- **Reproducción segura:** evaluación de condiciones de reglas; no se cargaron archivos.
- **Recomendación:** reutilizar perfil activo y permisos por recurso, propietario/entidad y tamaño/tipo; tests de Storage Rules.
- **Estimación:** mediana.

### P1-10 - El inventario no posee un libro completo de movimientos y puede quedar negativo

- **Módulo:** Cantina e inventario.
- **Evidencia:** ventas normales decrementan `stock` pero no crean `canteenInventoryMovements`; editar un producto reemplaza stock directamente sin registrar diferencia; los movimientos se crean principalmente al aprobar anulaciones. No se valida stock disponible antes del decremento.
- **Archivo y función:** `src/services/canteenService.ts:78-128`, `206-321` y `452-516`; `firestore.rules:166-172`.
- **Riesgo:** no se puede reconstruir ni conciliar stock, detectar ajustes o explicar negativos; anulaciones pueden partir de una base ya inconsistente.
- **Reproducción:** venta con stock insuficiente o edición manual de stock; comparar producto y colección de movimientos.
- **Recomendación:** ledger obligatorio para inicial, ingreso, venta, ajuste, devolución, merma y cortesía; transacción con validación de stock no negativo.
- **Estimación:** grande.

## 6. Hallazgos P2

### P2-01 - Estado y contador del backup JSON no representan toda la realidad

- **Módulo:** Backup. **Evidencia:** la suscripción limita a 30 documentos y el header usa `backups.length`; el modo automático se etiqueta activo aunque solo corre cuando entra Admin/Socio; no existe retención de archivos JSON. **Archivo:** `backupService.ts:98`, `174-189`, `281-340`; `BackupSettingsPanel.tsx:166`, `188-224`. **Riesgo:** contador/estado engañoso y crecimiento de Storage. **Reproducción:** más de 30 metadatos o período sin accesos autorizados. **Recomendación:** count agregado, estado verificable y retención. **Estimación:** mediana.

### P2-02 - Dependencia de producción con vulnerabilidad alta reportada

- **Módulo:** dependencias. **Evidencia:** `npm audit --omit=dev` reportó `protobufjs@7.6.0` con una vulnerabilidad alta de denegación de servicio, transitiva de `firebase > @firebase/firestore > @grpc/proto-loader`. **Archivo:** `package-lock.json`. **Riesgo:** exposición depende del uso del parser, pero debe evaluarse antes de congelar versión. **Reproducción:** comando de audit. **Recomendación:** revisar compatibilidad y actualización controlada en tarea separada. **Estimación:** pequeña.

### P2-03 - Carga inicial y lecturas crecerán de forma costosa

- **Módulo:** rendimiento. **Evidencia:** bundle JS 1.521,69 kB (486,00 kB gzip), warning >500 kB; Finanzas escucha siete colecciones completas y Clientes seis; imágenes públicas de 0,84 a 1,75 MB. **Archivo:** `vite.config.ts`, `useFinance.ts`, `useClients.ts`, `public/assets/*`. **Riesgo:** inicio lento en móvil y lecturas/costos crecientes. **Reproducción:** build y búsqueda de `onSnapshot`. **Recomendación:** code splitting, consultas por rango/paginación y optimización de imágenes. **Estimación:** mediana.

### P2-04 - El entorno apunta a producción por defecto y no hay separación de ambientes

- **Módulo:** Firebase/release. **Evidencia:** fallback hardcodeado a `luccapark-app`, `.firebaserc` default de producción, `.env` no está explícitamente ignorado y no existe proyecto staging. **Archivo:** `src/config/firebase.ts:8-14`, `.firebaserc`, `.gitignore`, `.env.example`. **Riesgo:** pruebas o despliegues accidentales contra producción y posible commit futuro de variables. **Reproducción:** build sin variables. **Recomendación:** ambientes explícitos, validación de projectId y protección de deploy. **Estimación:** mediana.

### P2-05 - Ciclo de vida de usuarios incompleto

- **Módulo:** Login/Usuarios. **Evidencia:** agregar usuario exige crear Auth manualmente y pegar UID; no hay `createStaffUser` backend ni recuperación de contraseña en la UI. Un perfil con rol faltante se muestra como Admin en frontend, aunque reglas no lo reconozcan. **Archivo:** `userService.ts`, `AdminSettingsPage.tsx`, `LoginPage.tsx`, `useUserProfile.ts:54-62`. **Riesgo:** errores operativos, soporte manual y UI de permisos inconsistente. **Reproducción:** alta sin perfil completo/olvido de contraseña. **Recomendación:** función backend segura y reset de contraseña; fallback de menor privilegio. **Estimación:** mediana.

### P2-06 - Textos visibles y estados técnicos no son totalmente consistentes

- **Módulo:** UX global. **Evidencia:** aparecen `Recepcion`, `Configuracion`, `Cumpleanos`, `ninos`, `Restauracion` y otros textos sin acentos; el backup expone `automaticState.status` técnico. **Archivo:** `AdminLayout.tsx`, componentes de eventos, `eventService.ts`, `BackupSettingsPanel.tsx`. **Riesgo:** percepción de producto sin terminar y códigos técnicos visibles. **Reproducción:** búsqueda estática y vistas afectadas. **Recomendación:** catálogo de textos/labels y revisión lingüística. **Estimación:** pequeña.

### P2-07 - Documentación operativa y de entrega insuficiente o desactualizada

- **Módulo:** documentación. **Evidencia:** README aún describe “Fase 5”, stock simple y datos demo; no hay manual de roles, operación diaria, incidentes offline, reset de contraseña, soporte, restore validado ni rollback. **Archivo:** `README.md`, `docs/github-pages.md`, `docs/firebase-native-backups.md`. **Riesgo:** dependencia del desarrollador y errores del cliente. **Reproducción:** comparar módulos reales con documentación. **Recomendación:** manual de usuario, runbook técnico y acta de propiedad/credenciales. **Estimación:** mediana.

### P2-08 - Ciclo de vida de archivos deja limitaciones y objetos huérfanos

- **Módulo:** Storage. **Evidencia:** rules prohíben delete en imágenes y backups; al borrar decoración el objeto puede quedar; comprobantes de gastos solo son legibles por quien los subió, no por finanzas/admin. El JSON guarda referencias, no bytes. **Archivo:** `storage.rules:45-85`; servicios de imágenes/gastos. **Riesgo:** Storage crece y el equipo financiero no puede revisar comprobantes ajenos. **Reproducción:** archivo de otro usuario o baja de imagen. **Recomendación:** política de retención/borrado autorizada y permisos de comprobantes por rol. **Estimación:** mediana.

## 7. Hallazgos P3

### P3-01 - Componentes y hoja de estilos excesivamente grandes

- **Módulo:** mantenibilidad. **Evidencia:** `src/index.css` tiene 7.803 líneas; `CanteenOperations`, Reportes, Clientes y VisitForm tienen entre 777 y 982 líneas. **Riesgo:** cambios visuales y funcionales difíciles de aislar. **Reproducción:** conteo de líneas. **Recomendación:** modularizar después de estabilizar producción. **Estimación:** grande.

### P3-02 - Metadatos y capacidades de instalación/offline son mínimos

- **Módulo:** hosting. **Evidencia:** versión `0.0.0`, sin manifest/service worker, sin meta description ni estrategia offline; solo `apple-touch-icon`. **Archivo:** `package.json`, `index.html`. **Riesgo:** experiencia básica al instalar y pantalla de error sin conexión. **Reproducción:** inspección estática/offline. **Recomendación:** metadatos, versión y política offline posterior. **Estimación:** pequeña.

### P3-03 - Higiene del repositorio pendiente

- **Módulo:** release. **Evidencia:** archivos temporales `tmp-check-*.png` y `tmp-financial-closure.pdf`, código demo y componentes sin ruta activa permanecen en el árbol local. **Riesgo:** confusión y entregables innecesarios. **Reproducción:** `git status` y búsqueda de imports. **Recomendación:** clasificar artefactos, documentar o retirar lo obsoleto en una tarea controlada. **Estimación:** pequeña.

## 8. Flujos verificados

### Verificados por lectura de código

- Login con Firebase Auth y redirección de rutas no autenticadas.
- Búsqueda/normalización de cédula, vínculo responsable-niño y creación de snapshots en visita.
- Visitas individuales dentro de grupos `groupEntryId`; TV sigue leyendo documentos individuales.
- Extensiones +30/+60 y criterio activo/vencido.
- Cuenta compartida, resumen y checkout grupal en batch.
- Borrador de Cantina, cuenta vacía, solicitud/revisión de anulación y reembolso inverso.
- Reserva, pago, presupuesto, snapshots de precio y conversión.
- Filtros y fuentes de Finanzas/Reportes.
- Backup JSON, automático por uso, restore y reglas de Storage.
- Suscripciones Firestore: los listeners revisados retornan función de desuscripción.

### Verificados ejecutando pruebas seguras

- `npm run build`: correcto.
- `npm run build:pages`: correcto; generó fallback SPA `dist/404.html`.
- `npm run lint`: falló con 5 errores y 2 warnings.
- `npm audit --omit=dev`: una vulnerabilidad alta, cero críticas.
- Landing y Contacto a 390 px: sin scroll horizontal (`scrollWidth == clientWidth`), sin errores de consola.
- Redirección de rutas protegidas sin sesión hacia Login.
- Firebase CLI, solo lectura: schedule diario `(default)`, retención `2592000s` (30 días), backups recientes `READY` hasta 2026-06-21.

## 9. Flujos que no pudieron probarse

No se afirma que los siguientes funcionen end-to-end. No hay tests automatizados/emuladores ni credenciales/datos de prueba aislados, y la auditoría prohibía escribir datos reales:

- Alta real de responsable/niño, ingreso individual/grupal, extensión, salida y checkout.
- Cobro real de Cantina, actualización efectiva de stock, anulaciones y reembolso.
- Reserva/presupuesto/PDF con documentos reales y permisos por todos los roles.
- Duplicados, huérfanos, stock negativo y conciliación de documentos existentes en producción.
- Backup JSON real y descarga desde Storage con cada rol.
- Cualquier restauración JSON o nativa.
- Responsive de pantallas autenticadas con datos de 1, 2, 5 o más niños/cuentas.
- Autorización real de dominio futuro en Firebase Authentication.

## 10. Integridad de datos

- No se consultaron ni modificaron documentos de negocio en producción; por ello no se cuantifican duplicados o huérfanos reales.
- La deduplicación de responsables es “consultar y luego crear” por cédula/teléfono, sin unicidad transaccional; dos altas concurrentes o registros antiguos sin `documentNumberNormalized` pueden duplicar perfiles.
- Los snapshots de visitas ayudan a conservar contexto histórico, pero las escrituras parciales pueden incrementar `visitCount`/`eventReservationCount` sin completar la operación.
- Montos se normalizan mediante helpers en lectura, lo que tolera números históricos como texto, pero no corrige el documento original.
- Las operaciones grupales conservan visitas individuales, lo cual es correcto; los agregados financieros deben deduplicar explícitamente cuentas/pagos compartidos.

## 11. Riesgos Firebase y seguridad

1. Reglas base por autenticación, no por perfil activo/rol.
2. Escrituras financieras y de stock confiadas al cliente.
3. Storage permite sobrescribir imágenes públicas a cualquier autenticado.
4. No hay Functions/Admin SDK para operaciones privilegiadas atómicas.
5. No hay tests de reglas ni archivo de CI.
6. No pudo verificarse que las reglas desplegadas coincidan con el worktree local sin desplegar; las reglas locales tienen cambios no confirmados.
7. La API key web visible no es una credencial privada por sí sola; el riesgo está en reglas y restricciones, no en ocultarla.

## 12. Riesgos financieros

- Período incorrecto en fallback legacy de visitas.
- Doble/múltiple conteo de cuenta compartida en pendientes.
- `paidAt` se establece con reloj del dispositivo en varios flujos; una hora/fecha incorrecta afecta filtros.
- Cobros sin idempotencia y sobrepago de eventos permitido.
- Reembolsos se registran como pago negativo, pero su consistencia depende de que todos los reportes incluyan correctamente negativos y estados.
- Reglas permiten crear pagos sin relación verificable con visita, orden o evento.

## 13. Riesgos de backup

- **Confirmado:** Firestore Scheduled Backups diario, retención 30 días, backups `READY`.
- **No cubierto por backup nativo de Firestore:** Firebase Authentication y objetos de Storage.
- **JSON:** no contiene archivos físicos; solo datos/referencias presentes en documentos.
- **JSON incompleto:** omite `canteenVoidRequests`.
- **Restore:** merge parcial, sin borrado de sobrantes, sin rollback y sin backup preventivo automático.
- **Automático por uso:** depende de que ingrese Admin/Socio y no sustituye una tarea backend; el nativo sí es independiente de la app.

## 14. Riesgos responsive

- Landing y Contacto pasaron una comprobación básica a 390 px sin overflow horizontal.
- No se pudieron validar visualmente Recepción, cards grupales, Cantina, modales, Finanzas, Clientes, Configuración y TV con datos reales por falta de sesión/dataset aislado.
- La hoja CSS monolítica y los componentes grandes elevan el riesgo de regresiones entre breakpoints.
- Se requiere matriz visual autenticada: 360x800, 430x932, 768x1024, 1024x768, 1366x768 y TV 1920x1080.

## 15. Documentación faltante

- Manual del cliente por rol y flujo diario.
- Alta/desactivación de usuarios y recuperación de contraseña.
- Matriz exacta de permisos.
- Procedimiento sin internet y conciliación posterior.
- Anulación, merma, cortesía y reembolso.
- Cierre/corrección financiera y conciliación de stock.
- Backup manual, verificación de archivo y simulacro de restore.
- Recuperación de Auth/Storage, que no están en Firestore backup.
- Propiedad y custodia de Firebase, GitHub, dominio y cuentas de facturación.
- Soporte, escalamiento, deploy, rollback, tags y recuperación ante incidente.

## 16. Checklist final de entrega

- [ ] Corregir los dos P0 y probar reglas con emulador por rol/estado.
- [ ] Corregir conciliación financiera de períodos y grupos.
- [ ] Hacer idempotentes cobros y aperturas de cuenta.
- [ ] Volver atómicos los flujos críticos de varios documentos.
- [ ] Completar backup JSON y probar restore en proyecto/base aislada.
- [ ] Completar ledger de inventario y bloquear stock negativo.
- [ ] Cerrar brechas del historial de actividad.
- [ ] Reemplazar demo/placeholders públicos por datos definitivos.
- [ ] Resolver lint y agregar pruebas mínimas de flujos/reglas.
- [ ] Crear commit/tag de release limpio y verificar reglas desplegadas.
- [ ] Ejecutar UAT con Admin, Socio, Eventos, Recepción, Cantina y solo lectura.
- [ ] Ejecutar pruebas responsive autenticadas.
- [ ] Confirmar dominios autorizados, HTTPS, 404/SPA y plan de rollback.
- [ ] Entregar manuales, propiedad de cuentas y procedimiento de soporte.

## 17. Orden recomendado de correcciones

1. **Contención:** P0 de reglas/rutas y operaciones financieras/stock; probar en emulador.
2. **Exactitud:** período financiero, pendientes grupales, sobrepagos e idempotencia.
3. **Atomicidad:** ingreso grupal, extensiones, eventos y conversión de presupuestos.
4. **Inventario y auditoría:** ledger completo y logs append-only con identidad derivada.
5. **Recuperación:** backup JSON completo, `pre_restore` y simulacro aislado; conservar schedule nativo.
6. **Release:** resolver lint, tests, CI, commit/tag limpio y comparación de reglas desplegadas.
7. **Contenido/UAT:** retirar demos/placeholders, probar roles, móviles/tablets/TV y dominio.
8. **Después de estabilizar:** rendimiento, modularización, PWA/offline y mejoras P3.

## 18. Resultado técnico registrado

| Verificación | Resultado |
|---|---|
| TypeScript + Vite build | Correcto |
| Build GitHub Pages + fallback | Correcto |
| Bundle principal | 1.521,69 kB; 486,00 kB gzip; warning >500 kB |
| CSS | 107,41 kB; 19,40 kB gzip |
| ESLint | Falló: 5 errores, 2 warnings |
| Tests automatizados | No existen |
| npm audit producción | 1 alta, 0 críticas |
| Firestore Scheduled Backups | Verificado: DAILY, 30 días, backups READY |
| Deploy | No ejecutado |
| Escrituras/restores en Firebase | No ejecutados |


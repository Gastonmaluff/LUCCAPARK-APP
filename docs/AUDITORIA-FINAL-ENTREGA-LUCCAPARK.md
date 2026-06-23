# Auditoria final de entrega de Lucca Park

**Fecha:** 22 de junio de 2026
**Rama auditada:** `main`
**Base funcional:** `4c2d24915cc23d7bc705c978fd521dabe37417a2`
**Proyecto:** LUCCAPARKWEB
**Alcance:** revision local del codigo, configuracion, reglas, tests, builds, lint y dependencias. No se modificaron Firebase ni datos productivos y no se realizo ningun despliegue durante esta auditoria final.

## 1. Resumen ejecutivo

Lucca Park tiene una base funcional amplia y los dos bloqueantes de seguridad detectados en la auditoria anterior fueron corregidos:

- P0-01: perfiles activos, matriz de roles, rutas protegidas y permisos de Firestore.
- P0-02: pagos, consumos, stock, anulaciones y checkout pasan por Functions autenticadas, atomicas e idempotentes.

La rama principal compila y los 63 tests de seguridad e integridad pasan. Las 16 Functions declaradas localmente siguen presentes y las Firestore Rules locales corresponden al baseline seguro.

No quedan hallazgos P0. Sin embargo, quedan cuatro P1 independientes de P0-01/P0-02: calculo financiero de pendientes y fallbacks legacy, autorizacion de Storage, restauracion JSON parcial/incompatible con las reglas restrictivas, y contenido publico demo con datos de contacto de ejemplo.

## 2. Conclusion

# APTO CON CORRECCIONES PARA OPERACION CONTROLADA

El sistema no debe etiquetarse todavia como `v1.0.0` ni declararse listo para entrega definitiva. Antes deben resolverse los cuatro P1 y repetirse la validacion completa. La ausencia de P0 permite continuar operando el baseline actualmente publicado bajo supervision.

| Prioridad | Cantidad |
|---|---:|
| P0 | 0 |
| P1 | 4 |
| P2 | 9 |
| P3 | 4 |
| **Total** | **17** |

## 3. Version y arquitectura auditadas

- Frontend: React, TypeScript y Vite.
- Hosting actual: GitHub Pages con `BrowserRouter` y fallback `404.html`.
- Identidad: Firebase Authentication con perfiles en `users/{uid}`.
- Datos: Cloud Firestore.
- Archivos: Firebase Storage.
- Backend seguro: 16 Firebase Functions callable de segunda generacion, configuradas con Node 20 y region `southamerica-east1`.
- Operaciones servidoras: visitas, extensiones, checkout individual/grupal, Cantina, stock, anulaciones, reembolsos y pagos de eventos.
- Recuperacion: backup JSON desde la aplicacion y Firestore Scheduled Backups nativos.
- Auditoria: `activityLogs` y operaciones idempotentes en `secureOperations`.

## 4. Integracion de la rama principal

- Rama predeterminada detectada: `main`.
- Estado anterior: `b2870249bb01d3120f6f93a26181f29f4c3a2064`.
- `main` era ancestro directo de `4c2d249`; no habia divergencia.
- Metodo aplicado: fast-forward sin merge commit.
- Commits conservados: `1733fdd`, `91f5b9a` y `4c2d249`.
- Estado funcional integrado: `main` en `4c2d249`.
- No fue necesaria una rama de respaldo.

## 5. P0 resueltos

### P0-01 - Autenticacion, perfiles y roles

**Estado:** resuelto.
**Evidencia:** `src/auth/accessControl.ts`, `src/components/ProtectedRoute.tsx`, `src/hooks/useUserProfile.ts`, `firestore.rules` y `tests/firestore.rules.test.mjs`.

- Se exige usuario autenticado, perfil existente, rol valido e `isActive === true`.
- Las rutas administrativas se validan por rol.
- Un usuario no puede elevar su propio rol ni reactivarse.
- Cantina no puede borrar `activeVisits`; solo Admin, Socio y Recepcion pueden hacerlo.
- Las visitas historicas no admiten delete.

### P0-02 - Integridad financiera, consumos y stock

**Estado:** resuelto.
**Evidencia:** `functions/src/common.ts`, `functions/src/canteen.ts`, `functions/src/visits.ts`, `functions/src/events.ts`, `src/services/secureFunctions.ts` y `functions/test/financial-integrity.test.cjs`.

- Los importes y precios confiables se calculan en servidor.
- Payments, stock, lineas confirmadas y estados finales no se escriben directamente desde el cliente.
- Cobros y cierres usan idempotency keys y transacciones.
- Los movimientos de inventario nuevos quedan auditados.
- Los logs backend derivan identidad y rol desde Auth/perfil.
- Las Rules bloquean escritura cliente en `payments`, movimientos, stock y campos financieros protegidos.

## 6. Validaciones ejecutadas

| Verificacion | Resultado |
|---|---|
| Tests anteriores | 27/27 aprobados |
| Tests nuevos P0-02 | 36/36 aprobados |
| Distribucion real de runners | 32 Rules + 31 Functions = 63/63 |
| TypeScript frontend | Correcto |
| TypeScript Functions | Correcto |
| Build frontend | Correcto |
| Build Functions | Correcto |
| Lint dirigido P0-02 | Correcto |
| Lint global | 12 errores y 2 warnings heredados/configuracionales |
| Bundle JS | 1.515,74 kB; 485,05 kB gzip; warning mayor a 500 kB |
| Bundle CSS | 107,41 kB; 19,40 kB gzip |
| Functions exportadas localmente | 16 |

El lint global falla en `functions/eslint.config.js`, `ProductImageView.tsx`, `eventBudgetService.ts` y `financialClosureService.ts`; tambien reporta dependencias faltantes en hooks de Cantina y Finanzas. El lint dirigido de los archivos P0-02 pasa, por lo que no se detectaron errores nuevos del hardening.

## 7. Hallazgos P1

### P1-01 - Pendientes y fallback legacy pueden duplicar o ubicar importes en periodos incorrectos

**Modulo:** Finanzas.
**Evidencia:** `src/hooks/useFinance.ts:223-257` construye IDs vinculados solamente con pagos del periodo; una visita legacy puede sintetizarse usando `startedAt` aunque el cobro real este fuera del rango. `src/hooks/useFinance.ts:329-335` suma todas las cuentas abiertas y despues vuelve a incluirlas dentro del resumen de cada visita mediante `getVisitBillingSummary`. En grupos, una cuenta compartida puede contarse globalmente y una vez por cada nino.
**Riesgo:** Total cobrado y pendientes que no cierran por periodo o grupo.
**Recomendacion:** deduplicar con todos los pagos validos, usar exclusivamente la fecha real del movimiento y calcular pendientes por operacion/grupo con conjuntos de IDs. Agregar tests financieros de Hoy/Ayer/Mes y grupos.
**Tamano:** mediano.

### P1-02 - Storage no aplica la matriz de perfiles activos y roles

**Modulo:** Firebase Storage.
**Evidencia:** `storage.rules:9-90`. Cualquier usuario autenticado puede crear o reemplazar imagenes de productos, TV, pagina publica y decoraciones. Los PDFs de cierre pueden crearse/leerse por cualquier autenticado. `canManageBackups()` valida rol pero no `isActive`. Los comprobantes solo son legibles por el UID que los subio, no por roles financieros autorizados.
**Riesgo:** usuario inactivo o rol operativo puede conservar acceso a backups o alterar contenido visible; Finanzas puede no revisar comprobantes de otro usuario.
**Recomendacion:** portar a Storage el helper de perfil activo y la matriz por recurso, probar con Emulator y desplegar solamente despues de validar cada flujo.
**Tamano:** mediano.

### P1-03 - Restaurar desde JSON puede dejar datos parcialmente restaurados y ahora choca con Rules restrictivas

**Modulo:** Backup y recuperacion.
**Evidencia:** `src/services/backupService.ts:72-96` omite `canteenVoidRequests`; `saveBackupToStorage` marca success si existe algun documento aunque haya colecciones con error. `restoreBackupJson` acepta nombres de coleccion del archivo, hace upsert con `merge`, confirma lotes de 450 y no crea backup preventivo. Las Rules P0-02 bloquean escrituras cliente en colecciones financieras, por lo que una restauracion puede aplicar lotes iniciales y fallar al llegar a `payments`, stock u ordenes.
**Riesgo:** restauracion parcial sin rollback y falsa sensacion de recuperacion completa.
**Recomendacion:** mover restore a backend administrativo, usar allowlist/version estricta, backup `pre_restore`, plan replace/merge, estado de progreso recuperable y simulacro en proyecto aislado. Hasta entonces, deshabilitar operativamente el restore JSON y usar backup nativo.
**Tamano:** grande.

### P1-04 - La pagina publica mantiene contenido demo y contacto de ejemplo

**Modulo:** pagina publica y entrega comercial.
**Evidencia:** `src/config/app.ts:8-9` usa `595981000000` y `Direccion configurable`; `src/components/CalendarPreview.tsx` fija Mayo 2025 y calendario demo; `src/pages/AvailabilityPage.tsx` muestra horarios demo; `src/layouts/PublicLayout.tsx:62` menciona Fase 2.
**Riesgo:** clientes reciben contacto o disponibilidad incorrectos y el producto se percibe sin terminar.
**Recomendacion:** cargar informacion definitiva, ocultar o conectar disponibilidad real y revisar toda la pagina publica antes del dominio.
**Tamano:** pequeno.

## 8. Hallazgos P2

### P2-01 - No existe CI y el lint global no esta verde

No hay `.github/workflows`. `npm run lint` falla con 12 errores y 2 warnings. Incorporar CI con install reproducible, Rules, Functions, typecheck, build y lint; corregir primero el baseline global.

### P2-02 - Dependencias con vulnerabilidades conocidas

- Frontend: 1 baja y 2 altas. La alta directa de Vite afecta principalmente el servidor de desarrollo; `protobufjs` llega transitivamente por Firestore.
- Functions: 8 moderadas transitivas desde `firebase-admin`; la correccion propuesta por npm requiere `firebase-admin@14`, cambio mayor.

No hay vulnerabilidades criticas. Actualizar en una rama separada, ejecutar las 63 pruebas y revisar compatibilidad antes de desplegar.

### P2-03 - Mantenimiento cloud pendiente

`functions/package.json` fija Node 20, runtime deprecado con fecha de decommission 30/10/2026. El despliegue previo informo que `gcf-artifacts` no tiene politica de limpieza. El repositorio tampoco contiene configuracion de alertas operativas. Programar upgrade de runtime, politica de retencion de imagenes y alertas de error/costo.

### P2-04 - Bundle, imagenes y lecturas no escalan bien

El JS inicial supera 1,5 MB, las imagenes publicas pesan entre 0,84 y 1,75 MB y se detectan 28 listeners. Finanzas escucha siete colecciones completas. Aplicar code splitting, compresion de imagenes, consultas por rango y paginacion.

### P2-05 - Produccion es el fallback por defecto y no existe staging

`src/config/firebase.ts` y `.firebaserc` apuntan a `luccapark-app`; `.env` no esta explicitamente ignorado. Crear proyecto/variables de staging, validacion de projectId y proteccion de comandos de deploy.

### P2-06 - Creacion de eventos y conversion de presupuestos no son atomicas

`src/services/eventService.ts:130-225` escribe responsable, nino y evento secuencialmente. `src/services/eventBudgetService.ts:216-275` crea evento y despues actualiza evento/presupuesto en operaciones separadas. Un fallo intermedio deja contadores o conversiones parciales. Usar backend o batch/transaccion con recuperacion.

### P2-07 - Documentacion operativa y transferencia de propiedad incompletas

Faltan manual por rol, operacion sin internet, reset de contrasena, conciliacion, soporte, escalamiento, restore validado y acta de propiedad de Firebase/GitHub/dominio/facturacion.

### P2-08 - Excepciones legacy aceptadas

Nueve cuentas pagadas legacy no tienen relacion inequívoca con `payments` y no admiten reembolso seguro automatico. Dos cuentas de Gs. 0 permanecen intactas. La reserva `jqJEwENmZbuUsrJVMUp1` no tiene total contractual y no admite pagos seguros. Los eventos historicos `42OzpmvtGDYxslQgDq1y` y `86GZeyU1H8lZi51zWCx9` permanecen sin total. No inventar vinculos ni montos; resolver solo con aprobacion administrativa.

### P2-09 - Hosting definitivo y versionado visible pendientes

El sistema usa GitHub Pages, sin dominio definitivo. `package.json` conserva version `0.0.0`; no hay version visible ni proceso CI de release. Completar dominio, dominios autorizados de Auth, version y runbook antes del acta final.

## 9. Hallazgos P3

### P3-01 - Componentes demasiado grandes

`CanteenOperations.tsx` supera 900 lineas; Reportes, Clientes, VisitForm y varios servicios superan 650. Modularizar despues de estabilizar los P1/P2.

### P3-02 - Sin estrategia offline/PWA

No hay service worker, manifest ni persistencia Firestore configurada. El modo local de visitas existe pero esta desactivado por defecto y no resuelve conciliacion offline.

### P3-03 - Metadatos y accesibilidad basica incompletos

`index.html` declara `lang="en"` para una aplicacion en espanol; los iconos usan ruta absoluta `/assets/...`, problematica bajo el subdirectorio de GitHub Pages. Revisar etiquetas, foco, contraste y teclado con una auditoria accesible dedicada.

### P3-04 - Consistencia UX y manejo de errores

Persisten `window.alert/confirm/prompt`, catches vacios en PDF y un modal de pagos que permite intentar un sobrepago que el backend rechaza. Unificar mensajes y validaciones sin relajar controles de servidor.

## 10. Excepciones legacy conocidas

- No se deben crear pagos artificiales ni vincular por similitud de monto/fecha.
- Las cuentas legacy no vacias permanecen legibles, pero sin reembolso automatico seguro.
- Las cuentas vacias de Gs. 0 no requieren movimiento financiero.
- La reserva sin total requiere confirmacion administrativa del contrato.
- Los eventos historicos sin total pueden permanecer cerrados; sus reportes de cantidad no dependen del monto.

## 11. Backup y continuidad

- Firestore Scheduled Backups es la recuperacion principal mientras el restore JSON no sea corregido.
- El backup nativo de Firestore no incluye Firebase Authentication ni los objetos fisicos de Storage.
- El JSON guarda datos y referencias, no los archivos binarios.
- Debe existir un inventario separado de usuarios Auth y una politica de copia/retencion para Storage.
- Ante interrupcion de Firebase, no existe una cola offline de operaciones financieras; se requiere procedimiento manual de contingencia y conciliacion posterior.

## 12. Plan de rollback

Baseline anterior conocido: `91f5b9a` con P0-01. Si un incidente exigiera rollback funcional:

1. preservar pagos, movimientos y `secureOperations` ya creados;
2. restaurar de forma coordinada frontend y Rules compatibles;
3. no borrar Functions ni documentos procesados;
4. verificar login, rutas y lecturas antes de habilitar operacion;
5. registrar incidente, ventana y decision administrativa.

Un rollback del frontend sin restaurar Rules compatibles rompe los flujos antiguos de escritura directa, por lo que siempre debe ser coordinado.

## 13. Checklist de entrega

- [x] `main` contiene `1733fdd`, `91f5b9a` y `4c2d249`.
- [x] 63/63 pruebas aprobadas.
- [x] TypeScript y builds correctos.
- [x] P0-01 y P0-02 cerrados.
- [x] Reglas y Functions del baseline identificadas.
- [ ] Corregir los cuatro P1.
- [ ] Dejar lint global en verde y agregar CI.
- [ ] Corregir/aislar restore JSON y ejecutar simulacro.
- [ ] Probar Storage Rules por rol y estado activo.
- [ ] Conciliar Finanzas con tests por periodo y grupo.
- [ ] Reemplazar todo contenido demo/placeholder publico.
- [ ] Resolver dependencias y migrar Node antes de decommission.
- [ ] Configurar limpieza de Artifact Registry y alertas.
- [ ] Completar dominio, version y metadatos.
- [ ] Entregar manuales, propiedad de cuentas y runbook de soporte.
- [ ] Repetir UAT y auditoria; recien entonces crear `v1.0.0`.

## 14. Orden recomendado

1. Finanzas: corregir periodo, fallback legacy y deduplicacion de pendientes.
2. Storage: matriz de perfil activo/rol y tests de Rules.
3. Backup: backend seguro, allowlist, `pre_restore` y simulacro aislado.
4. Pagina publica: datos reales y retiro de demos.
5. CI/lint/dependencias/runtime/monitoreo.
6. Documentacion, dominio y entrega de propiedad.
7. Repetir validaciones completas y crear tag estable solo si P0=P1=0.

## 15. Decision de version

No se crea `v1.0.0` en esta auditoria porque existen cuatro hallazgos P1. El commit documental puede publicarse sin declarar estabilidad y debe servir como punto de partida del plan de correccion.

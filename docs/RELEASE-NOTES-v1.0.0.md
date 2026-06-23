# Release notes candidatas - Lucca Park v1.0.0

**Estado:** candidata, no etiquetada
**Base funcional:** `4c2d24915cc23d7bc705c978fd521dabe37417a2`
**Motivo:** el baseline seguro esta integrado, pero la auditoria final conserva cuatro P1 que deben cerrarse antes de publicar `v1.0.0`.

## Funciones principales

- Autenticacion con perfiles activos y roles Admin, Socio, Eventos, Recepcion y Cantina.
- Dashboard, Recepcion, visitas individuales y grupales, temporizadores y TV.
- Busqueda de responsables por cedula y vinculacion de varios ninos.
- Cantina con cuentas individuales/compartidas, inventario, anulaciones y reembolsos.
- Reservas, invitados, presupuestos, decoraciones y PDFs.
- Finanzas, cierres, reportes, clientes, responsables, cumpleanos y tareas.
- Configuracion de usuarios, pagina publica, historial y backups.

## Seguridad incorporada

### P0-01

- Perfil Firestore obligatorio, activo y con rol valido.
- Rutas y navegacion protegidas por rol.
- Administracion de usuarios restringida a Admin.
- Borrado de visitas activas limitado a Admin, Socio y Recepcion.
- Historicos criticos sin delete.

### P0-02

- 16 Firebase Functions callable para operaciones criticas.
- Calculo confiable de importes y precios en servidor.
- Payments y stock bloqueados para escritura directa del cliente.
- Confirmacion de consumos con snapshot de catalogo.
- Checkout grupal atomico y Cantina compartida contada una vez.
- Idempotencia para cobros, cierres, pagos, anulaciones y reembolsos.
- Auditoria backend con identidad derivada de Auth.

## Pruebas aprobadas

- 27/27 controles anteriores.
- 36/36 controles P0-02.
- Total ejecutado: 63/63.
- TypeScript frontend y Functions: correcto.
- Build frontend y Functions: correcto.
- Lint dirigido P0-02: correcto.

## Limitaciones legacy aceptadas

- Nueve cuentas pagadas antiguas no admiten reembolso automatico seguro por falta de relacion inequívoca con payments.
- Dos cuentas antiguas de Gs. 0 permanecen sin movimiento financiero.
- Una reserva antigua sin total contractual no admite pagos seguros hasta aprobacion administrativa.
- Dos eventos historicos permanecen cerrados sin total definido.
- No se deben fabricar pagos, relaciones o montos para normalizar estos documentos.

## Mantenimiento pendiente

- Corregir calculos financieros de periodos y pendientes grupales.
- Endurecer Storage Rules con perfil activo y roles.
- Reemplazar el restore JSON cliente por un proceso seguro y recuperable.
- Retirar contenido publico demo y datos de contacto de ejemplo.
- Resolver lint global y agregar CI.
- Revisar dependencias: frontend 1 baja/2 altas; Functions 8 moderadas; 0 criticas.
- Migrar Node 20 antes del 30/10/2026.
- Configurar limpieza de Artifact Registry y alertas.
- Reducir bundle inicial, optimizar imagenes y paginar consultas.
- Completar manuales, dominio, soporte y propiedad tecnica.

## Decision

Estas notas describen la candidata funcional basada en `4c2d249`, pero no constituyen una declaracion de estabilidad. La etiqueta anotada `v1.0.0` debe crearse solo despues de cerrar los P1, repetir las 63 pruebas y obtener lint/build limpios.

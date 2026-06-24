# Restauracion y backups de Lucca Park

## Alcance de los backups JSON

El sistema genera archivos JSON versionados como `backupVersion: 1` y `system: LUCCAPARKWEB`. Son exportaciones para auditoria, soporte y recuperacion asistida. Se guardan en Firebase Storage junto con metadata en Firestore.

La exportacion incluye perfiles de usuarios de Firestore, responsables, ninos, visitas activas e historicas, eventos e invitados, presupuestos y catalogos de eventos, configuracion de TV y pagina publica, productos y cuentas de Cantina, movimientos de inventario, cierres diarios, pagos, gastos, cierres financieros, tareas, configuracion e historial de actividad.

No incluye:

- cuentas, contrasenas ni credenciales de Firebase Authentication;
- imagenes, comprobantes, PDFs o backups nativos almacenados fisicamente en Storage;
- `canteenVoidRequests`, metadata de backups, locks internos o `secureOperations`;
- secretos, tokens y campos sensibles filtrados por el exportador.

Las URLs y rutas guardadas en documentos son solamente referencias. El JSON no contiene los bytes de esos archivos.

## Restauracion desde JSON

La restauracion directa desde el navegador esta deshabilitada. El flujo anterior escribia colecciones indicadas por el archivo en lotes independientes y no tenia snapshot preventivo, mantenimiento, verificacion final ni rollback. Una falla despues de confirmar un lote podia dejar la base parcialmente restaurada y sobrescribir datos mas recientes.

No se soportan modos Merge ni Replace desde la aplicacion. Tampoco existen rutas `restore-uploads` ni permisos para crear `restoreOperations` desde clientes. Los JSON descargados no deben cargarse manualmente contra produccion.

## Firestore Scheduled Backups

La recuperacion completa se realiza mediante Firestore Scheduled Backups desde las herramientas administrativas de Firebase o Google Cloud. Este mecanismo conserva una copia administrada de la base y evita presentar como atomica una restauracion que excede los limites de una transaccion de Firestore.

Procedimiento general:

1. El dueno o administrador tecnico declara una ventana de mantenimiento.
2. Se identifica el backup nativo correcto y se confirma proyecto, base de datos, fecha y retencion.
3. Se documenta el estado previo y se conserva el backup que servira de rollback.
4. La restauracion se ejecuta con herramientas administrativas y permisos IAM apropiados.
5. Se verifican cantidades, relaciones, pagos, stock, visitas y configuraciones antes de reabrir la operacion.
6. Si la verificacion falla, se utiliza el backup nativo previo siguiendo el mismo procedimiento controlado.

Los comandos exactos dependen del proyecto, la edicion de Firestore y los permisos disponibles. No deben improvisarse desde el navegador ni incluir credenciales en el repositorio.

## Backup preventivo, mantenimiento y rollback

La aplicacion no implementa restore JSON, por lo que no activa mantenimiento ni crea checkpoints para ese flujo. En una recuperacion nativa, la ventana de mantenimiento, el backup preventivo y el rollback son responsabilidad del procedimiento administrativo. Ninguna operacion se debe reanudar hasta completar la verificacion posterior.

Si se necesitara recuperar selectivamente datos desde un JSON, debe prepararse una migracion asistida fuera de produccion, con una lista cerrada de colecciones, validacion documental, emuladores y aprobacion del administrador. Esa migracion no forma parte de la interfaz web.

## Autorizacion

- Admin y Socio activos pueden generar y descargar backups JSON segun la matriz vigente.
- La restauracion nativa requiere al dueno o administrador tecnico con permisos administrativos de Google Cloud.
- Ningun rol puede restaurar colecciones desde el frontend.

## Recuperacion de Authentication y Storage

Firestore Scheduled Backups no recrea usuarios de Firebase Authentication ni copia objetos de Storage. La continuidad de Authentication, imagenes, comprobantes y PDFs requiere procedimientos separados. Un perfil `users/{uid}` restaurado no crea por si mismo una cuenta de Authentication.

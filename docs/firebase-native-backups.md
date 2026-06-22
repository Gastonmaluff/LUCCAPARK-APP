# Backup nativo de Firebase/Firestore

Proyecto: `luccapark-app`

## Estado actual

Firestore Scheduled Backups está activado para la base `(default)`.

- Schedule: `projects/luccapark-app/databases/(default)/backupSchedules/a675a032-e51b-4556-baee-021f51ad5b51`
- Recurrencia: `DAILY`
- Retención: `30d`
- Creado: `2026-06-02T03:41:32.295129Z`
- Backups generados al momento de activación: ninguno todavía.
- La app muestra este estado como información en Configuración > Backup de seguridad > Backup automático; la restauración nativa se hace desde Firebase/Google Cloud, no desde Restaurar desde JSON.

Este repo actualmente no tiene `functions/` ni configuración de Firebase Functions. El backup nativo recomendado es Firestore Scheduled Backups, activado manualmente desde Firebase CLI, Google Cloud CLI o Google Cloud Console.

## Estado del repo

- `firebase.json`: existe, con `firestore.rules` y `storage.rules`.
- `.firebaserc`: existe, proyecto default `luccapark-app`.
- `functions/`: no existe.
- Scripts de deploy Firebase Functions: no existen.
- Scripts actuales: Vite build/deploy a GitHub Pages.
- Firestore rules y Storage rules: existen y están separadas.

## Opción recomendada: Firestore Scheduled Backups

Crear backup diario con retención de 30 días:

```powershell
npx firebase-tools firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 30d
```

Listar schedules:

```powershell
npx firebase-tools firestore:backups:schedules:list --database "(default)"
```

Listar backups generados:

```powershell
npx firebase-tools firestore:backups:list
```

Ver detalle de un backup:

```powershell
npx firebase-tools firestore:backups:get "BACKUP_RESOURCE_NAME"
```

## Restauración nativa

Restaurar a una base nueva:

```powershell
npx firebase-tools firestore:databases:restore --backup "BACKUP_RESOURCE_NAME" --database "luccapark-restore"
```

La restauración nativa no restaura dentro de la misma base existente con upsert. Para restaurar con el mismo nombre hay que planificar downtime: borrar la base existente y restaurar usando el mismo database ID desde el backup. No ejecutar eso sin confirmación explícita.

## Requisitos manuales

Antes de activar en otro ambiente:

1. Confirmar que el proyecto Firebase/Google Cloud tiene billing habilitado si Firestore lo requiere por uso/costos.
2. Usar una cuenta con permisos IAM suficientes sobre Firestore backups.
3. Confirmar la retención deseada: máximo 14 semanas según documentación oficial.
4. Ejecutar los comandos desde una terminal autenticada con Firebase CLI.
5. Guardar el nombre completo del schedule y verificarlo con `firestore:backups:schedules:list`.

## Cloud Functions programadas

No se preparó una función programada porque este repo no tiene `functions/` ni dependencias/configuración de Functions. Para usar Cloud Functions + Cloud Scheduler habría que inicializar Functions, elegir runtime, agregar Firebase Admin SDK, configurar deploy y confirmar billing. Eso es un cambio de infraestructura y debe hacerse con autorización separada.

## Recomendación

Mantener el backup manual + automático por uso del sistema como capa adicional de export JSON de colecciones principales. Firestore Scheduled Backups ya queda activo como respaldo nativo de infraestructura para `luccapark-app`.

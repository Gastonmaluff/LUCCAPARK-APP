# Lucca Park App

Base web para Lucca Park, un parque infantil con landing publica, panel administrativo, recepcion, vista TV, eventos privados y cantina operativa.

## Stack

- Vite
- React + TypeScript
- React Router
- Firebase Auth, Firestore y Storage preparados
- GitHub Pages con fallback SPA

## Rutas

- `/`: landing publica
- `/disponibilidad`: calendario publico
- `/precios`: paquetes demo
- `/contacto`: contacto y WhatsApp
- `/login`: acceso interno preparado para Firebase Auth
- `/admin`: dashboard propietario/admin
- `/admin/dashboard`: dashboard propietario/admin
- `/admin/recepcion`: vista administrativa de recepcion
- `/admin/reservas`: gestion de reservas/eventos
- `/admin/calendario`: calendario administrativo
- `/admin/cantina`: productos, cuentas abiertas y ventas de cantina
- `/admin/finanzas`: cierre diario basico
- `/admin/reportes`: reportes
- `/admin/configuracion`: configuracion
- `/recepcion`: portal operativo con modo visita normal y modo evento
- `/tv`: vista optimizada para pantalla grande

En GitHub Pages sin dominio propio se sirven bajo `/LUCCAPARK-APP/`.

## Desarrollo local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Publicar en GitHub Pages

```bash
npm run deploy
```

Mas detalle en [`docs/github-pages.md`](docs/github-pages.md).

## Firebase

La configuracion vive en `src/config/firebase.ts` y puede venir desde variables `VITE_FIREBASE_*`.
El archivo `.env.example` contiene la configuracion web recibida para este proyecto.

Las rutas internas (`/admin/*`, `/recepcion` y `/tv`) estan protegidas con Firebase Auth.
Para operar el sistema se debe crear el usuario desde Firebase Authentication y entrar por `/login`.

Las reglas base de Firestore estan en `firestore.rules` y permiten leer/escribir las colecciones operativas solo a usuarios autenticados. Para publicarlas:

```bash
npx firebase-tools deploy --only firestore:rules --project luccapark-app
```

Para recepcion normal, `VITE_VISIT_STORAGE_MODE` controla el origen de datos:

- `firestore`: usa Firebase/Firestore real.
- `local`: modo temporal en este navegador, util si Firestore no esta disponible.

Con Firestore creado, el modo por defecto es `firestore`. Si se necesita trabajar sin Firebase, definir `VITE_VISIT_STORAGE_MODE=local`.

## Recepcion normal

La Fase 3 implementa el flujo normal real:

- `/recepcion` y `/admin/recepcion`: registran ingresos, cobran salida y finalizan visitas.
- `/tv`: muestra en tiempo real las visitas activas en modo normal.
- Los temporizadores se calculan con `startedAt`, `durationMinutes` y la hora actual, por lo que sobreviven a recargas y se ven igual en varias pantallas.

La estrategia de datos usa `activeVisits` para lectura rapida en recepcion/TV y `visits` como historico. Al finalizar una visita se actualiza `visits` con `status: finished`, `endedAt` y `realDurationMinutes`, y se retira la copia activa de `activeVisits`.

## Eventos privados

La Fase 4 implementa el flujo real de cumpleanos/evento privado:

- `/admin/reservas`: crea eventos reales, activa/finaliza eventos, revisa invitados y configura la TV del evento.
- `/recepcion` y `/admin/recepcion`: permiten cambiar a modo evento privado y registrar invitados sin temporizador.
- `/tv`: prioriza el modo evento cuando existe un evento `active` con `tvModeEnabled`.

Los invitados se guardan en `eventGuests` y el evento mantiene `registeredGuestsCount`. El registro de invitado usa una transaccion para incrementar el contador y marcar si el nino queda dentro del cupo o como adicional.

Decision de TV: si hay un evento activo, la pantalla `/tv` muestra el evento y no los temporizadores normales. Al finalizar el evento, `/tv` vuelve al modo normal.

## Cantina y cierre diario

La Fase 5 implementa una primera version real y operativa de cantina:

- `/admin/cantina`: administra productos, busca/filtra por categoria, activa/desactiva productos y controla stock simple.
- Cuentas de cantina: pueden ser `visit`, `event` o `free`.
- Cuentas abiertas: permiten agregar productos, cobrar o cancelar sin borrar registros.
- Ventas pagadas del dia: muestran hora, tipo de cuenta, asociado, productos resumidos, total y metodo de pago.
- Recepcion: cada visita activa muestra un acceso discreto a cantina si tiene consumo abierto.
- Eventos: el detalle del evento muestra total consumido en cantina y cuentas pendientes asociadas.
- `/admin/finanzas`: calcula cierre diario con visitas, cantina, pendientes, operacion del dia y metodos de pago.

La estrategia de stock es simple: si un producto tiene `stock` definido, se descuenta al crear/agregar consumo y se restaura si la cuenta se cancela. El inventario avanzado queda para una fase posterior.

Al guardar el cierre diario se escribe en `dailyClosings` usando la fecha como id de documento. Si ya existe un cierre para esa fecha, la interfaz avisa que hay un cierre guardado y permite actualizarlo/recalcularlo.

## Colecciones previstas

- `users`
- `customers`
- `children`
- `visits`
- `activeVisits`
- `events`
- `eventGuests`
- `eventBudgets`
- `tvDisplaySettings`
- `landingContent`
- `canteenProducts`
- `canteenOrders`
- `canteenInventoryMovements`
- `dailyClosings`
- `payments`
- `settings`

## Datos demo

Los datos visuales de Fase 1 estan separados en `src/data/demoData.ts`. No son datos reales ni se mezclan con Firestore.

## Navegacion interna

El admin usa rutas hijas bajo `/admin/*` y `NavLink` para marcar el modulo activo sin recargar la app. La ruta `/admin` redirige a `/admin/dashboard`.

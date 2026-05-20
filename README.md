# Lucca Park App

Base web de Fase 1 para Lucca Park, un parque infantil con landing publica, panel administrativo, recepcion y vista TV.

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

Colecciones previstas:

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

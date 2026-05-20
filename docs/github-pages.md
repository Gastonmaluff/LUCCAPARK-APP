# Publicacion en GitHub Pages

Este proyecto usa Vite + React Router con `BrowserRouter` y `basename` tomado de `import.meta.env.BASE_URL`.

## Mientras se usa GitHub Pages sin dominio propio

La URL esperada es:

```text
https://gastonmaluff.github.io/LUCCAPARK-APP/
```

Para publicar:

```bash
npm install
npm run deploy
```

El script `deploy` ejecuta `build:pages`, que compila con:

```bash
vite build --base=/LUCCAPARK-APP/
```

Tambien se incluye `public/404.html` para recuperar rutas internas de SPA si alguien refresca directamente:

```text
/LUCCAPARK-APP/admin
/LUCCAPARK-APP/recepcion
/LUCCAPARK-APP/tv
```

## Cuando haya dominio propio

Cambiar el build a base raiz:

```bash
npm run build
```

Con dominio propio las rutas conceptuales quedan limpias:

```text
/
/admin
/recepcion
/tv
/login
```

Si se mantiene GitHub Pages como hosting con dominio propio, agregar el archivo `CNAME` dentro de `public/` con el dominio del cliente.

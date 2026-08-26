# Geocoding — puesta en marcha

Cómo activar el buscador de direcciones con cobertura real de EE. UU.

El proveedor actual (OpenStreetMap / Nominatim) no tiene muchas direcciones
residenciales de Florida. El caso reportado por el cliente,
`862 62nd St Cir E, Bradenton, FL`, no aparece en ninguna de sus cuatro formas
posibles — ni siquiera añadiendo el código postal — porque la calle no está en
sus datos. Ese dato sí está en el registro oficial del condado de Manatee, que
forma parte de **OpenAddresses**, y **Geoapify** construye su buscador sobre
OpenAddresses.

Su plan gratuito son **3.000 consultas al día** (~90.000 al mes) sin tarjeta de
crédito. Esta plataforma necesita entre 1.000 y 3.500 **al mes**: menos del 4 %
del cupo.

---

## 1. Crear la cuenta (5 minutos, sin tarjeta)

1. Entra en <https://www.geoapify.com> y pulsa **Sign Up** (arriba a la derecha).
2. **Create an account**: correo electrónico y contraseña. **No pide tarjeta de
   crédito.**
3. Te llega un correo de verificación. Confírmalo.
4. Ve a **My Projects** → **Create a project**. Ponle un nombre, por ejemplo
   `Xpert Connect`.
5. Al abrirse la página del proyecto, **la primera API key se genera sola**.
   Cópiala: es una cadena hexadecimal larga.

---

## 2. ⚠️ NO restrinjas la clave por dominio ni por origen

Geoapify permite limitar una clave por *allowed origins*, *HTTP referrers* o
*CORS*. **Aquí eso rompería el buscador**, y de forma silenciosa.

El motivo: esta plataforma **nunca llama a Geoapify desde el navegador**. Todas
las llamadas salen del servidor de Next.js a través de `/api/geocode`, por una
decisión de privacidad deliberada — las direcciones que se geocodifican son
domicilios de clientes de un bufete de lesiones personales, y no deben salir del
navegador de nadie hacia un tercero. Ese es también el motivo de que la clave se
llame `GEOAPIFY_API_KEY` y **no** `NEXT_PUBLIC_GEOAPIFY_API_KEY`.

Una petición hecha desde un servidor no lleva cabecera `Origin` ni `Referer`, así
que cualquier restricción de ese tipo las rechazaría todas.

La restricción por **IP** tampoco sirve en Vercel: las IP de salida son dinámicas
salvo que se contrate el plan con IP estáticas.

**Deja la clave sin restricciones.** Lo que la protege es que nunca llega a un
navegador, y que `/api/geocode` aplica su propio límite por usuario.

---

## 3. Configurarla en desarrollo

En `.env.local`, añade dos líneas:

```bash
GEOCODER_PROVIDER=geoapify
GEOAPIFY_API_KEY=la-clave-que-copiaste
```

Reinicia `npm run dev`. No hay nada más que tocar: la capa de adaptadores ya
está escrita y los cuatro proveedores comparten el mismo contrato.

---

## 4. Configurarla en producción (Vercel)

1. Panel de Vercel → el proyecto → **Settings** → **Environment Variables**.
2. Añade las dos variables, marcando **Production** (y **Preview** si quieres que
   las ramas también la usen):
   - `GEOCODER_PROVIDER` = `geoapify`
   - `GEOAPIFY_API_KEY` = la clave
3. **Redeploy.** Las variables de entorno no se aplican a un despliegue ya hecho.

---

## 5. Comprobar que funciona

**a) La comparación entre proveedores** — lo más útil, y gratis:

```bash
npm run geocode:bakeoff
```

Debe listar `geoapify` entre los proveedores activos y resolver
`862 62nd St Cir E, Bradenton, FL`. Para medirlo contra direcciones reales del
cliente:

```bash
npx tsx scripts/geocode-bakeoff.ts --sample=30
```

La tabla final distingue dos cosas: `found` (que el buscador deje de fallar) y
`rooftop or parcel` (que la distancia a la clínica más cercana signifique algo).

**b) El chequeo de salud** — `GET /api/health` como admin. La comprobación
`env_geocoder` falla si has puesto `GEOCODER_PROVIDER=geoapify` sin la clave:
sin ese aviso la app caería a Nominatim en silencio y parecería que la clave
funciona cuando no.

**c) En la aplicación** — abre `/professionals/map`, escribe la dirección
reportada y comprueba que aparece, que el chip muestra `Bradenton, FL 34208` y
que debajo del desplegable se lee **«Powered by Geoapify»**.

---

## 6. La atribución es obligatoria

El plan gratuito permite uso comercial **a condición de mostrar la atribución**.
Ya está implementada: `ATTRIBUTION` en `src/lib/geocoding/constants.ts` y el
`SuggestionGroup` la pinta bajo las sugerencias.

No hay nada que hacer — pero tampoco se puede quitar. Es una cláusula de
licencia, y borrarla no rompería nada que ningún test o error de ejecución vaya
a señalar nunca.

---

## 7. Re-geocodificar las fichas existentes

Con la clave activa, las ~880 clínicas y despachos ya guardados se pueden
corregir. El script es reanudable y no escribe nada sin `--apply`:

```bash
npm run backfill:geocode                 # simulacro: enseña qué haría
npm run backfill:geocode -- --apply      # escribe
```

Dos salvaguardas que conviene conocer antes de ejecutarlo:

- **Una ficha que se movería más de 2 millas NO se escribe** sin `--force`. Se
  lista para que la mire una persona. Un geocodificador que reubica en silencio
  una clínica real cuarenta millas es peor que uno que no encuentra nada.
- Las que no se resuelvan quedan marcadas con `geocode_precision = 'unknown'` y
  **se listan**, en vez de quedarse calladas en (0, 0).

Al final imprime un resumen por precisión. Ese número —cuántas fichas están
realmente sobre el edificio correcto— no ha tenido respuesta hasta ahora.

---

## Si el cupo diario se queda corto

Sería sorprendente: harían falta veinticinco veces el uso previsto. Si pasara,
`/api/geocode` devuelve **429** y el desplegable dice *«Too many lookups. Try
again in a moment.»* en vez de fingir que la dirección no existe.

El siguiente escalón es **Mapbox**, por unos 3 $/mes, y el cambio sigue siendo
una línea:

```bash
GEOCODER_PROVIDER=mapbox
MAPBOX_ACCESS_TOKEN=...
```

Antes de contratarlo hay una pregunta pendiente de confirmar por escrito con
Mapbox: si sus términos exigen mostrar los resultados sobre un mapa de Mapbox.
Su propia documentación incluye ejemplos de uso sin mapa, lo que sugiere que no,
pero eso no es un contrato.

---

## Qué NO hace falta

- **Tarjeta de crédito.** Ni para la cuenta ni para el plan gratuito.
- **Migrar el mapa.** Geoapify no exige mostrar sus resultados sobre un mapa
  suyo, así que Leaflet y OpenStreetMap se quedan como están. (Google sí lo
  exige: por eso está descartado salvo que se quiera el mapa de Google.)
- **Tocar código.** La elección de proveedor es una variable de entorno.

# Motor de direcciones propio — puesta en marcha

Cómo poner en producción el buscador de direcciones que no consulta a nadie.

Todo el código está en `main` y **no cambia nada** hasta que se toque una
variable de entorno. Hasta entonces el buscador sigue usando Geoapify
exactamente como hoy.

---

## Qué es y qué no es

Es un geocodificador de **direcciones postales de Florida y Minnesota**,
construido sobre los registros oficiales de dirección que publican los propios
condados (144 fuentes, 17,1 millones de puntos, 567.767 calles).

**No** busca negocios por su nombre, **no** entiende lenguaje natural y **no**
sabe nada fuera de esos dos estados. Nada de eso está en el alcance. Para todo
ello, la cadena de proveedores sigue cayendo en Geoapify, que se queda puesto
como red de seguridad.

### Por qué merece la pena, con números

Medido sobre 201 direcciones verificadas contra el registro del condado:

| | Geoapify | Motor propio |
|---|---:|---:|
| encuentra la dirección | 100 % | 100 % |
| **acierta dentro de 50 m** | **71,1 %** | **100 %** |
| error mediano | 23,8 m | 0,4 m |
| error p95 | 780,9 m | 0,6 m |
| latencia p50 / p95 | 699 / 1272 ms | 5 / 13 ms |

Hay que decir la letra pequeña: ese corpus sale de los mismos registros con los
que se construyó el índice, así que demuestra que el motor **devuelve fielmente
lo que el condado dice**, no que el condado acierte. La prueba independiente son
las 876 fichas reales de la plataforma, tecleadas por personas y resueltas con
otro proveedor: **97,5 % de cobertura**.

Y el hallazgo que motivó buena parte de esto: **Geoapify etiqueta el 100 % de
sus resultados como «tejado», pero solo el 71 % cae dentro de 50 m.** Como
`isExactPrecision` es la puerta que decide si la interfaz muestra «Aproximado —
arrastra el pin», ese aviso **no ha saltado nunca**, justo en el ~29 % de casos
donde hacía falta. Aquí «tejado» significa que el registro del condado tiene ese
número de portal *y* que se pudo confirmar la ubicación. Cualquier otra cosa lo
dice.

---

## Dónde vas

```bash
npx tsx scripts/geo/status.ts
```

Dice qué partes existen ya en tu base de datos y cuál es el siguiente paso. No
escribe nada. Úsalo antes y después de cada paso — cuatro de las cinco piezas
viven fuera del repositorio y el código no puede decirte cuáles están puestas.

---

## Paso 1 — Aplicar la migración, parte 1

Abre el **SQL Editor** de Supabase (proyecto de producción) y ejecuta la
**PARTE 1** de:

```
scripts/migrations/2026-09-geo-index.sql
```

Crea la extensión `pg_trgm` (la primera del proyecto), las dos tablas y la clave
única. No toca ninguna tabla existente.

> **El orden importa.** La parte 2 construye el índice de trigramas y va
> **después** de cargar los datos. Crearlo antes obliga a Postgres a mantenerlo
> fila a fila durante 567.767 inserciones, y convierte una carga de veinte
> minutos en varias horas.

---

## Paso 2 — Construir el índice

En tu máquina, una sola vez:

```bash
npx tsx scripts/geo/fetch-openaddresses.ts     # ~515 MB, reanudable
NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/geo/build-index.ts
```

La descarga tarda unos minutos; el indexado, unos veinte. Al final imprime el
informe de tamaño proyectado:

```
  total                          240.2 MB   of 500 MB
  ✓ PASS  gate is 350 MB — 110 MB of headroom, stay in Postgres
```

Si esa puerta fallara, **no sigas**: el plan previsto era mover
`geo_street_points` a Supabase Storage antes de cargar nada.

---

## Paso 3 — Crear la función de búsqueda

En el SQL Editor: `scripts/migrations/2026-09-geo-search.sql`.

> Va **aquí**, y no al final, a propósito. Solo depende de que existan las dos
> tablas: Postgres valida el cuerpo de una función `language sql` al crearla,
> así que si `pg_trgm` no se hubiera instalado bien, esto falla en dos segundos
> con `operator does not exist: text % text`. Descubrirlo ahora es gratis;
> descubrirlo después de cargar cuesta cuarenta minutos.

Si `status.ts` sigue diciendo que la función no existe justo después de crearla,
espera unos segundos: PostgREST recarga su caché de esquema con un pequeño
retraso.

---

## Paso 4 — Cargar

```bash
npx tsx scripts/geo/load-index.ts                    # ensayo, no escribe nada
npx tsx scripts/geo/load-index.ts --apply --truncate
```

Entre veinte y cuarenta minutos. Es reanudable: si se corta, relánzalo con
`--from=<la última cifra que imprimió>`.

Verifica el ida y vuelta de los `bytea` con la primera fila antes de escribir las
otras 567.766. Si eso fallara, se detiene ahí — un fallo de codificación
silencioso pondría coordenadas verosímiles y equivocadas en toda la base.

---

## Paso 5 — Migración, parte 2

De nuevo en el SQL Editor: la **PARTE 2** de
`scripts/migrations/2026-09-geo-index.sql` — el índice de trigramas, los dos
btree y el `analyze`. Tarda varios minutos.

> **Solo si tu base se creó antes del 3 de septiembre de 2026**, ejecuta también
> `scripts/migrations/2026-09-geo-column-types.sql`. La versión original de la
> parte 1 declaraba `state char(2)` y `zip char(5)`, y como la función de
> búsqueda recibe `text`, Postgres convertía la **columna** — lo que inutiliza
> cualquier índice sobre ella y, por la regla del `BitmapOr`, arrastraba también
> al índice de trigramas. Coste medido: 1.400 ms de trabajo de base de datos en
> vez de 42. La parte 1 ya está corregida, así que una instalación nueva no lo
> necesita.

> Una versión anterior de esa función bajaba el umbral de trigramas con una
> cláusula `SET`, y Supabase la rechaza: `ERROR: 42501: permission denied to set
> parameter "pg_trgm.similarity_threshold"` — el rol `postgres` de Supabase no es
> superusuario. Ya no lo hace: el umbral se queda en el 0,3 por defecto y la
> generosidad se compra donde sale barata, dentro del código postal o la ciudad
> que traiga la consulta. Salió **mejor**: la cobertura sobre tus 876 fichas pasó
> de 97,4 % a 97,5 %.

---

## Paso 6 — Activarlo

En Vercel, **Settings → Environment Variables**:

```
GEOCODER_PROVIDER = selfhosted
```

Y redespliega. No hay clave de API que poner: ese es el objetivo.

Comprueba `/api/health`. El chequeo `env_geocoder` ahora cuenta las filas de
`geo_street` y falla si son menos de 500.000 — un despliegue apuntando a una base
sin migrar fallaría **todas** las búsquedas cayendo en silencio a Geoapify, y ese
es exactamente el problema que este chequeo existe para no esconder.

### Volver atrás

Cambia `GEOCODER_PROVIDER` a `geoapify` y redespliega. Nada más. Las tablas
pueden quedarse donde están.

---

## Rendimiento — cómo leer las cifras

Medido con el índice cargado y los índices construidos:

| | |
|---|---:|
| búsqueda: trabajo real de base de datos | **42 ms** |
| lectura de los blobs de coordenadas | ~0 ms |
| viajes de ida y vuelta por autocompletado | 2 |

El banco de pruebas informa 581 / 864 ms p50/p95, y esa cifra **no es la que verá
el usuario**: está medida desde una máquina de desarrollo hasta la región de
Supabase, donde un solo viaje de ida y vuelta cuesta 220-320 ms. Las funciones de
Vercel están junto a la base de datos. Lo único que se puede afirmar desde aquí
es lo que cuesta la base: 42 ms.

Si el buscador se nota lento en producción, la primera pregunta es si algún
índice se perdió. `scripts/geo/diagnose.sql` responde eso en cuatro bloques de
solo lectura, y el bloque 5 imprime el plan real de la función.

---

## Comprobación manual

En `/professionals/map`:

1. `862 62nd St Cir E, Bradenton, FL` — la dirección que reportó el cliente.
   Debe resolver con precisión de tejado.
2. `1531 SE 17th St Unit 101/102, Ocala, FL 34471` — el caso de la unidad doble.
3. Escribir `62nd st cir` sugiere la calle sin el número.
4. Una dirección inexistente sigue ofreciendo «Place the pin yourself».
5. `2500 Harbor Blvd, Punta Gorda, FL 33950` — el registro lo sitúa en Port
   Charlotte, la ciudad contigua. Es correcto, y la ficha guardada está a 9,8 km.

---

## Mantenimiento

Un flujo de GitHub Actions (`.github/workflows/geo-refresh.yml`) reingiere los
registros **cuatro veces al año** y escribe solo lo que cambió: si ningún condado
publicó nada nuevo, no escribe nada. Se puede lanzar a mano desde la pestaña
**Actions** cuando alguien reporte una dirección que falta.

Esto es deuda permanente, no un coste único. Los datos caducan.

---

## Herramientas de diagnóstico

Cuando una búsqueda falle, la primera pregunta es si falta el dato o falla el
motor. Esto las separa:

```bash
# ¿está la dirección en el índice? y ¿qué devuelve el motor?
npx tsx scripts/geo/inspect.ts "862 62nd St Cir E, Bradenton, FL 34208" --engine

# ¿sigue el parser alcanzando el índice? (>= 98 % en los cuatro estilos)
npx tsx scripts/geo/gate-parser.ts

# ¿cuánto encuentra de las fichas reales de la plataforma?
npx tsx scripts/geo/gate-coverage.ts

# comparar contra Geoapify sobre el mismo corpus
npx tsx scripts/geo/benchmark.ts --provider=local        # el índice en memoria
npx tsx scripts/geo/benchmark.ts --provider=selfhosted   # contra Postgres real
npx tsx scripts/geo/benchmark.ts --provider=geoapify
```

Las líneas base quedan guardadas en `docs/geo-baseline.json`, en el repositorio,
para que cualquier afirmación futura de mejora tenga que superar un número
escrito y no uno recordado.

---

## Lo que sigue sin resolver

- **Geocodificación inversa** (arrastrar el pin, «usar mi ubicación») no está
  implementada en el motor propio: hace falta un índice espacial que hoy no
  existe. Devuelve vacío y la cadena cae en Geoapify, que es quien lo hace hoy.
  El comportamiento visible no cambia.
- **22 de las 876 fichas** no las encuentra. Casi todas son fichas sin dirección
  de calle — solo ciudad y código postal — o texto libre como
  `Janet Ct / Spring Hill area (consultar ubicación exacta por llamada)`.
- **Al menos una ficha tiene la coordenada mal guardada**: `c-516`, Gundersen
  Health System de Caledonia (Minnesota), está apuntada en **Vermont**
  (`44.42, -72.01`). Lo encontró la puerta de cobertura. Merece una revisión de
  las 233 fichas que discrepan más de 50 m.

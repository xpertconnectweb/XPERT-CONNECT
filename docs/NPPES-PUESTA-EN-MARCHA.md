# NPPES — puesta en marcha

Cómo traer ortopedistas y neurocirujanos reales al directorio, y cómo volver a
hacerlo cuando el cliente pida otra especialidad.

El directorio nació de listados de clínicas quiroprácticas y de rehabilitación.
El lado quirúrgico nunca se cargó, y se notaba: de 697 clínicas había **una**
con la etiqueta `Orthopedics`, doce con `Orthopedic Rehabilitation`, y **cero**
neurocirugía — la palabra no aparecía ni en los datos ni en el código.

La fuente es **NPPES**, el registro nacional de proveedores de CMS. Es de
dominio público, no pide clave, y es lo único gratuito que da la dirección de
consulta y el teléfono de una organización con nombre. No da web ni email: esas
columnas quedan vacías y son trabajo de otro día.

---

## 1. Lo que hay que saber de la API antes de tocarla

Cuatro cosas, todas comprobadas a mano contra el endpoint. Cada una habría
costado horas de descubrir tarde.

**`address_purpose=LOCATION` no es opcional.** Sin él, `state=MN` casa contra la
dirección *postal*, y el primer resultado es un cirujano de Scottsdale, Arizona.

**`taxonomy_description` acepta solo el nombre de la CLASIFICACIÓN.** Las
subespecialidades que la propia API devuelve — `"Orthopaedic Surgery, Hand
Surgery"` — son rechazadas como consulta. Devuelve error 14 y cero resultados,
que es indistinguible de "no hay ninguna".

**La consulta padre ya incluye las subespecialidades.** Buscar
`Orthopaedic Surgery` devuelve registros cuya taxonomía es
`Orthopaedic Surgery, Sports Medicine`. No hay nada que ganar dividiendo por
subespecialidad — y tampoco se podría, por lo anterior.

**`limit` topa en 200 y el paginado se satura en `skip=1200`.** A partir de ahí
la API sigue respondiendo 200 filas, pero son las mismas 200. El script lo
detecta mirando si una página aporta algún NPI nuevo, nunca fiándose del conteo.

Florida en ortopedia supera ese techo, así que se parte **por ciudad**. Es el
único eje que sirve: los comodines de `postal_code` ignoran `address_purpose` y
arrastran resultados de California.

---

## 2. El problema de los nombres

Es lo más sorprendente de estos datos y conviene entenderlo antes de ejecutar
nada: **las mejores direcciones no traen nombre**.

`200 1ST ST SW, Rochester` tiene 274 ortopedistas y neurocirujanos, y ninguna
organización dada de alta con taxonomía ortopédica — porque la organización que
hay allí es Mayo Clinic, y Mayo está registrada como clínica multiespecialidad.
Cerca de la mitad de las direcciones que merecen la pena están en esa situación,
y `clinics.name` es `NOT NULL`.

`scripts/nppes/resolve-names.ts` lo resuelve con una segunda consulta que quita
el filtro de taxonomía y pregunta quién está dado de alta en ese código postal.
Eso devuelve a todo el mundo — el intérprete, la farmacia y el proveedor de
material ortopédico del mismo pasillo — así que hay un orden de preferencia por
taxonomía y una lista de descarte. Resultado: 265 direcciones nombradas de 293,
con nombres como `Mayo Clinic-Rochester`, `Regions Hospital` y
`The Duluth Clinic, LTD`.

Las 28 que siguen sin nombre **no se cargan**. Una fila llamada "Práctica
desconocida" es peor que no tener la fila.

---

## 3. Ejecutar el pipeline

```bash
# 1. Cosechar el registro. ~7 min. Cachea en data/nppes/ y se puede reanudar.
npx tsx scripts/nppes/fetch.ts

# 2. Nombrar lo que la búsqueda por taxonomía no pudo nombrar. ~5 min.
#    Cachea cada código postal en data/nppes/raw-byzip/, así que reejecutar
#    después de tocar el ranking no cuesta ni una llamada.
npx tsx scripts/nppes/resolve-names.ts

# 3. Agrupar, filtrar, etiquetar y comparar contra lo que ya hay.
#    No toca la base de datos. Deja data/nppes/report.md — léelo.
npx tsx scripts/nppes/build-practices.ts --confirmed

# 4. Geocodificar y cargar. Sin --apply no escribe nada.
npx tsx scripts/geo/status.ts
GEOCODER_PROVIDER=selfhosted GEOCODER_FALLBACK=geoapify \
  npx tsx scripts/nppes/push.ts --state=MN --limit=25   # una rodaja primero
GEOCODER_PROVIDER=selfhosted GEOCODER_FALLBACK=geoapify \
  npx tsx scripts/nppes/push.ts --apply

npm run validate:schema
```

**Nunca** ejecutes `scripts/restore-clinics.ts` ni `scripts/import-clinics-json.js`
en este flujo. El primero resubiría el snapshot de 696 filas de
`data/clinics.json` y revertiría cualquier edición hecha desde el panel de
administración y cualquier coordenada mejorada por `backfill:geocode --restale`.
El segundo reasigna los IDs `c-001…` desde cero y rompería las claves ajenas de
`referrals`.

---

## 4. Los filtros de calidad, y qué dejan fuera

Se agrupa por dirección de consulta normalizada. Sobre 6.705 proveedores
cosechados salen 2.581 direcciones distintas, de las cuales pasan 1.708:

| Se descarta | Motivo |
|---|---|
| 759 | nadie que la nombre (una sola persona y ninguna organización) |
| 406 | la consulta es de otro estado — `state` casa también contra la postal |
| 52 | un solo proveedor en un domicilio particular (APT/UNIT) |
| 24 | la dirección no empieza por número |
| 3 | apartado de correos |

Un `APT` con varios proveedores **no** se descarta: es una suite mal etiquetada
en un edificio médico. Con uno solo, es la casa de alguien.

De las 1.708 que pasan hay dos maneras de elegir cuáles cargar.

`CAPS` en `build-practices.ts` es un tope de **cantidad**: las N mejores por
puntuación, por estado y especialidad. Se usó en la primera importación, mientras
todavía se estaba aprendiendo la forma de los datos.

`--confirmed` es un tope de **calidad**, y responde a una pregunta mejor —
cuáles sabemos que son reales— en lugar de a cuántas queremos. Exige tres cosas,
y cada una descarta algo concreto que se ha visto en los datos, no una hipótesis:

- **Dos médicos como mínimo en la dirección.** Un solo médico con una razón social
  registrada es exactamente el aspecto de la sociedad unipersonal de facturación,
  y en Florida hay miles. De las 1.332 retenidas en la segunda pasada, **1.174
  caían por esto**.
- **Un teléfono utilizable.** Este directorio existe para derivar a alguien a algún
  sitio; una fila a la que no se puede llamar no es una derivación.
- **Un nombre de una organización registrada en esa dirección**, no uno deducido
  para ella. Los deducidos por código postal se inspeccionaron uno a uno: junto a
  aciertos claros (`Orthopedic Center of Florida`, `All Florida Orthopaedic
  Associates`) salían `Alzheimers Diagnostic Centers`, `Anesthesia Dynamics LLC` y
  un `Public Health Trust of Miami Dade` colgado de una suite en Plantation.
  Etiquetar eso como ortopedia sería inventar. `--names=any` los admite, y no
  debería usarse sin volver a mirar la muestra.

La cuarta y última prueba la aplica el geocodificador al cargar: la dirección tiene
que resolver al código postal o a la ciudad que declara el registro.

**Lo que cualquiera de los dos deja fuera se cuenta en el informe, con el motivo**,
nunca se traga en silencio.

---

## 5. Fusionar en vez de duplicar — y cuándo NO fusionar

Cuando una práctica encontrada ya está en el directorio, **no se inserta una
segunda fila**: se emite un parche que añade las etiquetas que le faltan.

Hay dos formas de reconocerla, y la segunda casi provoca un desastre. El emparejamiento
por dirección normalizada es fiable. El emparejamiento de respaldo por **nombre +
código postal** fue correcto en la primera importación —25 de 25 casaron por
dirección, el respaldo ni llegó a dispararse— y se volvió peligroso en la segunda,
en cuanto hubo 334 filas de sistemas hospitalarios multi-sede contra las que
comparar: acertó **3 de 12**. Iba a fundir `745 Meadows Rd` dentro de `800 Meadows
Rd`, una dirección de Pompano Beach dentro de otra de Deerfield Beach, y el
edificio entero de ortopedia de la Universidad de Florida en Jacksonville
(`655 W 8th St UFJP Orthopedics`) dentro del de neurocirugía calle abajo.

Una fusión **borra** una práctica. Una heurística que se equivoca tres de cada
cuatro veces borra sobre todo sitios reales. Ahora el respaldo exige además que
coincida el **número de portal**, lo que separa "escrito de dos maneras" de "otro
sitio en el mismo código postal": con esa regla, los 12 casos salen bien.

El parche guarda las dos direcciones, la previa y la candidata. Un registro de
algo descartado que no dice qué descartó no se puede revisar ni deshacer.

**Dos plantas de un mismo edificio se quedan como dos filas.** `streetCore` quita
`suite`, `unit` y `floor`, pero no la abreviatura `Fl 2`. En Broward Health eso deja
`1601 S Andrews Ave Fl 2` (ortopedia) y `Fl 3` (neurocirugía) como filas separadas —
y está bien, porque cada una tiene su teléfono directo y su especialidad: quien
deriva un caso de neurocirugía marca la línea de neurocirugía. Si alguna vez hay
que unificarlas, la palanca es `streetCore`, con la advertencia de que cambiarla
invalida las claves ya escritas en `org-names.json`.

Es la mitad del arreglo, y la menos obvia. `Summit Orthopedics Physical Therapy`
llevaba desde el principio con `Orthopedic Rehabilitation, Physical Therapy` — y
la propia `Summit Orthopedics, LTD` está en esa misma dirección. Ahora esa fila
gana `Orthopedics` y `Sports Medicine` sin crear una gemela.

`clinics` no tiene ninguna restricción de unicidad de negocio, así que esta
deduplicación en el script es la única defensa que hay contra las filas gemelas.
Los IDs son deterministas (`n-<NPI>`), de modo que volver a ejecutar actualiza en
lugar de duplicar.

`merges.json` guarda las etiquetas previas de cada fila parcheada, para poder
deshacerlo.

---

## 6. Geocodificación: por qué el filtro es el sitio y no la distancia

`backfill-geocode.ts` compara la coordenada nueva contra la vieja y frena los
saltos largos. Estas filas no tienen coordenada vieja, así que no hay nada de lo
que saltar. Lo que sí tienen es un código postal y una ciudad salidos de un
registro federal, así que la pregunta no es cuánto se movió sino si acertó el
sitio.

**El código postal por sí solo no basta**, y el motivo merece saberse: algunas
organizaciones grandes tienen un código postal **exclusivo**, asignado a ellas y
no a una zona. Mayo Clinic es dueña del 55905. Ningún geocodificador puede
devolverlo, porque no es un lugar del mapa: el motor propio contestó 55917 y
Geoapify contestó 55902. Por eso se acepta **mismo código postal o misma
ciudad**, y se rechaza lo demás — que es lo que este filtro existe para cazar:
55917 es Claremont, a sesenta kilómetros.

Lo que se acepta solo por ciudad se lista en la salida, con nombre y dirección.

Lo que no se resuelve **no se inserta**. Va a `data/nppes/unresolved.json` con su
motivo. Nunca se escribe `lat: 0, lng: 0` — es el valor que `hasRealCoordinates`
filtra fuera del mapa y que la API de administración rechaza, y crearía filas que
inflan todos los conteos y no aparecen en ninguna parte. Una práctica que no se
puede situar no es un dato, es una tarea pendiente.

---

## 7. Añadir otra especialidad más adelante

1. Añade el nombre de la clasificación a `TAXONOMIES` en `scripts/nppes/fetch.ts`.
   Tiene que ser el nombre de la CLASIFICACIÓN — compruébalo contra la API antes,
   porque un valor inválido devuelve cero resultados sin decir por qué.
2. Añade la etiqueta canónica a `CLINIC_SPECIALTIES` en
   `src/lib/clinic-specialties.ts`, y las cadenas exactas que devuelve NPPES a
   `ALIASES`. Prefiere mapear las subespecialidades a etiquetas **que ya
   existan**: una etiqueta por subespecialidad parte un conteo en ocho y entierra
   las ocho.
3. Si el cliente quiere verla fija bajo el buscador, añádela a
   `FEATURED_SPECIALTIES`. Hay un test que comprueba que todo lo que hay ahí
   existe en el catálogo — sin él, una errata simplemente no promociona nada y
   nadie se entera.
4. Añade el prefijo de código de taxonomía a `tagsFor` en `build-practices.ts`.
   El código es más fiable que la descripción: no se puede escribir de dos
   maneras.
5. Sube el `CAPS` correspondiente.

---

## 8. Verificación

```sql
-- Antes y después. Esta es la línea base.
SELECT s.value AS specialty, count(*) AS n
FROM clinics c, jsonb_array_elements_text(c.specialties) AS s(value)
GROUP BY 1 ORDER BY n DESC;

SELECT count(*) FROM clinics WHERE id LIKE 'n-%';           -- lo insertado (416)
SELECT count(*) FROM clinics WHERE lat = 0 AND lng = 0;     -- no debe subir
SELECT state, count(*) FROM clinics GROUP BY state;         -- sin nuevos NULL
SELECT geocode_precision, count(*) FROM clinics GROUP BY 1 ORDER BY 2 DESC;
SELECT lower(name), zip_code, count(*) FROM clinics
GROUP BY 1,2 HAVING count(*) > 1;                            -- gemelas
```

Y la parte que el cliente juzga de verdad:

```bash
npx tsx scripts/ux/shoot.ts --tag=nppes-despues
```

En reposo, sin tocar nada, deben verse `Orthopedics` y `Neurosurgery` entre los
chips bajo el buscador — en escritorio y en el teléfono.

**Marcha atrás:** `DELETE FROM clinics WHERE id LIKE 'n-%';` más las etiquetas
previas guardadas en `data/nppes/merges.json`.

---

## Licencia

NPPES es dominio público de CMS. Se puede redistribuir sin atribución y sin
restricción de uso comercial. <https://npiregistry.cms.hhs.gov>

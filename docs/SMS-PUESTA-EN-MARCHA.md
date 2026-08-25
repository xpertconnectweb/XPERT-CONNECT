# Avisos por SMS — puesta en marcha

Guía operativa para dejar los avisos por SMS funcionando al 100 %.
El código ya está escrito y probado; lo que queda aquí es la parte que
no se puede programar.

**Regla de oro:** hasta que existan las cinco variables de Twilio, el
sistema está **inerte a propósito** — no envía nada y no da errores.
Se puede desplegar todo antes de tener la cuenta de Twilio.

---

## Orden obligatorio

Los pasos 1 y 2 **no son intercambiables**.

### 1. Aplicar la migración — ANTES de desplegar

Abre el **SQL Editor** de Supabase (proyecto de producción) y ejecuta
entero el archivo:

```
scripts/migrations/2026-08-sms-notifications.sql
```

Luego confirma:

```bash
npx tsx scripts/validate-schema.ts     # debe salir con código 0
```

> **Por qué este orden y no el contrario.** El mismo commit amplía
> `USER_COLUMNS` en `src/lib/data.ts`. PostgREST rechaza un `select`
> que nombre una columna inexistente, así que en una base sin migrar
> **falla toda lectura de usuarios — empezando por el login**. Si
> despliegas primero, nadie puede entrar y parece un fallo de
> autenticación en vez de uno de esquema.
>
> La migración solo **añade** columnas y tablas, así que aplicarla con
> el código viejo todavía en producción es completamente seguro.

### 2. Desplegar el código

Ya se puede subir. Sin variables de Twilio no se envía ni un mensaje.

---

## 3. Cuenta de Twilio y número

1. Crear cuenta en [twilio.com](https://www.twilio.com).
2. **Comprar un número toll-free** (Phone Numbers → Buy a number →
   marcar *Toll-free*). **$2,15/mes.**
3. Crear un **Messaging Service** (Messaging → Services) y añadirle el
   número al *Sender Pool*.
4. Dentro del Messaging Service, activar **Advanced Opt-Out**. Esto
   hace que Twilio gestione STOP/START/HELP por su cuenta.

> **Por qué toll-free y no un número local.** Un número local exige
> registro A2P 10DLC: ~$4,50 de marca + $15 de verificación de
> campaña, más $1,50–10/mes, y de 5 a 15 días de aprobación. El
> toll-free se salta todo eso, se aprueba en ~3 días hábiles y cuesta
> lo mismo por mensaje ($0,0083/segmento). A este volumen no hay
> ninguna ventaja en el 10DLC.
>
> Usamos `MessagingServiceSid` en vez de un `From` fijo precisamente
> para que, si algún día el volumen justifica pasar a 10DLC, sea un
> cambio de variable de entorno y **cero líneas de código**.

## 4. Textos a configurar en la consola de Twilio

En el Messaging Service → Opt-Out Management, pegar estos tres. La
fuente de verdad es `src/lib/sms/templates.ts`; si se cambian ahí, hay
que cambiarlos aquí también.

| Palabra clave | Texto |
|---|---|
| STOP | `Xpert Connect: you are unsubscribed and will get no more messages. Reply START to resume.` |
| HELP | `Xpert Connect referral alerts. Msg&data rates may apply. Reply STOP to end. Help: 844xpert.com or (844) 973-7868` |
| Confirmación de alta | `Xpert Connect: SMS alerts are on. We text you when a referral arrives. Msg&data rates may apply. Reply STOP to end.` |

## 5. Webhook de entrada

Messaging Service → Integration → *Incoming Messages* → Webhook:

```
https://www.844xpert.com/api/sms/inbound        (POST)
```

> **Sin cadena de consulta y exactamente esta URL.** La firma se
> calcula sobre este texto literal. Un carácter de diferencia —`www`,
> una barra final, `http` en vez de `https`— hace que **todas** las
> firmas fallen, y con ellas todos los STOP.

---

## 6. Verificación toll-free

**No se puede enviar hasta que el paso 2 esté desplegado**, porque el
formulario exige una captura del flujo de consentimiento en
funcionamiento.

Datos a reunir (algunos son obligatorios):

| Campo | Valor |
|---|---|
| Business name | Razón social exacta |
| Business website | `https://www.844xpert.com` |
| **Business registration number** | **EIN** — obligatorio salvo autónomos |
| Use case category | `ACCOUNT_NOTIFICATIONS` |
| Contacto | Nombre, email y teléfono del responsable |
| Volumen mensual | Estimado (p. ej. 200) |
| Opt-in type | `WEB_FORM` |
| **Opt-in image URL** | **Captura de `/professionals/notifications`** con la casilla y su texto visibles |
| Privacy policy URL | `https://www.844xpert.com/privacy` |
| Production message sample | `Xpert Connect: new referral from Smith Law. Sign in: 844xpert.com/r Reply STOP to end.` |
| Opt-in confirmation | El texto de la tabla del paso 4 |
| Help message | El texto de la tabla del paso 4 |

**Motivos de rechazo más habituales, todos ya cubiertos:**

- Sin política de privacidad accesible → está en `/privacy`.
- Sin la cláusula de que los datos móviles no se comparten → está,
  literal, en `/privacy` y en `/sms-terms`.
- El flujo de consentimiento no es inspeccionable porque está tras un
  login → por eso existe `/sms-terms`, que reproduce el mismo texto en
  abierto. **Incluir también esa URL** en *Additional information*.

Aprobación: **~3 días hábiles.**

---

## 7. Variables de entorno (Vercel)

Las cinco, en Production. Mientras falte una, no se envía nada.

| Variable | De dónde sale |
|---|---|
| `TWILIO_ACCOUNT_SID` | Consola de Twilio, empieza por `AC` |
| `TWILIO_AUTH_TOKEN` | Consola de Twilio |
| `TWILIO_MESSAGING_SERVICE_SID` | El Messaging Service del paso 3, empieza por `MG` |
| `TWILIO_WEBHOOK_URL` | `https://www.844xpert.com/api/sms/inbound` |
| `PHONE_OTP_PEPPER` | Cadena aleatoria de **32+ caracteres**, generada por ti |

Generar el pepper:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> El repositorio es **público**. Ninguna de estas va nunca en el
> código, solo en Vercel.

Comprobar después del despliegue:

```
GET /api/health   →  el check "env_twilio" debe salir en verde
```

Ese check está pensado para el fallo silencioso: si faltan **todas**
las variables pasa (la función está apagada a propósito), pero si
faltan **algunas** falla — porque entonces alguien cree que los SMS
funcionan y no funcionan.

---

## 8. Prueba de extremo a extremo

1. Entrar como una clínica o un abogado → **Notifications** en el menú.
2. Escribir un móvil, marcar la casilla, *Send code*.
3. Introducir el código de 6 dígitos.
4. Activar *Text me when I receive a referral*. Debe llegar el SMS de
   confirmación.
5. Crear un referido hacia esa clínica desde otra cuenta. Deben llegar
   **el correo de siempre y el SMS**.
6. Responder **STOP**. Comprobar en Supabase que aparece la fila en
   `sms_opt_outs` y que `users.sms_referral_alerts` pasó a `false`.

> **Antes de la aprobación toll-free**, Twilio acepta el envío pero el
> operador lo bloquea. Para probar sin esperar, usar las credenciales
> de prueba de Twilio y el número mágico `+15005550006`.

---

## Coste real

| Concepto | Coste |
|---|---|
| Número toll-free | $2,15/mes |
| Altas y registros | **$0** |
| Mensajes (~200 referidos/mes) | ~$2,50/mes |
| **Total** | **$5–8/mes** |

Un aviso ocupa **un solo segmento**. Los tests fallan si una plantilla
se pasa de 160 caracteres o deja de ser GSM-7, precisamente porque
salirse duplica el coste de cada mensaje sin que nadie lo note.

---

## Cosas que conviene saber

**Qué NO lleva el SMS.** Ni nombre del paciente, ni teléfono, ni
lesión, ni fecha. Solo «tienes un referido, entra». Es lo que evita
tener que firmar un BAA con Twilio: el SMS viaja sin cifrar por la red
del operador. El correo sigue llevando todo el detalle.

**Nadie recibe SMS sin pedirlo.** No hay script, ni acción de
administrador, ni valor por defecto que active los avisos de otra
persona. El administrador **ve** el estado y puede **revocarlo**, pero
no concederlo — un consentimiento tecleado por un tercero no es
consentimiento.

**El interruptor global de `/admin/settings` sí funciona.** Se lee en
cada referido. Ojo: el de *Referral Notifications* que ya existía
**no** se lee en ninguna parte — apagarlo no apaga los correos. Es un
fallo anterior a este trabajo, y sigue ahí.

**«Enviado» no es «entregado».** Twilio responde 201 cuando acepta el
mensaje en cola. Los fallos que más importan con un número toll-free
recién estrenado —30032 (sin verificar), 30007 (filtrado por el
operador)— llegan después, por un *status callback* que todavía no
consumimos. Por eso `sms_messages.status` dice `queued` y ninguna
pantalla dice «entregado».

**Los `sms_opt_outs` no se borran jamás.** Esa fila es la prueba de
que se respetó la baja, y sobrevive al borrado de la cuenta. La tabla
no tiene clave foránea a `users` a propósito.

# Tareas Pendientes - Documento Tecnico

## Estado General

La plataforma esta 100% funcional a nivel de codigo. Todas las features solicitadas estan implementadas y testeadas. Solo quedan **2 tareas** que dependen de informacion del cliente para completarse.

---

## TAREA 1: Configuracion de Email (SMTP)

### Que esta hecho
- `src/lib/email.ts` tiene toda la logica lista con Nodemailer
- Dos tipos de email implementados:
  - `referralCreatedEmail()` - notifica a la clinica cuando recibe un referral
  - `internalNotificationEmail()` - notifica al equipo interno de Xpert Connect en cada referral
- Fallback a `console.log` cuando SMTP no esta configurado (asi funciona ahora en demo)
- Escapa HTML para evitar XSS en emails
- Formato de fecha/hora en Eastern Time (ET)

### Que falta
El cliente crea la cuenta en Resend y me da acceso a GoDaddy. Yo hago todo lo demas.

### Que necesito del cliente
1. Que cree cuenta en https://resend.com (gratis)
2. Acceso a GoDaddy (panel DNS del dominio)
3. Que me diga 2 emails: remitente (`noreply@sudominio.com`) y equipo (donde reciben notificaciones)

### Pasos que hago yo una vez tenga acceso

**En Resend:**
1. Ir a **Domains** > **Add Domain** > escribir el dominio
2. Copiar los registros DNS que genera (SPF + DKIM, son 2-3 registros TXT)
3. Ir a **API Keys** > **Create API Key** > copiar la key (`re_...`)

**En GoDaddy:**
1. Ir a **My Products** > DNS del dominio
2. Agregar los registros TXT que dio Resend
3. Esperar propagacion (5-30 min)
4. Volver a Resend > **Verify** > debe salir en verde

**En el proyecto:**
Descomentar y llenar en `.env.local` (lineas 5-12):
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_XXXXXXXXXXXXXXXXX     # API key de Resend
SMTP_FROM=noreply@tudominio.com     # Remitente (dominio verificado)
INTERNAL_EMAIL=email@equipo.com     # Donde llegan las notificaciones
```

No hay que tocar ningun codigo, solo variables de entorno.

### Por que Resend + dominio verificado
- Los emails salen como `noreply@tudominio.com` (profesional)
- No caen en spam porque SPF y DKIM validan que el email es legitimo
- Sin verificar, saldrian como `noreply@resend.dev` y van a spam
- Free tier: 3,000 emails/mes, mas que suficiente

### Tiempo estimado
15-20 minutos (incluye configurar Resend + DNS + esperar propagacion + pegar variables).

---

## TAREA 2: Cuentas de Usuario Reales

### Que esta hecho
- Auth completo con NextAuth.js v4 + CredentialsProvider + JWT
- Passwords hasheados con bcrypt (12 rounds)
- Roles: `lawyer` (abogado) y `clinic` (clinica)
- Middleware protege todas las rutas `/professionals/*` excepto `/login`
- 4 cuentas demo funcionando:

| Usuario | Password | Rol | Nombre |
|---------|----------|-----|--------|
| `martinez_law` | `XpertDemo2025!` | Lawyer | Carlos Martinez |
| `johnson_legal` | `XpertDemo2025!` | Lawyer | Sarah Johnson |
| `miami_spine` | `XpertDemo2025!` | Clinic | Miami Spine & Rehab |
| `coral_medical` | `XpertDemo2025!` | Clinic | Coral Gables Medical Center |

### Que falta
El cliente debe definir los usuarios reales. Para cada uno necesito:

**Abogados:**
```json
{
  "username": "nombre_usuario",
  "password": "password-en-texto-plano",  // yo lo hasheo
  "name": "Nombre Completo",
  "role": "lawyer",
  "firmName": "Nombre del Bufete",
  "email": "email@real.com"
}
```

**Clinicas:**
```json
{
  "username": "nombre_usuario",
  "password": "password-en-texto-plano",  // yo lo hasheo
  "name": "Nombre de la Clinica",
  "role": "clinic",
  "clinicId": "c-XXX",  // ID de data/clinics.json
  "email": "email@clinica.com"
}
```

### Donde tocar
- **`data/users.json`** - reemplazar las 4 cuentas demo con las reales
- Usar `scripts/seed.ts` para generar los hashes bcrypt, o hacerlo manual con:
  ```bash
  node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('PASSWORD_AQUI', 10).then(h=>console.log(h))"
  ```

### Nota sobre clinicId
- Cada cuenta de clinica necesita un `clinicId` que la vincule a una clinica en `data/clinics.json`
- Los IDs van de `c-001` a `c-172` (172 clinicas en Florida)
- El `clinicId` determina que referrals ve esa clinica en su dashboard
- Un usuario clinica solo ve los referrals que fueron enviados a SU clinica

### Tiempo estimado una vez tenga los datos
15-30 minutos dependiendo de cuantos usuarios sean.

---

## Resumen

| Tarea | Depende de | Tiempo de implementacion |
|-------|-----------|--------------------------|
| Email (Resend + dominio GoDaddy) | Crear cuenta + verificar dominio | 15-20 min |
| Usuarios reales | Lista de usuarios del cliente | 15-30 min |

**Todo lo demas esta terminado:**

- 172 clinicas reales de Florida geocodificadas (0 errores)
- Mapa interactivo con busqueda, geolocalizacion, filtros, panel lateral
- Sistema de referrals con estados (received/in_process/attended)
- Dashboard con vistas por rol (abogado vs clinica)
- Notificaciones email (logica lista, falta SMTP)
- Firm name en referrals
- Disponibilidad de clinicas (marcadores verdes/grises)
- Responsive design (desktop + mobile)
- Login con auth protegido
- CSP, headers de seguridad, Permissions-Policy configurados

---

## Archivos Clave (referencia rapida)

| Archivo | Que es |
|---------|--------|
| `.env.local` | Variables de entorno (SMTP, NextAuth) |
| `data/users.json` | Cuentas de usuario (bcrypt hashed) |
| `data/clinics.json` | 172 clinicas con coordenadas GPS |
| `data/referrals.json` | Referrals creados |
| `src/lib/auth.ts` | Configuracion NextAuth |
| `src/lib/email.ts` | Logica de emails |
| `src/lib/data.ts` | Lectura/escritura de JSON (data layer) |
| `src/middleware.ts` | Proteccion de rutas |
| `src/components/professionals/MapView.tsx` | Mapa Leaflet principal |
| `scripts/parse-clinics-v2.js` | Parser del listado de clinicas |

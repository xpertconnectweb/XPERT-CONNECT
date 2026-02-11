# Xpert Connect - Informacion Pendiente del Cliente

Hola! La plataforma de Xpert Connect ya esta lista y funcionando. Solo necesitamos **2 cosas de su parte** para dejarla completamente operativa en produccion.

---

## 1. Correos Automaticos del Sistema

### Para que lo necesitamos
Cuando un abogado envia un referral (paciente) a una clinica, el sistema envia dos correos automaticos:
- Uno a la **clinica** avisandole que recibio un nuevo paciente
- Uno al **equipo de Xpert Connect** con los detalles del referral

Actualmente estos correos se guardan internamente (modo demo). Para que lleguen de verdad, necesitamos activar el envio de emails.

### Como lo vamos a hacer
Ya que cuentan con su dominio en GoDaddy, vamos a usar un servicio gratuito llamado **Resend** (resend.com) que permite hasta 3,000 correos al mes sin costo. Ustedes solo crean la cuenta y nosotros nos encargamos de toda la configuracion tecnica.

### Que necesitamos de ustedes

1. **Crear una cuenta en Resend** - ir a https://resend.com y registrarse (es gratis, toma 2 minutos)
2. **Darnos acceso a GoDaddy** - necesitamos acceso temporal al panel de su dominio para agregar los registros de verificacion (esto asegura que los correos no caigan en spam)
3. **Decirnos 2 emails:**
   - **Email remitente**: desde que direccion quieren que salgan los correos del sistema (ej: `noreply@sudominio.com`)
   - **Email del equipo**: a donde quieren recibir la notificacion cada vez que se crea un referral (ej: `equipo@sudominio.com` o un email personal)

Con eso nosotros verificamos el dominio, generamos las claves y conectamos todo.

---

## 2. Cuentas de Usuarios Reales

### Para que lo necesitamos
La plataforma tiene dos tipos de usuarios:
- **Abogados**: buscan clinicas en el mapa y envian pacientes (referrals)
- **Clinicas**: reciben los referrals y actualizan el estado del paciente (recibido, en proceso, atendido)

Actualmente el sistema tiene 4 cuentas de prueba. Necesitamos los datos reales de las personas que van a usar la plataforma.

### Que necesitamos de ustedes

**Para cada abogado:**

| Campo | Ejemplo |
|-------|---------|
| Nombre completo | Carlos Martinez |
| Nombre del bufete | Martinez & Associates |
| Nombre de usuario (para login) | martinez_law |
| Contrasena deseada | (minimo 12 caracteres) |
| Email | carlos@martinezlaw.com |

**Para cada clinica:**

| Campo | Ejemplo |
|-------|---------|
| Nombre de la clinica | Miami Spine & Rehab |
| Nombre de usuario (para login) | miami_spine |
| Contrasena deseada | (minimo 12 caracteres) |
| Email | admin@miamispine.com |

Las contrasenas se almacenan de forma segura (encriptadas). Nadie puede verlas, ni siquiera nosotros.

---

## Lo Que Ya Esta Listo

Todo esto ya esta funcionando y no requiere nada de su parte:

| Funcionalidad | Estado |
|---------------|--------|
| 172 clinicas reales de toda Florida en el mapa | Listo |
| Mapa interactivo con zoom, busqueda y filtros | Listo |
| Busqueda por ciudad, codigo postal o direccion | Listo |
| Boton "Mi Ubicacion" para encontrar clinicas cercanas | Listo |
| Indicador de disponibilidad (verde = disponible) | Listo |
| Envio de referrals desde abogado a clinica | Listo |
| Panel de referrals para clinicas (recibido, en proceso, atendido) | Listo |
| Nombre del bufete en cada referral | Listo |
| Notificaciones por email (listas, solo falta el servicio) | Listo |
| Login seguro con proteccion de rutas | Listo |
| Diseno adaptable a celulares y tablets | Listo |

---

## Resumen Rapido

| Que necesitamos | Prioridad | Dificultad para ustedes |
|-----------------|-----------|------------------------|
| Email remitente + email del equipo | Alta | Baja - solo decirnos 2 emails |
| Lista de usuarios (abogados + clinicas) | Alta | Media - llenar los datos de cada persona |

Una vez recibamos esta informacion, la plataforma puede estar en produccion en **menos de 1 hora**.

---

Si tienen alguna duda sobre cualquiera de estos puntos, no duden en consultarnos.

# 📋 Documentación del Panel de Administrador - XPERT CONNECT

## Índice
1. [Acceso al Panel de Admin](#acceso-al-panel-de-admin)
2. [Dashboard](#dashboard)
3. [Gestión de Usuarios](#gestión-de-usuarios)
4. [Gestión de Clínicas](#gestión-de-clínicas)
5. [Gestión de Referrals](#gestión-de-referrals)
6. [Gestión de Contactos](#gestión-de-contactos)
7. [Gestión de Newsletter](#gestión-de-newsletter)
8. [Solución de Problemas Comunes](#solución-de-problemas-comunes)

---

## Acceso al Panel de Admin

### URL de Acceso
```
https://xpert-connect.com/admin
```

### Credenciales
Solo usuarios con rol **"admin"** pueden acceder al panel de administración.

**URL de Login:**
```
https://xpert-connect.com/professionals/login
```

Después de iniciar sesión con una cuenta de administrador, serás redirigido automáticamente al panel de administración.

---

## Dashboard

### ¿Qué Muestra?
El Dashboard es la página principal del panel de administración y muestra estadísticas en tiempo real del sistema:

- **📊 Total Users**: Número total de usuarios registrados (lawyers + clinics + admins)
- **🏥 Total Clinics**: Número total de clínicas en el sistema
- **📄 Total Referrals**: Número total de referrals creados
- **📧 Newsletter Subscribers**: Número total de suscriptores al newsletter

### Acceso Rápido
Desde el Dashboard puedes navegar a cualquier sección usando el menú lateral.

---

## Gestión de Usuarios

### Ubicación
**Admin → Users**

### ¿Qué Puedes Hacer?

#### 1. Ver Todos los Usuarios
- Lista completa de todos los usuarios del sistema
- Columnas mostradas:
  - **Name**: Nombre del usuario
  - **Username**: Nombre de usuario para login
  - **Email**: Correo electrónico
  - **Role**: Tipo de usuario (lawyer, clinic, admin)
  - **Details**: Firma legal (lawyers) o Clínica vinculada (clinics)
  - **Actions**: Botones de editar y eliminar

#### 2. Buscar Usuarios
- Campo de búsqueda en la parte superior
- Busca por: nombre, username, email, o firma

#### 3. Filtrar por Rol
- Dropdown para filtrar por tipo de usuario:
  - All Users
  - Lawyers Only
  - Clinics Only
  - Admins Only

#### 4. Crear Nuevo Usuario

**Paso a paso:**
1. Click en el botón **"+ New User"**
2. Llenar el formulario:
   - **Name**: Nombre completo del usuario
   - **Username**: Nombre único para login (sin espacios)
   - **Password**: Contraseña (mínimo 6 caracteres)
   - **Email**: Correo electrónico válido
   - **Role**: Seleccionar tipo de usuario
     - **Lawyer**: Abogado que puede crear referrals
     - **Clinic**: Usuario de clínica que recibe referrals
     - **Admin**: Administrador del sistema
   - **Firm Name**: Solo para lawyers - nombre del bufete legal
   - **Clinic**: Solo para clinics - seleccionar clínica de la lista
3. Click en **"Create"**

**Validaciones:**
- Si rol = "lawyer": Debe tener Firm Name
- Si rol = "clinic": Debe seleccionar una Clinic de la lista
- Username debe ser único en el sistema

#### 5. Editar Usuario

**Paso a paso:**
1. Click en el ícono de **lápiz (✏️)** en la fila del usuario
2. Modificar los campos necesarios:
   - Name
   - Username
   - Email
   - Role
   - Password (opcional - solo si quieres cambiarlo)
   - Firm Name (si es lawyer)
   - Clinic (si es clinic)
3. Click en **"Update"**

**Nota:** Los cambios se reflejan inmediatamente.

#### 6. Eliminar Usuario

**Paso a paso:**
1. Click en el ícono de **basura (🗑️)** en la fila del usuario
2. Click en **"Confirm"** para confirmar la eliminación
3. Click en **"Cancel"** si cambias de opinión

**Advertencia:** Esta acción es permanente y no se puede deshacer.

---

## Gestión de Clínicas

### Ubicación
**Admin → Clinics**

### ¿Qué Puedes Hacer?

#### 1. Ver Todas las Clínicas
- Lista completa de todas las clínicas del sistema
- Columnas mostradas:
  - **Name**: Nombre de la clínica + especialidades
  - **Address**: Dirección completa
  - **Region**: Región y condado
  - **Contact**: Teléfono y email
  - **Status**: Available / Unavailable (con indicador visual)
  - **Actions**: Botones de ver emails, editar y eliminar

#### 2. Buscar Clínicas
- Campo de búsqueda en la parte superior
- Busca por: nombre, dirección, región, condado

#### 3. Filtrar por Disponibilidad
- Dropdown para filtrar:
  - All Clinics
  - Available Only (clínicas que aceptan referrals)
  - Unavailable Only (clínicas que no aceptan referrals)

#### 4. Ver Emails de Notificación (IMPORTANTE) 📧

Esta función te permite ver **exactamente qué emails reciben notificaciones** cuando se crea un referral para una clínica.

**Paso a paso:**
1. Click en el ícono de **Mail (📧)** en la fila de la clínica
2. Se abrirá un modal mostrando:

   **Clinic Entity Email:**
   - Email configurado directamente en la clínica
   - Se edita desde el botón "Edit" de la clínica

   **User Accounts Linked:**
   - Lista de emails de usuarios con rol "clinic" vinculados a esta clínica
   - Se editan desde Admin → Users

   **Total Emails:**
   - Número total de correos que recibirán notificaciones

**¿Por qué es importante?**
- Te permite identificar emails incorrectos o de prueba
- Muestra claramente dónde cambiar cada tipo de email
- Ayuda a diagnosticar problemas de notificaciones

#### 5. Cambiar Disponibilidad (Available/Unavailable)

**Paso a paso:**
1. Click en el botón de status en la columna **Status**
2. El sistema cambiará automáticamente el estado:
   - **Available** → **Unavailable**
   - **Unavailable** → **Available**
3. Verás una animación de carga mientras se actualiza
4. El cambio se refleja inmediatamente

**¿Qué significa cada estado?**
- **Available** (Verde): La clínica aparece en el mapa y puede recibir referrals
- **Unavailable** (Gris): La clínica NO aparece en el mapa y no puede recibir referrals

#### 6. Crear Nueva Clínica

**Paso a paso:**
1. Click en el botón **"+ New Clinic"**
2. Llenar el formulario:

   **Información Básica** (Requerido):
   - **Clinic Name**: Nombre de la clínica
   - **Address**: Dirección completa
   - **Latitude**: Latitud GPS (decimal, ej: 25.7617)
   - **Longitude**: Longitud GPS (decimal, ej: -80.1918)

   **Información de Contacto** (Opcional):
   - **Phone**: Teléfono de contacto
   - **Email**: Email de la clínica (recibirá notificaciones de referrals)

   **Detalles Adicionales** (Opcional):
   - **Specialties**: Especialidades separadas por comas
     - Ejemplo: "Chiropractic, Physical Therapy, Pain Management"
   - **Region**: Región de Florida
     - Ejemplo: "South Florida", "Central Florida"
   - **County**: Condado
     - Ejemplo: "Miami-Dade", "Broward"
   - **Website**: URL del sitio web de la clínica

   **Disponibilidad**:
   - ☑️ **Available for referrals**: Marcar si la clínica acepta referrals

3. Click en **"Create"**

**Cómo obtener Latitude y Longitude:**
1. Busca la dirección en Google Maps
2. Click derecho en el pin de ubicación
3. Las coordenadas aparecerán primero (copiar y pegar)

#### 7. Editar Clínica

**Paso a paso:**
1. Click en el ícono de **lápiz (✏️)** en la fila de la clínica
2. Modificar los campos necesarios (mismos campos que crear)
3. Click en **"Update"**

**Nota:** Los cambios se reflejan inmediatamente en:
- Panel de admin
- Mapa de clínicas (/professionals/map)
- Selección de clínicas al crear referrals

#### 8. Eliminar Clínica

**Paso a paso:**
1. Click en el ícono de **basura (🗑️)** en la fila de la clínica
2. Click en **"Confirm"** para confirmar
3. Click en **"Cancel"** si cambias de opinión

**Advertencia:**
- Esta acción es permanente
- Se eliminarán todos los usuarios vinculados a esta clínica
- Los referrals históricos se mantendrán pero no podrás crear nuevos

---

## Gestión de Referrals

### Ubicación
**Admin → Referrals**

### ¿Qué Puedes Hacer?

#### 1. Ver Todos los Referrals
- Lista completa de todos los referrals del sistema
- Columnas mostradas:
  - **Patient**: Nombre del paciente
  - **Lawyer**: Abogado que creó el referral + firma
  - **Clinic**: Clínica que recibió el referral
  - **Case Type**: Tipo de caso
  - **Status**: Estado actual del referral
  - **Date**: Fecha de creación
  - **Actions**: Botones de ver detalles y eliminar

#### 2. Buscar Referrals
- Campo de búsqueda en la parte superior
- Busca por: nombre de paciente, lawyer, clínica, tipo de caso

#### 3. Filtrar por Estado
- Dropdown para filtrar:
  - All Referrals
  - Received Only (nuevos)
  - In Process Only (en proceso)
  - Attended Only (completados)

#### 4. Ver Detalles de Referral

**Paso a paso:**
1. Click en el botón **"View Details"** en la fila del referral
2. Se abrirá un modal mostrando:
   - **Patient Information**: Nombre y teléfono
   - **Lawyer Information**: Nombre, firma y contacto
   - **Clinic Information**: Nombre de la clínica
   - **Case Details**: Tipo de caso, coverage, PIP
   - **Notes**: Notas adicionales del abogado
   - **Timeline**: Fecha de creación y última actualización

#### 5. Cambiar Estado de Referral

**Paso a paso:**
1. Localizar el referral en la tabla
2. En la columna **Status**, usar el dropdown para seleccionar:
   - **Received**: Recibido (estado inicial)
   - **In Process**: En proceso (clínica está trabajando en él)
   - **Attended**: Atendido (caso completado)
3. El cambio se guarda automáticamente

**Indicadores Visuales:**
- **Received**: Badge azul
- **In Process**: Badge amarillo
- **Attended**: Badge verde

**Quién puede cambiar el estado:**
- **Admin**: Puede cambiar cualquier referral a cualquier estado
- **Clinics**: Solo pueden cambiar sus propios referrals
- **Lawyers**: No pueden cambiar estados (solo ver los suyos)

#### 6. Eliminar Referral

**Paso a paso:**
1. Click en el ícono de **basura (🗑️)** en la fila del referral
2. Click en **"Confirm"** para confirmar
3. Click en **"Cancel"** si cambias de opinión

**Advertencia:** Esta acción es permanente y no se puede deshacer.

---

## Gestión de Contactos

### Ubicación
**Admin → Contacts**

### ¿Qué Puedes Hacer?

#### 1. Ver Todos los Contactos
- Lista de mensajes enviados desde el formulario de contacto del sitio web
- Columnas mostradas:
  - **Name**: Nombre del contacto
  - **Email**: Correo electrónico
  - **Service**: Servicio de interés seleccionado
  - **Date**: Fecha del mensaje
  - **Actions**: Botones de ver detalles y eliminar

#### 2. Buscar Contactos
- Campo de búsqueda en la parte superior
- Busca por: nombre, email, servicio

#### 3. Exportar a CSV

**Paso a paso:**
1. Click en el botón **"📊 Export CSV"** en la parte superior
2. Se descargará un archivo CSV con todos los contactos
3. El archivo incluye:
   - Name
   - Email
   - Phone
   - Service
   - Message
   - Date

**Uso recomendado:**
- Importar a CRM
- Análisis de leads
- Seguimiento de ventas
- Reportes para el equipo

#### 4. Ver Detalles de Contacto

**Paso a paso:**
1. Click en el botón **"View Details"** en la fila del contacto
2. Se abrirá un modal mostrando:
   - **Información Personal**: Nombre, email, teléfono
   - **Service Interested**: Servicio seleccionado
   - **Message**: Mensaje completo del contacto
   - **Date Submitted**: Fecha y hora exacta del envío

#### 5. Eliminar Contacto

**Paso a paso:**
1. Click en el ícono de **basura (🗑️)** en la fila del contacto
2. Click en **"Confirm"** para confirmar
3. Click en **"Cancel"** si cambias de opinión

**Advertencia:** Esta acción es permanente.

---

## Gestión de Newsletter

### Ubicación
**Admin → Newsletter**

### ¿Qué Puedes Hacer?

#### 1. Ver Todos los Suscriptores
- Lista de emails suscritos al newsletter
- Columnas mostradas:
  - **Email**: Dirección de correo
  - **Subscribed At**: Fecha de suscripción
  - **Actions**: Botón de eliminar

#### 2. Buscar Suscriptores
- Campo de búsqueda en la parte superior
- Busca por email

#### 3. Exportar a CSV

**Paso a paso:**
1. Click en el botón **"📊 Export CSV"** en la parte superior
2. Se descargará un archivo CSV con todos los suscriptores
3. El archivo incluye:
   - Email
   - Subscribed Date

**Uso recomendado:**
- Importar a plataforma de email marketing (Mailchimp, SendGrid, etc.)
- Campañas de marketing
- Análisis de crecimiento de suscriptores

#### 4. Eliminar Suscriptor

**Paso a paso:**
1. Click en el ícono de **basura (🗑️)** en la fila del suscriptor
2. Click en **"Confirm"** para confirmar
3. Click en **"Cancel"** si cambias de opinión

**Cuándo eliminar:**
- El usuario solicitó ser removido (GDPR/Compliance)
- Email inválido o rebotado
- Duplicado

---

## Solución de Problemas Comunes

### Problema 1: Los cambios en clínicas no se reflejan inmediatamente

**Solución:**
1. Espera 2-3 segundos después de guardar
2. El sistema ya no usa caché, los cambios son inmediatos
3. Si no ves el cambio, refresca la página (F5)
4. Verifica en Supabase que el cambio se guardó

### Problema 2: Emails de referrals van a direcciones incorrectas

**Diagnóstico:**
1. Ve a **Admin → Clinics**
2. Click en el ícono de **Mail (📧)** de la clínica afectada
3. Revisa qué emails aparecen:

**Si el problema está en "Clinic Entity Email":**
- Click en el ícono de **lápiz (✏️)** de la clínica
- Cambia el campo "Email"
- Guarda

**Si el problema está en "User Accounts Linked":**
- Ve a **Admin → Users**
- Busca los usuarios con los emails incorrectos
- Edita cada usuario y cambia su email
- Guarda

**Importante:** El sistema envía emails a AMBOS:
- Email de la clínica
- Emails de todos los usuarios vinculados a esa clínica

### Problema 3: No puedo crear un usuario tipo "clinic"

**Solución:**
1. Verifica que primero existe la clínica en **Admin → Clinics**
2. Si no existe, créala primero
3. Luego crea el usuario y selecciona la clínica de la lista
4. El dropdown muestra: "Clinic Name - Address"

### Problema 4: Una clínica no aparece en el mapa

**Verificar:**
1. Ve a **Admin → Clinics**
2. Verifica que el status sea **Available** (verde)
3. Si está **Unavailable** (gris), click en el botón de status para cambiar
4. Verifica que las coordenadas (lat/lng) sean correctas
5. Verifica que tenga al menos una especialidad

### Problema 5: No recibo emails de nuevos contactos

**Verificación:**
1. Los emails de contacto se envían al equipo interno
2. Verifica la configuración de Resend en las variables de entorno
3. Los contactos SÍ se guardan en la base de datos aunque el email falle
4. Puedes verlos en **Admin → Contacts**

### Problema 6: Error al eliminar una clínica

**Posibles Causas:**
1. Hay usuarios vinculados a esa clínica
   - Solución: Primero elimina o reasigna los usuarios en **Admin → Users**
2. Hay referrals vinculados
   - Solución: Los referrals históricos se mantienen, pero no podrás crear nuevos

---

## Mejores Prácticas

### Seguridad
1. ✅ No compartas las credenciales de admin
2. ✅ Cambia la contraseña regularmente
3. ✅ Cierra sesión cuando termines
4. ✅ Usa emails corporativos para cuentas de admin

### Gestión de Datos
1. ✅ Exporta CSV de contacts y newsletter regularmente (backup)
2. ✅ Revisa y limpia contactos duplicados mensualmente
3. ✅ Mantén actualizada la información de clínicas
4. ✅ Verifica emails de notificación después de editar clínicas

### Mantenimiento
1. ✅ Revisa el estado de referrals semanalmente
2. ✅ Actualiza la disponibilidad de clínicas según su capacidad
3. ✅ Mantén las especialidades de clínicas actualizadas
4. ✅ Elimina usuarios inactivos o duplicados

---

## Contacto y Soporte

Si encuentras algún problema o necesitas ayuda con el panel de administración:

**Soporte Técnico:**
- Email: support@xpert-connect.com
- Documentación técnica: Ver archivo README.md en el repositorio

**Reporte de Bugs:**
- GitHub Issues: https://github.com/xpertconnectweb/XPERT-CONNECT/issues

---

**Última actualización:** Febrero 2026
**Versión del documento:** 1.0
**Plataforma:** XPERT CONNECT Admin Panel

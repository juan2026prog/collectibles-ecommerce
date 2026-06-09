# REPORT: WHATSAPP OPERATIONAL NOTIFICATIONS SYSTEM (P1.7)

## ESTADO DEL ENTREGABLE: `READY`

El módulo de notificaciones de **WhatsApp Comercial (Beta)** ha sido transformado en un sistema funcional extremo a extremo para la comunicación de eventos operativos críticos en el Marketplace, sirviendo tanto a **Vendedores (Vendors)** como al equipo de **Administración de Collectibles (Admin)**.

---

## 1. ESTRUCTURA DE BASE DE DATOS

Se diseñaron y aplicaron las siguientes estructuras en PostgreSQL mediante la migración [20260902000000_whatsapp_notifications.sql](file:///c:/Projects/Collectibles2026/supabase/migrations/20260902000000_whatsapp_notifications.sql):

### Tabla: `public.vendor_notification_settings`
Almacena la configuración particular de cada tienda para las notificaciones de WhatsApp.
- `id` (uuid, PK)
- `vendor_id` (uuid, Unique, FK -> public.vendors)
- `whatsapp_numbers` (jsonb, almacena un array de hasta 3 números con etiqueta y estado de habilitación)
- `notify_new_sale` (boolean)
- `notify_payment_received` (boolean)
- `notify_order_shipped` (boolean)
- `notify_low_stock` (boolean)
- `notify_payout_paid` (boolean)
- `is_active` (boolean, interruptor maestro del vendor)
- `created_at` / `updated_at` (timestamptz)

### Tabla: `public.admin_notification_settings`
Fila única (singleton) que guarda la configuración del equipo de administración de Collectibles.
- `id` (uuid, PK)
- `is_singleton` (boolean, default true, unique check)
- `whatsapp_numbers` (jsonb, array de hasta 3 números administrativos)
- `notify_own_sales` (boolean)
- `notify_vendor_sales` (boolean)
- `notify_payment_received` (boolean)
- `notify_low_stock` (boolean)
- `notify_shipping_events` (boolean)
- `notify_payout_pending` (boolean)
- `is_active` (boolean, interruptor maestro de administración)
- `created_at` / `updated_at` (timestamptz)

### Tabla: `public.notification_logs`
Bitácora de envíos para auditoría operativa y visualización en paneles.
- `id` (uuid, PK)
- `scope` (text, check 'vendor' | 'admin')
- `vendor_id` (uuid, null para admin, FK -> public.vendors)
- `event_type` (text)
- `recipient_number_masked` (text, número enmascarado para seguridad)
- `status` (text, check 'queued' | 'sent' | 'failed')
- `error_message` (text)
- `created_at` (timestamptz)

---

## 2. INTERFAZ DE USUARIO (UI VENDOR)

Ubicada en **Vendor Dashboard → Configuración → Notificaciones**:
- **Badge de Estado:** Muestra dinámicamente:
  - `No configurado` (si no hay números guardados).
  - `Configurado` (si hay números cargados pero el interruptor maestro está inactivo).
  - `Activo` (si el interruptor maestro está encendido y hay al menos un número habilitado).
- **Entradas de Números:** Formulario para hasta 3 destinatarios independientes. Cada uno posee:
  - Etiqueta personalizada (ej. "Dueño", "Depósito", "Administración").
  - Checkbox para activar/desactivar ese número individualmente.
  - Celular con validación obligatoria de formato Uruguay (`+598`) y longitud.
- **Validaciones en Frontend:**
  - Evita ingresar campos vacíos en registros marcados como activos.
  - Evita duplicar números en los distintos casilleros.
- **Historial de Logs:** Tabla integrada para ver las notificaciones enviadas correspondientes a su tienda, con enmascaramiento estricto de números (`+598******456`) y detalles de estado.

---

## 3. INTERFAZ DE USUARIO (UI ADMIN COLLECTIBLES)

Ubicada en **Admin Settings → Notificaciones WhatsApp**:
- **Configuración de la Plataforma:** Gestión centralizada de 3 números operativos para el equipo de administración de Collectibles.
- **Alertas Disponibles:** Toggles específicos para controlar el flujo de notificaciones internas:
  - Ventas propias de Collectibles
  - Ventas de Vendors
  - Pagos recibidos
  - Stock bajo
  - Eventos de envío
  - Liquidaciones pendientes
- **Historial Global:** Tabla administrativa para auditar todas las notificaciones emitidas por el sistema en tiempo real, permitiendo identificar rápidamente errores de entrega, números encolados (`queued`) o envíos exitosos.

---

## 4. INTEGRACIÓN CON EVENTOS (TRIGGERS EN BD)

Se crearon disparadores a nivel de base de datos (`AFTER UPDATE` / `AFTER INSERT`) para reaccionar inmediatamente a eventos del sistema e invocar de manera asíncrona la Edge Function mediante la extensión de red `net.http_post`.

### Eventos Conectados:
1. **Nueva Venta Vendor / Pago Recibido:** Al cambiar `orders.status` a `'paid'`. Genera notificaciones independientes para cada Vendor con los productos vendidos en su tienda y el total cobrado, y otra para Collectibles Admin (con la estimación de comisión del Marketplace).
2. **Stock Bajo:** Al actualizar `product_variants.inventory_count` a un valor menor o igual a 2. Alerta tanto al Vendor como a la Administración para reposición.
3. **Pedido Enviado:** Al insertar una fila en la tabla `shipments`. Avisa al Vendor del despacho con los datos de seguimiento correspondientes.
4. **Pedido Entregado:** Al actualizar `shipments.shipping_status` a `'delivered'` o `'entregado'`. Confirma el arribo del producto al destinatario final.
5. **Liquidación Pagada:** Al actualizar `vendor_payouts.status` a `'paid'`. Notifica al vendedor que los fondos han sido transferidos.

---

## 5. EDGE FUNCTION DE PROCESAMIENTO (`send-whatsapp-notification`)

Implementada en Deno Edge Runtime ([index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/send-whatsapp-notification/index.ts)):
- **Seguridad y Autorización:** Se valida la autenticidad de la petición utilizando un secreto compartido (`whatsapp_webhook_secret`) guardado de forma privada en la tabla `site_settings`. No se permiten invocaciones de usuarios o agentes externos no autenticados.
- **Robustez de Consultas:** Se corrigieron los mapeos de campos entre base de datos y memoria:
  - Uso correcto de `unit_price` en lugar de `price` de la tabla `order_items`.
  - Extracción segura del nombre del cliente (`first_name` + `last_name`) y la ciudad de destino (`city`) desde la columna JSONB `shipping_address` de la orden, previniendo errores por columnas inexistentes.
  - Gestión tolerante a fallos: cualquier error de consulta o datos ausentes en un trigger de base de datos no bloquea la transacción principal.

---

## 6. SEGURIDAD Y PROTECCIÓN DE DATOS (REGLA GLOBAL)

- **Filtro KYC y Datos Bancarios:** El contenido de los mensajes de WhatsApp generados nunca incluye información sensible, imágenes de documentos, contraseñas, secretos, cuentas de banco o datos KYC del vendedor o cliente.
- **Enmascaramiento en Logs:** Los números telefónicos almacenados en la tabla pública `notification_logs` son enmascarados de forma obligatoria en el servidor antes de insertarse:
  `+59899123456` -> `+598******456`
- **Aislamiento Multitenant (RLS):**
  - Los Vendors únicamente pueden consultar, modificar e insertar configuraciones que les correspondan a su propio `vendor_id`.
  - Los Vendors solo tienen permisos de lectura (`SELECT`) en `notification_logs` para filas donde coincida su `vendor_id`. Jamás pueden visualizar números de otros vendedores ni de la administración de Collectibles.
  - Los administradores disponen de permisos de lectura global para ver todos los logs y configurar los números internos.

---

## 7. MODO PREPARADO (QUEUED) Y PRÓXIMOS PASOS (META API)

### Limitación Actual
Dado que no existe una cuenta de producción de WhatsApp Business conectada, el sistema de mensajería se inicializa en modo **preparado (queued)** si la clave del proveedor no se encuentra configurada en las variables de entorno de Supabase.
- **Estado de envío:** Se registra como `'queued'` en logs.
- **Proveedor:** Registrado internamente como `'pending'`.
- **Error logueado:** `'pending provider connection'`.

### Pasos para Conexión Real con Meta WhatsApp Business API
Para poner en producción el envío real de WhatsApp, sigue estos pasos:

1. **Crear Aplicación en Meta for Developers:**
   - Crear una cuenta en [developers.facebook.com](https://developers.facebook.com).
   - Crear una aplicación de tipo "Negocio" (Business).
   - Agregar el producto "WhatsApp" a la aplicación.
2. **Configurar el Número y el Perfil de WhatsApp Business:**
   - Asociar un número de teléfono exclusivo para el canal comercial.
   - Completar la verificación de la empresa (Business Verification) en el Meta Business Suite.
3. **Generar Tokens de Acceso:**
   - Obtener el **WhatsApp Phone Number ID** (identificador único del número remitente).
   - Generar un **System User Access Token** permanente con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. **Configurar Variables de Entorno en Supabase:**
   Ejecutar el siguiente comando para registrar las credenciales reales en las Edge Functions:
   ```bash
   supabase secrets set WHATSAPP_TOKEN="EAAG..." WHATSAPP_PHONE_ID="tu-phone-number-id" --project-ref cobtsgkwcftvexaarwmo
   ```
5. **Aprobación de Plantillas (Opcional):**
   Si se requiere iniciar conversaciones por fuera de la ventana de 24 horas de atención al cliente, se deben registrar las plantillas (Templates) de Nueva Venta, Stock Bajo y Liquidaciones en la consola de Meta y utilizar el endpoint de plantillas en la Edge Function.

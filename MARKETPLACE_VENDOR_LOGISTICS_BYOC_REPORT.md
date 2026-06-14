# Report: Marketplace Vendor Logistics BYOC (Bring Your Own Carrier)

This document presents the technical architecture, database changes, and integration flows implemented for the Marketplace BYOC Logistics system (Fase Inicial: DAC, UES, SoyDelivery).

---

## CLASIFICACIÓN
**READY**

---

## 1. TABLAS CREADAS O MODIFICADAS

### A. Nueva Tabla: `vendor_dispatch_addresses`
Registra las direcciones de despacho de los vendors para ser usadas como origen/remitente en las guías y etiquetas.
- **Campos**:
  - `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
  - `vendor_id` UUID REFERENCES `public.vendors(id) ON DELETE CASCADE`
  - `name` TEXT (Nombre descriptivo)
  - `address` TEXT (Calle y Nro)
  - `city` TEXT
  - `department` TEXT
  - `postal_code` TEXT
  - `phone` TEXT
  - `is_default` BOOLEAN DEFAULT `false`
  - `created_at` / `updated_at` TIMESTAMPTZ
- **Trigger**: `tr_vendor_default_dispatch_address` ejecuta `handle_vendor_default_dispatch_address` para asegurar que haya una única dirección predeterminada por vendedor.
- **RLS**:
  - Los vendors pueden ver, crear, actualizar y borrar únicamente sus propias direcciones (`auth.uid() = vendor_id`).
  - Los administradores tienen acceso de lectura global.

### B. Tabla Modificada: `vendor_shipping_connections`
Se ampliaron las políticas RLS de inserción, actualización y borrado para permitir que los vendors gestionen sus propias credenciales encriptadas de forma autónoma desde el frontend y Edge Functions.

### C. Tabla Modificada: `delivery_providers`
Se sembraron (seeded) los proveedores `ues` y `soydelivery` mediante la migración `20261014010000_seed_byoc_providers.sql` para mantener la integridad referencial de la clave foránea `provider_key` en la tabla `shipments`.

---

## 2. PROVIDERS SOPORTADOS (FASE INICIAL)

- **DAC (Agencia Central)**: Integración API real vía wsLogin, wsInGuia_peso, y descarga de PDF pegote en Base64.
- **UES**: Flujo de etiquetas a domicilio y pick centers (simulado para entorno de testing).
- **SoyDelivery**: Gestión de envíos express de última milla (flex en el día) con sincronización de bultos y estados.

---

## 3. SISTEMA DE ENCRIPTACIÓN DE CREDENCIALES

Las credenciales no se almacenan en texto plano en la base de datos.
- **Algoritmo**: AES-GCM.
- **Flujo**:
  1. El vendor ingresa los campos (API Keys, Contraseñas, Tokens) en el frontend.
  2. Al guardar, se invoca la Edge Function segura `vendor-shipping-save-connection` mediante POST.
  3. La Edge Function encripta el JSON de credenciales usando una clave secreta (`SHIPPING_ENCRYPTION_KEY` o en su defecto el prefijo de la Service Role Key).
  4. El string resultante (`ivHex:encHex`) se guarda en la columna `credentials_encrypted`.
  5. Para la generación de la guía, la Edge Function correspondiente (ej: `dac-create-shipment`) desencripta las credenciales en memoria de forma segura y temporal para realizar el llamado SOAP/REST.

---

## 4. FLUJO DE CONEXIÓN Y CONFIGURACIÓN (FRONTEND)

```mermaid
sequence-diagram
Vendor -> VShipping: Completa Formulario Courier
Vendor -> VShipping: Clic "Probar Conexión"
VShipping -> Edge Function (test): Credenciales Planas
Edge Function (test) -> Courier API: Valida
Courier API -> Edge Function (test): OK / Error
Edge Function (test) -> VShipping: Mensaje Resultado
Vendor -> VShipping: Clic "Guardar Conexión"
VShipping -> Edge Function (save): Credenciales Planas + Metadatos
Edge Function (save) -> DB (encrypt): Guarda encriptado (AES-GCM)
Edge Function (save) -> VShipping: Conectado
```

---

## 5. FLUJO DE CREACIÓN DE GUÍAS Y ETIQUETAS (POST-PAGO)

1. El comprador finaliza y paga un carrito multivendor.
2. La base de datos actualiza el estado del pago, gatillando `triggerPostPaymentActions` en `confirm-payment`.
3. El backend itera sobre las subórdenes del pedido de manera aislada (`try/catch`).
4. Para cada suborden:
   - Identifica el proveedor configurado (ej: `shipping_provider = 'UES'`).
   - Invoca la Edge Function correspondiente (`ues-create-shipment`).
   - La Edge Function busca una conexión activa del vendedor en `vendor_shipping_connections`.
   - **Caso Exitoso**: Desencripta credenciales, llama al API del Courier con el remitente del vendedor, obtiene el pegote/etiqueta y tracking, actualiza `order_suborders` y crea la fila en `shipments`.
   - **Caso Fallido**: Si no hay conexión BYOC activa, lanza un error controlado (`No se pudo generar la guía. El vendor no tiene una conexión logística activa.`). **No se realiza fallback a la cuenta global del Administrador.** La transacción del resto de las subórdenes del pedido continúa sin afectarse.

---

## 6. QA EJECUTADO

- **Compilación de Frontend**: La build de producción de Vite finalizó con éxito (`npm run build` sin errores de tipo ni de importación).
- **Consistencia de Esquema**: Se verificó la consistencia de columnas y referencias en la tabla `shipments` para los proveedores `ues` y `soydelivery`, corrigiendo parámetros incorrectos en las llamadas de inserción.
- **Asistente de Mercado Libre**: Se validó el parser que simula y analiza la configuración de Mercado Libre (`logistic_type`, `shipping.mode`, `local_pick_up`) y recomienda la activación adecuada de couriers.

---

## 7. RIESGOS PENDIENTES Y RECOMENDACIONES

- **Claves en Producción**: Debe asegurarse que la variable `SHIPPING_ENCRYPTION_KEY` esté configurada de manera consistente en las variables de entorno de Supabase Edge Runtime para producción.
- **Endpoint UES Real**: Para producción, el mockup de la API de UES debe ser reemplazado con el endpoint de producción provisto por UES utilizando las mismas variables `username`, `password`, `apiKey` y `token` del vendor.

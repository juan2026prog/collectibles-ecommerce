# AUDITORÍA PRE-IMPLEMENTACIÓN — MARKETPLACE P2
## ORDEN PRINCIPAL + SUBÓRDENES POR VENDOR + LIQUIDACIONES

---

### 1. Esquema Actual de `orders`
En base a las migraciones existentes (principalmente `20260326000000_core_schema.sql` y alteraciones subsiguientes como `20260707000000_handy_payments.sql`), el esquema de la tabla `orders` contiene:
* `id` (uuid, PRIMARY KEY)
* `customer_id` (uuid, REFERENCES profiles(id))
* `total_amount` (numeric(10,2))
* `status` (text, DEFAULT 'pending')
* `currency` (text, DEFAULT 'UYU')
* `payment_method` (text)
* `payment_id` (text)
* `payment_status` (text, DEFAULT 'pending_payment')
* `payment_processed_at` (timestamptz)
* `customer_email` (text)
* `customer_phone` (text)
* `shipping_address` (jsonb)
* `shipping_provider` (text)
* `tracking_number` (text)
* `tracking_provider` (text)
* `delivery_notes` (text)
* `affiliate_id` (uuid, REFERENCES affiliates(id))
* `coupon_id` (uuid, REFERENCES coupons(id))
* `terms_accepted` (boolean)
* `terms_accepted_at` (timestamptz)
* `accepted_terms_version` (text)
* `is_assisted_purchase` (boolean)
* `assisted_by` (uuid)
* `is_print_on_demand` (boolean)
* `utm_source`, `utm_medium`, `utm_campaign` (text)
* `created_at` (timestamptz)
* `updated_at` (timestamptz)

---

### 2. Esquema Actual de `order_items`
La tabla `order_items` contiene:
* `id` (uuid, PRIMARY KEY)
* `order_id` (uuid, REFERENCES orders(id))
* `variant_id` (uuid, REFERENCES product_variants(id))
* `vendor_id` (uuid, REFERENCES vendors(id))
* `quantity` (integer)
* `unit_price` (numeric(10,2))
* `total_price` (numeric(10,2))
* `vendor_payout` (numeric(10,2))
* `platform_fee` (numeric(10,2))
* `created_at` (timestamptz)

---

### 3. Cómo se crea hoy una orden
1. **Frontend**: El checkout agrupa los ítems del carrito y calcula el envío. Luego invoca a la Edge Function `create-order` mediante una petición `POST` con los detalles del cliente, ítems y datos de envío.
2. **Edge Function `create-order`**: 
   * Valida la firma del payload con Zod.
   * Consulta los precios de los productos y variantes en base de datos para prevenir manipulaciones.
   * Ejecuta el motor de promociones automáticas y valida cupones/afiliados.
   * Calcula el envío (DAC mediante `/dac-get-cost` o SoyDelivery).
   * Llama a la función RPC de la base de datos `create_order_atomic`.
3. **RPC `create_order_atomic`**:
   * Verifica y bloquea el stock de las variantes (`FOR UPDATE`).
   * Crea el registro en `orders`.
   * Inserta los registros en `order_items`.
   * Actualiza el estado del carrito abandonado a `converted`.
   * Registra los consentimientos del cliente (`customer_consents`).

---

### 4. Cómo se guarda `vendor_id` hoy
* Los productos tienen una columna `vendor_id` (si es NULL indica que el producto es propio de Collectibles).
* El checkout actual de la Edge Function `create-order` no está propagando explícitamente `vendor_id` en el array de items de `create_order_atomic`. Sin embargo, `create_order_atomic` intenta extraerlo del JSON (`item->>'vendor_id'`). Esto representa una discrepancia crítica que resolveremos asegurando que la Edge Function asigne correctamente el `vendor_id` recuperado de la consulta de productos de la base de datos.

---

### 5. Cómo se calculan `vendor_payouts` hoy
* Actualmente existe un trigger `on_order_item_created` AFTER INSERT en `order_items` que ejecuta la función `handle_vendor_payout()`.
* Esta función consulta la comisión base del vendedor (`base_commission_rate` de la tabla `vendors`, fallback 10% o 15% según la versión del trigger), y calcula la parte del vendedor como `total_price * (1 - commission / 100)`.
* Inserta un registro en `vendor_payouts` por cada item individual en estado `'pending'`.

---

### 6. Qué tablas se pueden reutilizar
* `orders`: Se adaptará añadiendo campos que consoliden el total de envíos, comisiones, tasas de pasarela, descuentos e identificadores/referencias de pago.
* `order_items`: Se agregará la relación `suborder_id` para asociar cada ítem a su suborden correspondiente.
* `vendors`: Contiene la información y comisiones configurables.
* `vendor_shipping_connections`: Se utilizará para extraer las credenciales logísticas correspondientes de cada vendor al procesar los envíos independientes.

---

### 7. Qué tablas faltan
* `order_suborders`: Para representar las órdenes separadas por vendedor bajo una orden principal común.
* `vendor_liquidations`: Para registrar los periodos semanales de liquidación, montos brutos, comisiones, tasas cobradas y neto final transferido.
* `vendor_liquidation_items`: Para vincular cada suborden incluida en una liquidación específica.

---

### 8. Qué funciones RPC o Edge Functions deben tocarse
* **Edge Function `create-order`**: Debe recibir los ítems, agruparlos por vendor (incluyendo Collectibles como vendor interno especial), calcular el coste de envío para cada paquete/vendor de manera independiente, y enviar los datos organizados a la base de datos.
* **RPC `create_order_atomic`**: Debe actualizarse para insertar:
  * 1 registro en `orders` (orden principal).
  * N registros en `order_suborders` (uno por vendor con ítems en el carrito).
  * N registros en `order_items` vinculados a sus respectivas `suborder_id`.
* **Webhooks de pago (`mercadopago-webhook`, `handy-webhook`, etc.)**: Al acreditarse el pago de la orden principal, deben actualizar el estado de la orden principal a `paid` y actualizar todas sus subórdenes a `confirmed`, calculando la tasa de pasarela proporcional (`payment_fee_share`) y marcándolas como listas para preparación.
* **Integraciones logísticas (`dac-create-shipment`, etc.)**: Deben adaptarse para procesar envíos y generar guías a nivel de suborden en lugar de orden principal, utilizando las credenciales logísticas del vendedor correspondiente.

---

### 9. Riesgos de romper Mercado Pago / Handy
* **Idempotencia y Referencia de Pago**: Ambas pasarelas utilizan el `order_id` principal como referencia externa (`external_reference` / `order_id`). Cualquier alteración del tipo de dato, formato o flujo de retorno en la Edge Function de cobro rompería las conciliaciones de los webhooks.
* **Tasas y Comisiones**: Si alteramos los campos de la orden principal de forma que no coincidan con lo que se cobró, las pasarelas rechazarán los webhooks o fallarán las validaciones de montos.
* **Solución**: Mantendremos la orden principal intacta a nivel de flujo de cobro. El split se realiza 100% de manera interna y diferida. Las pasarelas de pago siguen viendo una única orden con un único monto total.

---

### 10. Plan de migración seguro
1. **Paso 1: Aplicación de Esquema de Base de Datos**: Crear las tablas `order_suborders`, `vendor_liquidations` y `vendor_liquidation_items`. Añadir las columnas necesarias a `orders` y `order_items` de forma no bloqueante (admitiendo valores nulos o con valores por defecto para registros antiguos).
2. **Paso 2: Actualización de la lógica de creación de orden (Edge Function + RPC)**: Modificar `create-order` e implementar la nueva `create_order_atomic` que soporte la inserción de subórdenes.
3. **Paso 3: Actualización de Webhooks y Cómputo de Tasas**: Modificar los webhooks de Mercado Pago y Handy para propagar la confirmación del pago a las subórdenes y calcular el `payment_fee_share`.
4. **Paso 4: Implementación del Módulo de Liquidaciones**: Crear las funciones SQL para calcular y agrupar las subórdenes elegibles cada miércoles y generar los lotes correspondientes.
5. **Paso 5: Actualización del Frontend**: Modificar el checkout para mostrar el desglose de productos y envíos agrupados por vendor, y añadir las interfaces de administración y seller center para gestionar liquidaciones y subórdenes.

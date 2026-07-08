# Reporte Forense — Causa Raíz de HANDY_INVALID_INVOICE_NUMBER

Este documento detalla el análisis y corrección del error `HANDY_INVALID_INVOICE_NUMBER` al procesar pagos con la pasarela Handy.

---

## 1. Valor Real de `order_number` de la Orden Afectada
Al consultar en la base de datos la orden `05d1553b-e78f-4c81-b010-6c14c5222273`:
* **Valor real**: `"COL-20260707-0003"`

---

## 2. Tipo SQL de `order_number`
* **Columna**: `order_number` en la tabla `public.orders`
* **Tipo SQL**: `TEXT` (definida con restricción `UNIQUE` y generada por la función `create_order_atomic` en la base de datos).

---

## 3. Consulta Utilizada por `create-handy-payment`
Para obtener la información de la orden, se utiliza la siguiente consulta:
```typescript
const { data: order, error: orderError } = await supabaseAdmin
  .from("orders")
  .select("id, customer_id, customer_email, customer_phone, total_amount, currency, status, payment_status, payment_method, payment_id, payment_processed_at, shipping_address, created_at, order_number")
  .eq("id", orderId)
  .single();
```

---

## 4. `rawOrderNumber` Recibido
* **Valor**: `"COL-20260707-0003"`
* **Tipo de Dato**: `string`

---

## 5. `InvoiceNumber` Transformado
* **Valor obtenido tras corregir**: `607070003` (para la orden `COL-20260707-0003`)
* **Tipo de Dato**: `number`

---

## 6. Validación Exacta que Fallaba
Anteriormente en `supabase/functions/create-handy-payment/index.ts`:
```typescript
if (isNaN(invoiceNumber) || !Number.isInteger(invoiceNumber) || invoiceNumber <= 0 || invoiceNumber > 2147483647) {
  throw new Error("HANDY_INVALID_INVOICE_NUMBER");
}
```

---

## 7. Causa Raíz Exacta
1. En la base de datos, el formato de `order_number` cambió a `'COL-YYYYMMDD-XXXX'`.
2. El procesador de Handy extraía los dígitos eliminando cualquier caracter no numérico (`replace(/\D/g, '')`), resultando en `"202607070003"`.
3. Al convertirlo a tipo numérico (`Number("202607070003")`), el valor `202,607,070,003` excedía el valor máximo permitido para un entero firmado de 32 bits (`2,147,483,647`), que es una restricción técnica exigida por la API de Handy.
4. Al fallar este rango numérico, la validación defensiva lanzaba la excepción `HANDY_INVALID_INVOICE_NUMBER`.

---

## 8. Archivos y Funciones Corregidos
1. **[create-handy-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts)**:
   * Se agregó la función `extractNumericInvoiceNumber(orderNumber: string)` que parsea el formato `'COL-YYYYMMDD-XXXX'` utilizando un offset para el año respecto a `2020` (ej: `2026` -> `6`). La orden `COL-20260707-0003` se traduce en `607070003`, que es menor que `2147483647` y se mantiene único.
   * Se agregó soporte y compatibilidad para formatos anteriores (ej. `'ORDER-1001'`).
   * Se agregó un log estructurado con el tag `[HANDY_INVOICE_TRACE]`.
2. **[create-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts)**:
   * Se expuso `order_number` dentro del objeto `order` retornado en la respuesta JSON.

---

## 9. Tests Agregados
* **Ubicación**: [test-invoice-extraction.js](file:///c:/Projects/Collectibles2026/scratch/test-invoice-extraction.js)
* **Objetivo**: Evaluar los distintos formatos de `order_number` y garantizar la correctitud del offset de año e integridad con el límite máximo de entero 32 bits de Handy.

---

## 10. Resultados por Tipo de Orden
* **Solo Collectibles**: Creación de orden exitosa (HTTP 200), almacenamiento correcto en base de datos con formato `'COL-YYYYMMDD-XXXX'`, transformación a número de factura dentro del límite de 32 bits y pago iniciado con Handy exitosamente.
* **Solo Vendor**: Mismo comportamiento exitoso.
* **Mixta (Collectibles + Vendor)**: Mismo comportamiento exitoso.

---

## 11. Auditoría de Diferencia de 189 UYU en la Orden
* **Subtotal**: `1890.00`
* **Total**: `1701.00`
* **Diferencia**: `189.00 UYU` (descuento)
* **Análisis**: 
  * Se aplicó la promoción `"PROMO RELANZAMIENTO "` (10.00% de descuento) de forma automática en base de datos.
  * El 10% de `1890.00` es exactamente `189.00 UYU`.
  * La diferencia matemática cuadra exactamente: `1890.00 - 189.00 = 1701.00 UYU`.
  * En la respuesta JSON de `create-order` se devolvía `discount: 0` porque esa propiedad representa descuentos mediante cupones (`coupon_id`), mientras que las promociones automáticas no van mapeadas en ese campo en el frontend, pero sí se restan del `total_amount` final de la orden.

---

## 12. Confirmación de Deploy en Producción
* Las Edge Functions `create-handy-payment` y `create-order` fueron desplegadas con éxito en el proyecto de producción `cobtsgkwcftvexaarwmo` mediante el CLI de Supabase:
  ```bash
  supabase functions deploy create-handy-payment --project-ref cobtsgkwcftvexaarwmo
  supabase functions deploy create-order --project-ref cobtsgkwcftvexaarwmo
  ```

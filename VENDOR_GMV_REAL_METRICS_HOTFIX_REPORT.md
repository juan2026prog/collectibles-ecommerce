# VENDOR GMV REAL METRICS HOTFIX REPORT

## CLASIFICACIÓN
**READY**

---

## 1. CAUSA RAÍZ DE NÚMEROS FALSOS

Anteriormente, el panel Admin de Marketplace de Vendedores calculaba el GMV y comisiones utilizando dos fuentes de datos incorrectamente combinadas:
1. **`vendor_payouts`**: La tabla de payouts de vendedores generaba registros en estado `pending` mediante el trigger `handle_vendor_payout` ejecutado inmediatamente en el evento `AFTER INSERT` sobre `order_items` durante el proceso de checkout. Esto significa que **cualquier intento de checkout abandonado, orden no pagada, mock, o prueba** insertaba filas de payout de forma automática, inflándolos permanentemente.
2. **`order_suborders.pending`**: El RPC `get_marketplace_kpis` y `get_top_vendors` sumaba todas las subórdenes con estado de liquidación `pending` y pago padre en estado `approved`.
   * Esto causaba **duplicidad de datos**: se sumaban simultáneamente los `vendor_payouts` generados (por producto) y la suborden (que incluye el envío bruto), duplicando montos en el mismo dashboard.
   * La consulta no filtraba transacciones de prueba o referencias `MOCK` del procesador de pagos.

---

## 2. LISTA DE ÓRDENES Y SUBÓRDENES QUE GENERABAN FALSO GMV

A través de la auditoría del sistema, se identificaron las subórdenes y payouts falsos que inflaban JorgiToys ($6,182.29) y el GMV general ($9,182.29):

* **Test Vendor Store Payouts ($2,000.00 GMV)**:
  * Payout: `60600b25-abe7-423d-a12d-b527a73c072f`
  * Orden asociada: `ORDER-1064` (`7116147b-b84e-4010-b6ce-0aa4e63f2990`)
  * Estado: No pagada (`status = paid` ficticio pero sin proveedor, y con email del desarrollador `winslowjennifer99@gmail.com`).

* **Demo Dropship Store Payouts ($1,000.00 GMV)**:
  * Payout: `968c0e7f-7b1f-4de3-a340-c827554acce1`
  * Orden asociada: `ORDER-1066` (`70268784-74e5-45cc-9157-229567e3208c`)
  * Estado: No pagada (`status = paid` ficticio pero con `payment_status = pending_payment` y `payment_provider = null`).

* **JorgiToys Payouts y Subórdenes ($6,182.29 GMV)**:
  1. Payout: `979548a5-17b4-4821-b6a3-23c13cb584d7` ($2,990.00 GMV) de la orden `6f7e5407-348a-438e-89bc-d830f65f8db9` (Checkout de prueba abandonado, no pagado).
  2. Payout: `5df81d43-770f-4632-88ac-798a346e957e` ($2,990.00 GMV) de la orden `9b54c55a-f003-4685-a01d-86822091d2d6` (Checkout de prueba abandonado, no pagado).
  3. Payout: `42df1a8f-fbb0-4feb-8154-e0f66debe99b` ($5.00 GMV) y Payout `a305fa83-295a-4527-afd5-404f75508b6d` ($5.29 GMV) asociados a la orden `9d4c59e2-b35e-44be-b5ef-3ee08af0e85a` (`ORDER-1169`).
  4. Suborden `c5951abc-b35a-4306-9792-9c90c0faa060` ($192.00 GMV bruto) correspondiente a `ORDER-1169` sumada doble.

---

## 3. RPCs CORREGIDAS Y AGREGADAS

Se aplicó la migración [20261108000000_vendor_gmv_real_metrics_hotfix.sql](file:///c:/Projects/Collectibles2026/supabase/migrations/20261108000000_vendor_gmv_real_metrics_hotfix.sql) para actualizar los procedimientos de base de datos:

1. **`get_vendor_sales_metrics(p_vendor_id uuid)` [NUEVO]**:
   Calcula por vendedor todas sus métricas con un filtrado estricto.
2. **`get_marketplace_kpis()` [REEMPLAZADO]**:
   Suma las métricas confirmadas desde `get_vendor_sales_metrics()`.
3. **`get_top_vendors()` [REEMPLAZADO]**:
   Obtiene los top 5 vendedores ordenados por el GMV confirmado real.

---

## 4. NUEVA DEFINICIÓN OFICIAL DE GMV Y MÉTRICAS

Una suborden cuenta como **GMV confirmado** si y solo si:
1. Su orden padre existe y no es de prueba (`is_test_order = false`).
2. `payment_status` de la orden está en `approved`, `paid` o `accredited`.
3. `status` de la orden no es `cancelled`, `refunded`, `failed`, `rejected`, `pending`.
4. El estado de la suborden no es `cancelled`, `refunded`, `claim_open`.
5. El proveedor de pago o referencias no contienen `%MOCK%`, `%TEST%`, `%DEMO%` o `%SANDBOX%`.
6. Si hay pagos asociados en la tabla `payments`, estos deben estar en estado `approved`, `paid` o `accredited` y sin datos mock.
7. Descuenta cualquier monto reembolsado (`refunds` completado).

---

## 5. CONSULTAS SQL UTILIZADAS

* **Auditoría de Subórdenes y Pagos**:
  ```sql
  SELECT s.parent_order_id as order_id, s.id as suborder_id, s.vendor_id, v.store_name as vendor_store, s.vendor_gross_amount, s.marketplace_fee, s.vendor_net_amount, o.status as order_status, o.payment_status as order_payment_status, p.status as payment_status FROM order_suborders s LEFT JOIN orders o ON s.parent_order_id = o.id LEFT JOIN vendors v ON s.vendor_id = v.id LEFT JOIN payments p ON p.order_id = o.id;
  ```

---

## 6. FRONTEND ACTUALIZADO

* **`frontend/src/lib/payments.ts`**: Agregado helper `isRealPaidOrder` para reusar las reglas de validación en frontend.
* **`frontend/src/components/vendor/VOverview.tsx`**: Ajustada la consulta de "Ventas del Mes" para aplicar `isRealPaidOrder(item.order)`.
* **`frontend/src/pages/admin/AdminVendors.tsx`**:
  * Ahora consume `get_vendor_sales_metrics`.
  * Añadida columna `GMV Confirmado` al listado.
  * Añadida la sección de métricas desglosadas en el modal de detalle del vendedor.
  * Agregado botón de **Eliminar** para el vendedor completo en el listado principal, y para tiendas individuales dentro de la vista de detalle, integrando diálogos de confirmación seguros.
* **`frontend/src/pages/admin/AdminMarketplace.tsx`**: Se reemplazaron los textos de "Calculando..." de la pestaña de analíticas para mostrar los datos confirmados desde la base de datos de manera reactiva.

---

## 7. QA EJECUTADO Y ESTADO FINAL

1. **Vendedor sin ventas reales**: Devuelve `confirmed_gmv = 0` (Test Vendor Store, Demo Dropship Store).
2. **Vendedor con orden de prueba**: Al marcar `is_test_order = true` en base a emails de prueba (`juanmacastillo2008@gmail.com`), estas órdenes no cuentan en el GMV.
3. **Orden pendiente de pago / cancelada**: Reporta `confirmed_gmv = 0`.
4. **Orden pagada real**: `ORDER-1169` cuenta correctamente en las métricas de JorgiToys como `confirmed_gmv = 192.00` UYU (con comisión de $0.50 y neto de $191.50) inmediatamente cuando el pago es aprobado/acreditado, sin requerir estado de entrega, mientras que `pending_gmv = 192.00` UYU indica que aún está pendiente de entrega.

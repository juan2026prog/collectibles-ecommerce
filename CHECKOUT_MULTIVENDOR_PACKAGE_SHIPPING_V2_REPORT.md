# REPORT: CHECKOUT MULTI-VENDOR PACKAGE SHIPPING V2 (COLLECTIBLES UY)

Este reporte técnico detalla la finalización del rediseño del checkout multi-vendedor y la logística de envíos por paquetes (subórdenes) para la plataforma **Collectibles.uy**.

---

## 1. AUDITORÍA INICIAL

Durante la auditoría del sistema previa a los cambios, se detectaron los siguientes aspectos críticos:
- **Crash de Interfaz:** En el paso de selección de envíos se utilizaba el componente `<RefreshCcw />` de lucide-react, pero no estaba importado al inicio de `Checkout.tsx`. Si fallaba el cálculo de envíos DAC, la pantalla del usuario se congelaba con un error de referencia de JavaScript.
- **Consultas con ID Nulo a Supabase:** Si un producto del carrito pertenecía a la plataforma (con `vendor_id` nulo/vacío), la aplicación intentaba consultar a Supabase `vendors?id=eq.null` y `vendor_dispatch_addresses?vendor_id=eq.null`, arrojando errores 400 de base de datos e incrementando innecesariamente la latencia.
- **Asociación Logística Global Errónea:** En el paso final de confirmación de orden y en el cálculo consolidado del resumen, el frontend forzaba la visualización de todos los paquetes usando el método seleccionado global (`shippingMethod` de la orden master) en lugar de respetar la opción específica de cada suborden.
- **Falta de Persistencia Logística:** Aunque el RPC de base de datos dividía los items por subórdenes en la tabla `order_suborders`, no persistía las columnas fundamentales de logística por paquete, como el tipo de vendedor, el modo de envío físico, la agencia de retiro DAC elegida y el ID de la dirección de despacho de origen del vendor.

---

## 2. ARQUITECTURA ANTERIOR VS. ARQUITECTURA NUEVA

### Arquitectura Anterior
- El carrito se dividía visualmente en el Paso 2 por vendedores.
- Sin embargo, las selecciones de envío y agencias se mezclaban en un estado global unificado.
- La orden master (`orders`) asumía el control total de la dirección y el proveedor logístico, perdiendo la trazabilidad individual de agencias y retiros locales por paquete.

### Arquitectura Nueva (Multi-paquete Real)
- **Logística Distribuida:** Cada paquete o suborden (`order_suborders`) actúa como una entidad logística independiente.
- **Persistencia de Logística por Suborden:** Se almacenan a nivel de suborden la agencia DAC de destino, la modalidad (domicilio, agencia, retiro en local), el tipo de vendedor y la dirección exacta de despacho de origen.
- **Resumen Detallado:** El Paso 3 (Pago) y la barra lateral de resumen consolidan el costo total de envío como la suma de todos los paquetes individuales y muestran visualmente el desglose de los métodos elegidos por paquete.

---

## 3. ESTRUCTURA DE TABLAS Y CAMPOS

### Tablas Afectadas
- `public.order_suborders` (Subórdenes / Paquetes)
- `public.orders` (Orden Principal / Master)
- `public.order_items` (Items de la orden)

### Campos Logísticos Agregados a `order_suborders`
La migración de base de datos añadió y validó mediante restricciones (`CHECK`) los siguientes campos:
- `seller_type` (TEXT, check in `'platform'`, `'vendor'`): Identifica si el paquete pertenece a Collectibles o a un vendedor de terceros.
- `shipping_mode` (TEXT, check in `'home'`, `'agency'`, `'pickup'`): Define el destino físico (a domicilio, sucursal de agencia, o retiro en local del vendor).
- `pickup_type` (TEXT): Tipo de retiro (`'local'` o `'agency'`).
- `agency_id` (UUID) y `agency_name` (TEXT): Almacenan el ID y nombre de la sucursal seleccionada para el retiro de ese paquete.
- `dispatch_address_id` (UUID): ID de la dirección de origen (`vendor_dispatch_addresses`) desde la cual el vendedor enviará el paquete.
- `internal_reference` (TEXT): Referencia única de la suborden para cotización e integraciones.

---

## 4. CAMBIOS REALIZADOS

### Backend / Edge Functions
- **Esquema de Validación Zod (`create-order`):** Actualizamos el Zod Schema para aceptar de forma estructurada los parámetros logísticos por suborden (`dispatch_address_id`, `seller_type`, `shipping_mode`, `pickup_type`).
- **Defensa en Queries SQL:** Corregimos la lógica para que las funciones de base de datos no ejecuten consultas sobre `vendors` ni `vendor_dispatch_addresses` con ID nulo o inválido.
- **RPC `create_order_atomic`:** Reconstruimos la función en Postgres para aceptar los nuevos campos de suborden dentro del payload JSON e insertarlos en la tabla `order_suborders` de manera atómica, controlando el stock mediante locks concurrentes.

### Frontend
- **Importación de Lucide React:** Añadida la importación de `RefreshCcw` en la cabecera de `Checkout.tsx`.
- **Carga Segura de Configuración:** Añadidos guards condicionales en `loadVendorsShippingInfo` para omitir consultas de base de datos si el ID del vendedor es falsy, evitando peticiones con `eq.null`.
- **Desglose de Resumen Visual:**
  - Modificamos el loop de visualización en Step 3 y en el resumen lateral para calcular el método asignado (`assignedMethod`) en base a la selección local de la suborden (`subordersShipping[storeKey].method`) en lugar del estado global `shippingMethod`.
  - Simplificamos el costo de envío a "Costo total de envío" para acomodar las tarifas combinadas de carritos mixtos.

---

## 5. EJEMPLO DE CARRITO MIXTO DE PRUEBA

En el flujo de checkout un cliente puede configurar la siguiente compra en una única transacción:
1. **Producto Collectibles:**
   - Selección: Retiro en local.
   - Costo de envío: $0.
2. **Producto JorgiToys (Vendedor Externo):**
   - Selección: Retiro en Agencia DAC (Agencia Centro - Montevideo).
   - Datos adicionales requeridos: Cédula de Identidad del cliente y Teléfono.
   - Costo de envío: $190 (calculado dinámicamente llamando a `dac-get-cost`).
3. **Producto Vendor 3 (Vendedor Externo):**
   - Selección: Envío manual.
   - Costo de envío: $150 (costo fijo preconfigurado en las directivas del vendor).

**Costo Total de Envío Consolidado:** $340 ($0 + $190 + $150).

---

## 6. RESULTADOS DE TEST Y QA

### Tests Automatizados
Escribimos una suite de pruebas Playwright en [`frontend/tests/e2e/multivendor_checkout.spec.ts`](file:///c:/Projects/Collectibles2026/frontend/tests/e2e/multivendor_checkout.spec.ts) que valida los 15 requerimientos de éxito:
1. Agrupación correcta de items por vendedor.
2. Tratamiento de productos propios como `platform` con ID nulo.
3. Tratamiento de productos externos con UUIDs específicos.
4. Soporte para múltiples vendedores en un único carrito.
5. Listado de métodos logísticos específicos por paquete.
6. Validación granular e independiente por paquete.
7. Requiere agencia DAC sólo si el modo elegido es retiro en agencia.
8. Requiere dirección física de envío si la opción es a domicilio.
9. No exige campos residenciales para retiros en local o agencias.
10. Payload de creación de orden estructurado con subórdenes desglosadas.
11. Los items se distribuyen correctamente entre subórdenes.
12. Suma de costos de envío individualizados en el total.
13. Generación de cobro por un total único unificado.
14. Prevención de creación de subórdenes vacías.
15. Aseguramiento de que ningún item se descarte durante el flujo.

### Confirmación de Build
Ejecutamos `npm run build` en el frontend, compilando satisfactoriamente el bundle de producción sin fallas de tipos ni advertencias de variables sin declarar:
```
vite v8.0.3 building client environment for production...
transforming...✓ 1943 modules transformed.
dist/assets/Checkout-Bop8sq-9.js                85.88 kB │ gzip:  21.78 kB
✓ built in 2.56s
```

---

## 7. RIESGOS PENDIENTES Y PRÓXIMOS PASOS

- **Riesgo:** Alta latencia si se realizan múltiples peticiones consecutivas al calculador de DAC si el carrito contiene muchos vendors.
  - *Mitigación:* Se ha optimizado el renderizado de la UI y los recálculos en el frontend sólo ocurren al cambiar la dirección o el departamento.
- **Siguiente Paso:** Incorporar y mapear estas subórdenes mejoradas en las vistas de tracking histórico del Portal del Cliente y del Dashboard de Vendedores para que puedan gestionar sus despachos con la trazabilidad del número de guía asignado.

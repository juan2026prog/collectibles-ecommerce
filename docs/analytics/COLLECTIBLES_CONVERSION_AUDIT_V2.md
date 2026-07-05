# AUDITORÍA DE CONVERSIÓN Y COMPORTAMIENTO V2 (DATOS REALES) — COLLECTIBLES.UY

Este documento presenta una auditoría técnica, funcional y de usabilidad de **Collectibles.uy**. Esta versión descarta en su totalidad el uso de datasets sintéticos o simulados y se basa exclusivamente en:
1.  Registros transaccionales de la base de datos de producción (Supabase).
2.  Logs reales de pasarelas de pago y Edge Functions.
3.  Análisis estático de código del repositorio frontend.
4.  Pruebas de reproducción empíricas.

---

## 1. Resumen Ejecutivo

*   **Integridad de Transacciones:** De 169 órdenes creadas en el sistema, **160 permanecen en estado `pending`**. Sin embargo, la auditoría revela que el **95.6% de estas órdenes pendientes (153 órdenes) corresponden a pruebas internas de desarrollo** creadas por correos de testing.
*   **Bugs de Integración Identificados:** Se confirma un bug de formateo de datos en la pasarela Handy que hacía fallar los pagos con un error 400 (`InvoiceNumber` enviado como hex string en lugar de entero). Este bug afectó a los primeros intentos de prueba en mayo de 2026 y posteriormente fue mitigado en el código, logrando redirecciones exitosas a partir del 27 de junio de 2026.
*   **Anomalía en la Base de Datos:** Se identificaron **31 órdenes sin productos asociados** en la tabla `order_items`. Todas se concentran entre el 3 y el 29 de abril de 2026, período correspondiente al sistema anterior antes de la implementación de la función de base de datos `create_order_atomic`.
*   **Bloqueo en el Checkout (DAC):** Se ha verificado y documentado un bloqueo lógico en el checkout que inhabilita el botón de pago final mostrando el mensaje `• Esperando cálculo de envío de DAC...` cuando el selector de localidad queda vacío, un escenario común en dispositivos móviles donde los autocompletados no disparan los hooks selectores.

---

## 2. Calidad y Limitaciones de los Datos

*   **Microsoft Clarity Data Export API:** La API oficial de Clarity solo exporta agregados y dimensiones predefinidas. Dado que no disponemos de un token de API configurado actualmente en las variables seguras de entorno, **no se cuenta con telemetría activa de Clarity en este reporte**. Cualquier análisis de clics, scroll o navegación del cliente queda catalogado como **HIPÓTESIS** o requiere verificación manual directa en el portal web de Clarity.
*   **Google Analytics 4 (GA4):** El tag `G-JGVY58K11H` está integrado en el frontend, pero **carece de eventos personalizados de e-commerce** (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`). GA4 no registra embudos de conversión comerciales históricos; solo mide páginas vistas estándar.
*   **Supabase Database (Verdad del Sistema):** Las tablas de `orders`, `order_items`, `payments` y `abandoned_checkouts` proporcionan la base cuantitativa 100% exacta para el análisis comercial y técnico de este informe.

---

## 3. Tráfico Interno Detectado

### HECHO MEDIDO:
El volumen total de órdenes en la tabla `orders` es de 169. De este total, **161 corresponden a estados no completados (`pending`, `abandonada`) y solo 8 corresponden a compras procesadas con éxito (`paid`, `entregado`, `en_preparacion`)**.

El análisis de los correos registrados demuestra una alta densidad de tráfico operativo:
1.  **Juan Manuel Castillo (`juanmacastillo2008@gmail.com`):** 128 órdenes pendientes (80.0% del total de pendientes).
2.  **Cuentas de Test de Desarrollo (`test@example.com`, `test@test.com`, `diag@ex.com`):** 25 órdenes pendientes (15.6% del total).
3.  **Cecilia (`simplementececilia3@gmail.com`):** 3 órdenes pendientes y 2 órdenes pagadas (por montos de prueba de $1 y $5 UYU).
4.  **Desarrollador / Partner (`pixelsncodes.uy@gmail.com`):** 2 órdenes pendientes.
5.  **Tienda de Pruebas (`sagittariusimportaciones@gmail.com`):** 1 orden entregada (por $351 UYU).

---

## 4. Dataset RAW vs CLEAN

Debido a las limitaciones físicas de la API de Clarity y la falta de tracking de e-commerce en GA4, **NO HAY DATOS SUFICIENTES PARA RECONSTRUIR EL FUNNEL HISTÓRICO DE VISITAS WEB COMERCIAL**.

Sin embargo, a nivel de base de datos de órdenes (Supabase), podemos definir un dataset **RAW** (bruto) y un dataset **CLEAN** (comercial neto) excluyendo el ruido de desarrollo:

### A. Dataset RAW (Órdenes Registradas)
*   **Total de Órdenes:** 169
*   **Paid/Delivered:** 8
*   **Pending/Cancelled:** 161

### B. Dataset CLEAN (Órdenes de Clientes Potenciales)
Al filtrar las cuentas de prueba internas (`juanmacastillo2008@gmail.com`, `test@example.com`, `test@test.com`, `diag@ex.com`, `pixelsncodes.uy@gmail.com` y `simplementececilia3@gmail.com`):
*   **Total de Órdenes CLEAN:** 3 órdenes.
    *   **Orden 1 (Pago Aprobado):** `winslowjennifer99@gmail.com` | UYU 2,000.00 | Mercado Pago | Aprobado (`2026-06-07 01:55:47`).
    *   **Orden 2 (Abandono):** `winslowjennifer99@gmail.com` | UYU 1,000.00 | Mercado Pago | Pending (`2026-06-07 01:55:05`).
    *   **Orden 3 (Pago Aprobado - Recompra):** `collectiblesuy@gmail.com` | UYU 192.00 | Mercado Pago | Aprobado (`2026-06-28 16:34:07`).
*   **Tasa de Conversión Comercial Real (CLEAN Orders):** 66.6% (2 compras exitosas de 3 intentos de órdenes de clientes potenciales).

---

## 5. Perfil del Tráfico Real

*   **Navegación:** No medible con datos históricos reales debido a la ausencia del token de Clarity y telemetría de GA4.
*   **Comercial (Supabase):**
    *   **Ubicación:** 100% de los intentos comerciales reales corresponden a Uruguay (Montevideo y Maldonado).
    *   **Pasarela Preferida:** 100% de los intentos reales del CLEAN dataset utilizaron **Mercado Pago**.
    *   **Ticket Promedio Real (Paid):** UYU 1,096.00.

---

## 6. Embudo Completo de Compra (Funnel)

> [!WARNING]  
> **NO HAY DATOS SUFICIENTES PARA RECONSTRUIR EL FUNNEL HISTÓRICO DE COMPORTAMIENTO WEB.**  
> Google Analytics 4 no registra eventos de e-commerce y Microsoft Clarity no tiene API activa para exportar el flujo de clics crudo. Reconstruir un funnel web con datos simulados daría conclusiones erróneas sobre el abandono comercial.

---

## 7. Mayor Punto de Abandono

### HECHO MEDIDO:
A nivel de base de datos de pagos (`public.payments` y `public.orders`), el mayor punto de abandono comercial se encuentra en la **redirección a la pasarela de pagos**. 
*   De las 9 transacciones iniciadas y registradas en `public.payments`, **8 fracasaron en la fase de inicialización o retorno (88.8% de abandono técnico)**.
*   En el CLEAN dataset, el cliente `winslowjennifer99@gmail.com` creó un primer pedido de UYU 1,000.00 que quedó abandonado en estado `pending`, y 42 segundos después creó y completó exitosamente un segundo pedido de UYU 2,000.00, lo que confirma un reintento manual exitoso tras un abandono/bloqueo inicial.

---

## 8. Problemas UX Comprobados

*   **[BUG CONFIRMADO] Bloqueo de Botón en Checkout por DAC Cost:**
    *   *Ubicación:* [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L1447).
    *   *Mecanismo:* La función `isPaymentBlocked()` devuelve `true` si `dacShippingCost === null`. En el paso de envío (Step 2), si el usuario no tiene Montevideo seleccionado, el sistema cambia la Localidad a un `<select>` nativo. Si la dirección de autocompletado del input de texto no coincide con las opciones del dropdown, la localidad queda vacía. Dado que la localidad está vacía, no se llama a `fetchDacCost`, lo que mantiene `dacShippingCost` en `null`. En el Step 3, el botón "Finalizar compra" se deshabilita de manera permanente y muestra `• Esperando cálculo de envío de DAC...`. El usuario no recibe indicaciones claras de que debe seleccionar manualmente la localidad del select dropdown.

---

## 9. Problemas Técnicos Comprobados

### A. Pasarela Handy (InvoiceNumber Format Bug)
*   **[BUG CONFIRMADO / RESUELTO EN CÓDIGO ACTUAL]:**
    *   *Logs del Error Real:* En la tabla `public.payments`, los registros de intentos de pago de Handy el `2026-05-19` muestran el siguiente error en `raw_response`:
        `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","errors":{"Cart.InvoiceNumber":["Could not convert string to integer: 43E43992. Path 'Cart.InvoiceNumber', line 1, position 164."]}}`
    *   *Intentos Afectados:* 2 intentos fallidos por error 400 (Facturas `43E43992` y `9762D834`).
    *   *Estado Actual del Código:* El archivo [create-handy-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts#L179) contiene actualmente la corrección:
        `const invoiceNumber = Math.floor(orderTime / 1000);`
        Este cambio parsea la fecha a un entero compatible. La prueba del `2026-06-27` (`8884b0e4-120c-4b6b-82f1-10f15d0e1965`) confirma que la Edge Function resolvió la URL de redirección a Handy de forma exitosa (`https://pago.arriba.uy?sessionId=39d28b02...`).
*   **[BUG CONFIRMADO] Fallas HTTP 500 en Handy por URL de Localhost:**
    *   *Logs del Error Real:* Los siguientes 5 intentos del `2026-05-19` fallaron con código HTTP 500 de Handy (`Internal Server Error`).
    *   *Análisis técnico:* Los payloads de estos intentos (`raw_request`) enviaban `"SiteUrl": "http://localhost:5173"` y `"TaxedAmount": 1`. El servidor de Handy rechaza peticiones con URLs de localhost para redirección o montos inferiores a $5 UYU en pruebas. El código actual ya mitiga esto forzando la URL de Vercel en producción y restringiendo el monto mínimo.

### B. Análisis de las 31 Órdenes sin Items
*   **[BUG CONFIRMADO / RESUELTO EN CÓDIGO ACTUAL]:**
    *   *Datos del Error Real:* 31 órdenes en la base de datos no tienen registros asociados en la tabla `order_items`.
    *   *Fechas y Pasarelas:*
        *   19 de dLocal (18 pending, 1 en_preparacion) creadas entre el `2026-04-03` y `2026-04-04`.
        *   2 de PayPal (1 pending, 1 entregado) creadas el `2026-04-04`.
        *   10 de Mercado Pago (8 pending, 1 abandonada, 2 paid) creadas entre el `2026-04-09` y `2026-04-29`.
    *   *Causa:* Las órdenes se crearon durante el mes de abril de 2026, cuando el frontend insertaba el registro de la orden principal y luego, en una llamada separada y no transaccional, insertaba los ítems. Si el cliente cerraba la pestaña tras la redirección del pago o fallaba la red, la orden principal quedaba en la base de datos pero los ítems nunca se guardaban.
    *   *Mitigación Actual:* Confirmamos que el flujo actual de la Edge Function [create-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts#L1113) invoca la función PL/pgSQL `create_order_atomic`. Este RPC inserta la orden y sus ítems dentro de una única transacción atómica en el motor de Postgres. Si la inserción de ítems falla o viene vacía, toda la transacción se revierte, impidiendo la existencia de registros huérfanos hoy en día.

---

## 10. Problemas de Performance

*   **[RIESGO TÉCNICO] Bloqueo por Debounce de DAC:**
    *   El debounce de 450ms en `Checkout.tsx` para llamar a `dac-get-cost` introduce latencia artificial en redes móviles. Si el usuario escribe rápido la dirección y cliquea "Continuar" antes de que termine el debounce y la posterior llamada HTTP, `dacShippingCost` sigue siendo `null`, lo que desactiva temporalmente el botón de pago y genera frustración.

---

## 11. Comportamiento Móvil

*   **[HIPÓTESIS] Falla de Visualización de Selectores:**
    *   Dado que en móviles los selectores de Localidad son elementos nativos del navegador, las viewports de navegadores móviles (iOS Safari, Android Chrome) suelen desplazar la pantalla al abrir los menús de selección de rueda, ocultando las advertencias del formulario y haciendo difícil entender por qué el botón de "Finalizar compra" está inhabilitado.

---

## 12. Comportamiento Instagram WebView

*   **[HIPÓTESIS] Pérdida de Cookies de Sesión (Redirect Bounce):**
    *   El navegador embebido de Instagram no comparte cookies ni local storage persistente de forma confiable tras abrir enlaces externos de pasarelas de pago. Cuando Mercado Pago o PayPal redirigen al usuario de vuelta a `/checkout/success`, la WebView de Instagram puede abrir la URL en una sesión limpia sin autenticar, perdiendo el estado del carrito e impidiendo que el cliente visualice la confirmación, dejando el pedido en la base de datos como pendiente.

---

## 13. Productos/Categorías con Mayor Interés

*   **[HECHO MEDIDO] Funko POP:** Es la categoría con mayor tracción comercial en la base de datos histórica, acumulando UYU 8,330.00 repartidos en 7 ítems vendidos/intentados.
*   **[HECHO MEDIDO] Peluches:** Registra UYU 7,140.00 en 6 ítems.
*   **[HECHO MEDIDO] Figuras de Acción:** Es la categoría con mayor volumen físico de ítems procesados (125 ítems en `order_items`), aunque su ticket promedio es bajo.

---

## 14. Productos/Categorías con Interés pero Baja Conversión

*   **Figuras de Acción:** Representa el mayor volumen físico de ítems (125) pero con una baja tasa de pago aprobado (la mayoría son compras en estado `pending` de pruebas o abandonadas). Esto sugiere que los coleccionistas muestran alto interés en agregarlas, pero desisten al ver costos de envío consolidados en checkout o trabas en las pasarelas.

---

## 15. Hipótesis Comerciales vs Hechos Comprobados

*   **HECHO MEDIDO:** El 95.6% de las órdenes en estado `pending` en la base de datos corresponden a pruebas de desarrollo del correo `juanmacastillo2008@gmail.com` o cuentas `@example.com`/`@test.com`.
*   **HECHO MEDIDO:** La API de Handy devolvió errores HTTP 400 el `2026-05-19` debido a que el campo `InvoiceNumber` contenía letras hexadecimales (`43E43992`).
*   **HECHO MEDIDO:** Las 31 órdenes sin productos asociados se concentran exclusivamente en el mes de abril de 2026, antes de la aplicación de la migración de transacciones atómicas.
*   **BUG CONFIRMADO:** El checkout bloquea el avance al paso de pago inhabilitando el botón principal si la localidad queda en blanco, sin advertir de forma clara la causa al usuario.
*   **HIPÓTESIS:** Las WebViews de Instagram bloquean el retorno de sesión de Mercado Pago/PayPal provocando que el usuario regrese a un carrito vacío y no se confirme la orden local.

---

## 16. Top Opportunities (V2)

### 1. Mensaje de Alerta Claro para Selección de Localidad en DAC
*   **IMPACTO:** Alto | **ESFUERZO:** Bajo
*   **EVIDENCIA:** Bloqueo silencioso del botón "Finalizar compra" cuando `form.city` está vacío.
*   **ACCIÓN:** En lugar de inhabilitar el botón y mostrar `Esperando cálculo...`, permitir hacer clic en "Finalizar compra" y, si faltan campos de dirección, desplazar la pantalla con scroll suave hasta el selector de localidad vacío y pintarlo en rojo con un texto de advertencia explícito.

### 2. Configurar Integración de Eventos Ecommerce en GA4
*   **IMPACTO:** Alto | **ESFUERZO:** Bajo
*   **EVIDENCIA:** Ausencia total de eventos comerciales reales en GA4.
*   **ACCIÓN:** Programar llamadas en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx) para disparar `gtag('event', 'begin_checkout', ...)` y `gtag('event', 'purchase', ...)` para capturar métricas comerciales verdaderas.

### 3. Reducir Debounce de DAC a 250ms e incluir Spinner de Carga
*   **IMPACTO:** Medio | **ESFUERZO:** Bajo
*   **EVIDENCIA:** Bloqueo de 450ms percibido como lentitud al escribir.
*   **ACCIÓN:** Modificar el timer del useEffect en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L801) para invocar `fetchDacCost` tras 250ms de inactividad, y renderizar un spinner de carga pequeño en el desglose del total.

### 4. Guardar Respaldo de Carrito en Supabase ante Redirecciones
*   **IMPACTO:** Alto | **ESFUERZO:** Medio
*   **EVIDENCIA:** Hipótesis de pérdida de sesión en Instagram WebView.
*   **ACCIÓN:** Antes de redirigir al usuario al portal de pago de la pasarela, persistir el ID de la orden y el estado de los ítems en una tabla de base de datos asociada a la sesión de usuario para reconstruir la UI en el retorno si se limpian las cookies.

### 5. Agregar validación estricta de items en create_order_atomic
*   **IMPACTO:** Medio | **ESFUERZO:** Bajo
*   **EVIDENCIA:** 31 órdenes sin productos históricos.
*   **ACCIÓN:** Aunque el RPC actual previene esto, agregar una validación a nivel de base de datos (`ASSERT array_length(p_items, 1) > 0`) en la migración de `create_order_atomic` para garantizar al 100% que ninguna orden vacía pueda insertarse en el futuro.

---

## 17. Plan de Acción (V2)

### Primeras 24 Horas
*   Modificar el botón del checkout para que no quede deshabilitado silenciosamente, guiando al usuario si faltan datos en la localidad o dirección.
*   Ajustar el temporizador de consulta de envío de DAC de 450ms a 250ms.

### Siguientes 7 Días
*   Agregar validaciones de integridad y de longitud de items en el código SQL de la función `create_order_atomic`.
*   Añadir la inicialización de los tags de telemetría de e-commerce de Google Analytics 4 (`gtag`) en el flujo de checkout.

### Siguientes 30 Días
*   Establecer un mecanismo de persistencia para el retorno de pasarelas de pago, mitigando fallas de rebote de sesión en navegadores internos de redes sociales (Instagram/Facebook WebView).

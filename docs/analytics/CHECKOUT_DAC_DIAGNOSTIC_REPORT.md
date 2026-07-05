# INFORME TÉCNICO DE DIAGNÓSTICO — CHEQUEO DAC Y TELEMETRÍA (COLLECTIBLES.UY)

Este informe detalla el análisis previo de la arquitectura actual del flujo de checkout, cálculo de envíos por DAC y telemetría de eventos.

---

## 1. Flujo Real Actual del Checkout

1.  **Cart (/cart):** El usuario visualiza los artículos y hace clic en "Finalizar Compra".
2.  **Checkout Step 1 (Facturación):** El usuario ingresa Nombre, Apellido, Email y opcionalmente Teléfono.
3.  **Checkout Step 2 (Envío):**
    *   El usuario selecciona el método de envío (`pickup` o `delivery`).
    *   Si selecciona `delivery` y el departamento no es Montevideo, el flujo entra en modo DAC (`dac_home` o `dac_agency`).
    *   Se disparan consultas para cargar agencias y calcular costos con un debounce de 450ms.
4.  **Checkout Step 3 (Pago):**
    *   El usuario selecciona la pasarela de pago (Mercado Pago, Handy, PayPal).
    *   Se verifica `isPaymentBlocked()`. Si el costo de envío de DAC es `null` o hay un error, el botón de pago queda inhabilitado.
5.  **Creación de Orden & Redirección:** Se llama a la Edge Function `create-order`, que invoca al RPC `create_order_atomic` en Supabase y luego redirige al usuario a la pasarela elegida.
6.  **Retorno & Confirmación:** El usuario regresa a `/checkout/success` para ver la confirmación.

---

## 2. Componentes y Hooks Involucrados

*   **Archivo Principal:** [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx).
*   **Estados de Envío (DAC):**
    *   `dacDeliveryMode` (DAC a domicilio vs retiro en agencia).
    *   `dacAgencies` (Agencias cargadas de la base de datos).
    *   `selectedAgency` (Agencia elegida por el usuario).
    *   `dacShippingCost` (Costo devuelto por la Edge Function).
    *   `dacShippingLoading` (Estado de carga de la llamada a DAC).
    *   `dacShippingError` (Mensaje de error de cálculo de DAC).
    *   `vendorShippingCosts` (Costos agrupados por vendedor).
*   **useEffect de Cálculo de Costo (líneas 644-822):**
    *   Se activa al cambiar campos de dirección, métodos o carrito.
    *   Implementa un debounce de 450ms mediante `setTimeout`.
    *   Invoca a la Edge Function `dac-get-cost` vía `supabase.functions.invoke`.
    *   Si la localidad o datos no están completos, sale de forma temprana y limpia los costos estableciendo `dacShippingCost = null`.

---

## 3. Condiciones de Bloqueo UX Confirmadas

*   **Causa Raíz:** La función `canAdvanceStep(2)` (que valida la transición de Step 2 a Step 3) solo verifica la existencia física de `form.street`, `form.department` y `form.city`. **No valida si el cálculo de DAC fue exitoso o falló**.
*   Por lo tanto, el usuario puede avanzar al Step 3 de pago incluso si:
    1.  El cálculo de DAC sigue cargando (`dacShippingLoading === true`).
    2.  El cálculo falló (`dacShippingError !== null`).
    3.  Los datos no dispararon el cálculo, dejando `dacShippingCost === null` de forma indefinida.
*   Una vez en el Step 3, `isPaymentBlocked()` devuelve `true` debido a que `dacShippingCost === null` o `dacShippingError !== null`. El botón de pago queda inhabilitado mostrando `Esperando cálculo de envío de DAC...` de forma pasiva, sin guiar al usuario hacia los campos erróneos del Step 2.

---

## 4. Telemetría y Eventos Existentes

*   **Meta Pixel & CAPI:** Centralizado en `frontend/src/lib/meta/metaPixel.ts` y disparado mediante `analytics.track` en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L1378) y [CheckoutSuccess.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/CheckoutSuccess.tsx#L67).
*   **Google Analytics 4:** Cargado de forma genérica en `index.html`. No cuenta con disparadores de eventos e-commerce personalizados en el código.
*   **Clarity:** Cargado de forma genérica en `index.html`. No cuenta con disparadores de eventos personalizados en el código.
*   **Duplicaciones:** El evento `InitiateCheckout` utiliza `initiateCheckoutTrackedRef` para evitar doble disparo en rerenders. El evento `Purchase` en `CheckoutSuccess.tsx` carece de deduplicación explícita robusta (ej: almacenamiento persistente del ID de transacción), lo que puede generar duplicados si el usuario refresca la página de éxito.

# Matriz de Validación Final de Analíticas (GA4 & Clarity)

Este documento detalla la matriz de pruebas técnicas y de comportamiento para verificar el correcto despacho de eventos de e-commerce y técnicos, garantizando la deduplicación, prevención de fuga de datos sensibles (PII) y el manejo fail-safe de bloqueadores.

## Matriz de Eventos

| Acción / Flujo | Evento GA4 | Evento Clarity | Cantidad Esperada | Comportamiento Observado / Reglas de Control | Resultado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Ver catálogo** | `view_item_list` | - | 1 por carga/filtro | Fired en [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx). Evita duplicados por render. | Exitoso |
| **2. Buscar producto** | `search`, `view_search_results` | - | 1 por búsqueda | Fired en [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx). Solo cuando hay keyword de búsqueda. | Exitoso |
| **3. Abrir producto** | `select_item`, `view_item` | `product_viewed` | 1 por click/visita | `select_item` en card click. `view_item` y `product_viewed` en [ProductDetail.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx) con ref de control de StrictMode. | Exitoso |
| **4. Agregar al carrito** | `add_to_cart` | `product_added_to_cart` | 1 por acción | Fired en [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx) y [ProductDetail.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx). | Exitoso |
| **5. Eliminar producto** | `remove_from_cart` | - | 1 por acción | Fired en [CartDrawer.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/CartDrawer.tsx) y en la barra lateral del [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx). | Exitoso |
| **6. Ver carrito** | `view_cart` | - | 1 por apertura | Fired en [CartDrawer.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/CartDrawer.tsx). Controlado con ref para evitar duplicados en rerenders. | Exitoso |
| **7. Iniciar checkout** | `begin_checkout` | `checkout_started` | 1 por carga | Fired al cargar el Paso 1 en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx). Controlled con ref de montaje. | Exitoso |
| **8. Seleccionar envío** | `add_shipping_info` | `shipping_selected` | 1 al confirmar Paso 2 | Fired en `goNext()` al avanzar exitosamente del Paso 2 al Paso 3 en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx). | Exitoso |
| **9. Error validación DAC** | `shipping_calculation_error` | `shipping_calculation_error` | 1 por error | Fired en `fetchDacCost` al recibir error del backend en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx). | Exitoso |
| **10. Cotizar DAC OK** | `shipping_calculation_success` | - | 1 por éxito | Fired en `fetchDacCost` al obtener costo del backend. | Exitoso |
| **11. Seleccionar pago** | - | `payment_method_selected` | 1 por cambio | Fired al cambiar la opción de pasarela en el Paso 3. | Exitoso |
| **12. Finalizar compra** | `add_payment_info` | - | 1 por intención real | Fired al hacer clic en "Finalizar compra" en Paso 3 de [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx) tras validar datos, inmediatamente antes de crear la orden. | Exitoso |
| **13. Error crear orden** | `checkout_order_creation_error` | - | 1 por error | Fired si falla la Edge Function de creación de orden. Parámetros 100% técnicos, sin PII (sin nombres, direcciones, etc.). | Exitoso |
| **14. Iniciar redirección**| `payment_redirect_started` | `payment_redirect_started` | 1 por redirección | Fired al iniciar sesión de pago en [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx). | Exitoso |
| **15. Error redirección** | `payment_redirect_error` | - | 1 por error | Fired si falla la generación de la URL de pago. | Exitoso |
| **16. Retorno de gateway** | `payment_returned` | - | 1 por retorno | Fired al volver de la pasarela a la landing de éxito. | Exitoso |
| **17. Confirmar compra** | `purchase` | `purchase_completed` | 1 por orden única | Fired en [CheckoutSuccess.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/CheckoutSuccess.tsx) cuando el estado de la orden es `'paid'`, `'entregado'` o `'en_preparacion'`. | Exitoso |
| **18. Refrescar éxito** | - | - | 0 adicional | Bloqueado mediante deduplicación híbrida en `sessionStorage` y `localStorage` con lectura y escritura desacopladas. | Exitoso |
| **19. Volver atrás / refresh**| - | - | 0 adicional | El control por `hasPurchaseBeenTracked(orderId)` impide re-enviar la compra. | Exitoso |
| **20. Favoritos / Wishlist**| `add_to_wishlist` | - | 1 por agregado | Fired en [WishlistContext.tsx](file:///c:/Projects/Collectibles2026/frontend/src/contexts/WishlistContext.tsx) al agregar a favoritos. | Exitoso |

---

## Estrategia de Control y Seguridad

1. **Prevención de PII**: Ningún evento enviado a GA4 o Clarity contiene correos, nombres, teléfonos, direcciones o Cédula de Identidad de los usuarios. Solo se transmiten identificadores técnicos normalizados, identificadores de error, pasarelas y montos numéricos.
2. **Privacidad del Bundle**: Se removió el array de correos internos en el frontend. La clasificación de tráfico interno se realiza por variables del sistema, hostname y roles decodificados del token de Supabase.
3. **Mecanismo Fail-Safe**: Todas las llamadas de trackeo están contenidas dentro de bloques `try/catch` globales en `analyticsTracker.ts`, evitando cualquier cuelgue de la UI o interrupción en el Checkout del cliente.

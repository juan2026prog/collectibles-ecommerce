# AUDITORÍA Y CORRECCIÓN: SELECTOR GLOBAL, HERENCIA DE COCARDA Y RESTRICCIÓN DE MEDIOS DE PAGO EN GRUPOS/COLECCIONES (`/admin/groups`)

**Módulo:** `/admin/groups`  
**Fecha:** 12 de Agosto de 2026  
**Autor:** Antigravity AI  

---

## 1. COMPONENTE REAL Y ARQUITECTURA IDENTIFICADA

- **Ruta de aplicación:** `/admin/groups` (definida en `frontend/src/App.tsx#L260`)
- **Archivo del componente:** [AdminGroups.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminGroups.tsx)
- **Resolución Global de Datos:** [useData.ts](file:///c:/Projects/Collectibles2026/frontend/src/hooks/useData.ts)
- **Tarjetas de Producto:** [ProductGridCard.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/ProductGridCard.tsx)
- **Ficha de Producto:** [ProductDetail.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx)
- **Checkout & Validación:** [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx)
- **Edge Functions Backend:** [checkout-handler/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/checkout-handler/index.ts) y [create-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-payment/index.ts)

---

## 2. ESQUEMA DE BASE DE DATOS (`product_groups`)

Se agregaron las siguientes columnas a la tabla `product_groups` en Supabase:
```sql
ALTER TABLE product_groups 
  ADD COLUMN IF NOT EXISTS allowed_payment_providers text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_method_restriction text DEFAULT 'all';
```
- `allowed_payment_providers`: Array de pasarelas autorizadas (`mercadopago`, `dlocalgo`, `paypal`, `handy`). `NULL` indica que todas las pasarelas están permitidas.
- `payment_method_restriction`: Cadena con el tipo de restricción (`all`, `cards_only`, `transfer_only`). Por defecto `all`.

---

## 3. PARTE A — HERENCIA DE COCARDA DEL GRUPO

### Comportamiento e Integración Dinámica:
1. **Sin Copia Físicamente Masiva**: Los productos **NO** modifican su campo `badge`. La pertenencia a `product_group_items` es la fuente única de la herencia.
2. **Cero Consultas N+1**: La consulta central `useProducts` incluye la relación `product_group_items(group:product_groups(...))`. Los productos traen sus cocardas asignadas y heredadas en la misma consulta PostgREST de Supabase.
3. **Cambio Instantáneo**: Si en `/admin/groups` se cambia la cocarda de un grupo (ej. de `PROMO` a `SALE`), todos los productos integrantes reflejan automáticamente la nueva cocarda sin requerir actualizaciones en la BD.
4. **Coexistencia y Deduplicación**: Se implementó `getAllProductGroupBadges(product)` que permite coexistir la cocarda propia del producto (`product.badge`) con las cocardas de grupos activos, deduplicando por URL/ID de cocarda.

---

## 4. PARTE B — RESTRICCIÓN DE MEDIOS DE PAGO POR GRUPO

### Configuración en Admin (`/admin/groups`):
- **Pasarelas Permitidas**: Mercado Pago, dLocal Go, PayPal, Handy.
- **Restricción de Métodos**: Todos los métodos, Solo tarjetas (crédito/débito), Solo transferencia / efectivo.
- **Badge Resumen**: Cada tarjeta de colección en la lista de `/admin/groups` exhibe una pastilla informativa (`💳 TODOS LOS PAGOS`, `💳 MERCADO PAGO`, `💳 SOLO TARJETAS`, etc.).

### Lógica de Intersección en Carrito y Checkout (`Checkout.tsx`):
1. **Regla de Intersección**: Cada producto del carrito evalúa las pasarelas permitidas por sus grupos. El carrito calcula la **intersección matemática** entre las pasarelas de todos sus ítems.
2. **Filtrado de Opciones**: El Checkout habilita/deshabilita únicamente los `PaymentMethodCard` compatibles con la intersección global.
3. **Manejo de Carritos Incompatibles**: Si la intersección es vacía (ej. Producto A "Solo Mercado Pago" + Producto B "Solo Handy"), el Checkout se bloquea desplegando una alerta descriptiva con el desglose de productos en conflicto y la opción de modificar el carrito.
4. **Seguridad en Backend (Edge Functions)**: `checkout-handler` y `create-payment` re-verifican la restricción consultando las tablas de la BD server-side. Peticiones no autorizadas son rechazadas con HTTP 400.

---

## 5. RESUMEN DE MATRIZ DE QA

| ID Test | Descripción | Resultado |
| :--- | :--- | :---: |
| **TEST A** | Grupo con cocarda "PROMO" -> 10 productos la heredan | **OK** |
| **TEST B** | Cambiar cocarda "PROMO" -> "SALE" en grupo -> Actualización instantánea | **OK** |
| **TEST C** | Quitar producto del grupo -> Deja de heredar la cocarda inmediatamente | **OK** |
| **TEST D** | Producto con cocarda propia "NEW" + grupo "SALE" -> Muestra ambas sin superposición | **OK** |
| **TEST E** | Producto en 2 grupos con cocarda "SALE" -> Se deduplica y muestra 1 vez | **OK** |
| **TEST F** | Grupo "Todos los pagos" -> Checkout opera normalmente | **OK** |
| **TEST G** | Grupo restringido a "Mercado Pago" -> Checkout filtra solo Mercado Pago | **OK** |
| **TEST H** | Carrito mixto compatible (normal + "Solo Mercado Pago") -> Muestra Mercado Pago | **OK** |
| **TEST I** | Carrito con productos incompatibles -> Muestra alerta de conflicto y bloquea pago | **OK** |
| **TEST J** | Validación en Edge Function ante solicitud adulterada -> Retorna 400 Bad Request | **OK** |
| **TEST K** | Despliegue en Vercel -> Verificado en `collectibles.uy/admin/groups` y Storefront | **OK** |

---

## CRITERIO DE ÉXITO ALCANZADO

- [x] Grupo puede tener cocarda
- [x] Productos heredan automáticamente cocarda
- [x] No se copia cocarda físicamente a cada producto
- [x] Cambiar cocarda actualiza visualmente todos los integrantes
- [x] Quitar producto elimina la herencia correspondiente
- [x] Cocarda propia + heredada pueden coexistir
- [x] Cocardas duplicadas se deduplican
- [x] No existen queries N+1
- [x] Grupo permite configurar medios de pago
- [x] Existe opción Todos
- [x] Existe Mercado Pago
- [x] Existe Solo tarjetas
- [x] Se utilizan únicamente pasarelas reales
- [x] Restricción funciona en checkout
- [x] Restricción también se valida en backend
- [x] Carritos mixtos calculan intersección
- [x] Conflictos de pago se manejan correctamente
- [x] Grupos antiguos continúan funcionando
- [x] Productos Vendor y Collectibles funcionan
- [x] Despliegue verificado en producción

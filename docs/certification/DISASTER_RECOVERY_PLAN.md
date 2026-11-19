# Collectibles 2026 — Plan de Contingencia y Disaster Recovery (DRP)

**Fecha:** 2026-11-19  
**Rama:** `fix/p2-p3-p4-production-readiness`  
**Alcance:** Collectibles Uruguay (`https://collectibles.uy`), Supabase Producción (`cobtsgkwcftvexaarwmo`), Vercel (`collectibles-ecommerce`), Cloudflare Worker/D1 (`collectibles-catalog-api`).

---

## 1. Objetivos RPO y RTO (Estado Actual vs Objetivo Propuesto)

| Componente | Mecanismo Actual | RPO Real Actual | RTO Real Actual | RPO Objetivo | RTO Objetivo |
|---|---|---|---|---|---|
| **PostgreSQL Producción** (`cobtsgkwcftvexaarwmo`) | Backups diarios automáticos de Supabase Pro (PITR requiere add-on verificado en dashboard) | Hasta 24h (sin PITR confirmado) / < 2 min (con PITR activo) | 30–90 min (restore manual + re-verificación) | <= 5 min (PITR habilitado) | <= 30 min |
| **Catálogo Público (Lectura)** | Cloudflare Worker/D1 + Vercel `/api/public-catalog` + `/tmp` snapshot verificado SHA-256 (6h) + `localStorage` (1h) | 0 min (lectura degradada hasta 6h) | < 5 seg (failover automático) | 0 min | < 5 seg |
| **Frontend / API Vercel** | GitHub `main` + deployments inmutables en Vercel | 0 min (código en Git) | 2–5 min (Instant Rollback en Vercel) | 0 min | <= 2 min |
| **Supabase Edge Functions** | Código versionado en `supabase/functions/` | 0 min (código en Git) | 5–10 min (`supabase functions deploy`) | 0 min | <= 5 min |
| **Supabase Storage (Imágenes)** | Buckets gestionados en Supabase (sin replicación secundaria automatizada) | Dependiente de backup de Storage / bucket | 1–4 horas | <= 24h (sync periódico a R2/S3 frío) | <= 60 min |
| **Secretos y Credenciales** | Vercel Env Vars + Supabase Edge Secrets (gestor externo pendiente) | N/A (manual) | 15–45 min | 0 min (gestor de secretos cifrado + inventario) | <= 10 min |

---

## 2. Matriz de Contingencia por Escenario de Incidente

### Escenario A / B: Base de Datos Lenta o Caída (Supabase PostgreSQL)
- **Detección automática:** Timeouts acotados (`withTimeout` / `withEdgeTimeout`) y `CircuitBreaker('supabase_db_write')` abren tras 3 fallos consecutivos.
- **Comportamiento del sitio:**
  - **Catálogo público:** Sigue navegable mediante Cloudflare D1 -> `/api/public-catalog` -> `/tmp` snapshot verificado (hasta 6h) -> `localStorage` (hasta 1h).
  - **Checkout:** Bloqueo fail-closed (`DB_WRITE_UNAVAILABLE` / `STOCK_UNVERIFIED`). **Nunca permite compras sin verificación de stock ni sobreventa.**
- **Recuperación:** Al volver PostgreSQL, el circuit breaker pasa a `HALF_OPEN` tras `cooldownMs` (30s) y restaura `CLOSED` automáticamente.

### Escenario C: Caída de Zinc / Amazon API
- **Detección automática:** `CircuitBreaker('zinc_amazon_api')` abre tras 3 fallos.
- **Comportamiento del sitio:**
  - **Collectibles Uruguay local:** **100% operativo** (catálogo local, carrito local, MercadoPago, Handy, DAC, SoyDelivery).
  - **Productos internacionales:** Pausados con modo `INTERNATIONAL_PAUSED` (`INTERNATIONAL_SOURCING_UNAVAILABLE`).

### Escenario D: Caída de Pasarela de Pagos (MercadoPago / Handy / PayPal)
- **Detección automática:** Circuit breaker independiente por pasarela (`payment_mercadopago`, `payment_handy`, `payment_paypal`).
- **Comportamiento del sitio:**
  - Si falla una pasarela (ej. PayPal), las demás continúan 100% operativas (`PARTIAL_PAYMENT_GATEWAYS`).
  - Si fallan todas, el checkout falla cerrado (`ALL_PAYMENT_GATEWAYS_UNAVAILABLE`) sin crear órdenes huérfanas.
  - Para PayPal, el webhook asíncrono (`supabase/functions/paypal-webhook`) recupera pagos aprobados aunque el cliente cierre el navegador.

### Escenario E: Caída de Email (Resend) / WhatsApp
- **Comportamiento del sitio:** **Nunca bloquea checkout.** Los eventos se persisten en `public.notification_outbox` dentro de la transacción de la orden y son reintentados por el worker `service_role`.

### Escenario F: Cotización FX Faltante o Desactualizada
- **Comportamiento del sitio:**
  - Compras cross-currency (ej. UYU -> USD PayPal) bloqueadas fail-closed (`FX_RATE_UNAVAILABLE_OR_STALE`).
  - Compras locales Uruguay en misma moneda (UYU -> UYU) continúan **100% operativas**.

---

## 3. Runbook Paso a Paso de Recuperación Ante Desastres

### 3.1 Rollback de Frontend / API (Vercel)
1. Ingresar a Vercel Dashboard -> Proyecto `collectibles-ecommerce` -> Deployments.
2. Seleccionar el último deployment certificado anterior y ejecutar **Instant Rollback**.
3. Verificar HTTP 200 en `https://collectibles.uy` y `/api/public-catalog?limit=1`.

### 3.2 Rollback de Cloudflare D1 Kill-Switch (< 1 segundo)
1. Activar kill-switch en el Worker (`CATALOG_RUNTIME_ENABLED=false` o `POST /api/v1/internal/runtime-mode`).
2. `PublicCatalogProvider` detecta `X-Catalog-Kill-Switch: active` o `503` y redirige inmediatamente a `/api/public-catalog` sin rebuild de Vite.

### 3.3 Restore de Base de Datos (Supabase)
1. **NO sobrescribir Producción directamente sin clonar/verificar primero** si el incidente es corrupción lógica (ej. `DELETE` accidental).
2. Restaurar mediante Supabase Dashboard -> Database -> Backups (Daily o PITR) a un proyecto/branch de recuperación o punto en el tiempo previo al incidente.
3. Si se requiere levantar un PostgreSQL vacío desde migraciones del repositorio, ejecutar primero `supabase/scripts/bootstrap_empty_db_compat.sql` (ver `docs/certification/MIGRATION_REPLAY_AUDIT.md`).
4. Validar integridad post-restore:
   - Conteo de `products`, `product_variants`, `orders`, `payment_transactions`, `notification_outbox`.
   - RLS activo en todas las tablas públicas (`pg_tables.rowsecurity = true`).
   - Permisos de `anon`/`authenticated` revocados en RPCs privilegiadas y `paypal_webhook_events`.
   - Estado de los 17 jobs activos de `pg_cron`.

### 3.4 Restore de Edge Functions y Secretos
1. Re-desplegar Edge Functions críticas desde el tag/commit certificado:
   - `create-order`, `create-payment`, `confirm-payment`, `paypal-webhook`, `process-notifications`.
2. Verificar secretos requeridos en Supabase Edge Secrets (nunca en tablas públicas ni `.env` versionados):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`, `MP_ACCESS_TOKEN`, `HANDY_*`, `RESEND_API_KEY`, `ZINC_API_KEY`.

---

## 4. Checklist de Comunicación y Post-Mortem
1. Registrar hora exacta de detección, impacto (catálogo vs checkout vs pagos), y hora de mitigación.
2. Reconciliar `paypal_webhook_events` en estado `dead_letter` o `failed` y `orders` en `manual_verification_required`.
3. Documentar causa raíz y actualizar pruebas de regresión antes de cerrar el incidente.

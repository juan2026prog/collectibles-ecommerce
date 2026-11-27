# COLLECTIBLES 2026 — PLAN DE ROLLBACK SEGURO (SIN RETORNO AL DOMINIO NO CONFIABLE)

> [!CAUTION]
> **Invariante Inquebrantable de Seguridad:**
> Bajo **ninguna circunstancia** un rollback puede restaurar confianza, CORS, redirecciones, `Site URL`, `return_url`, webhooks ni destinatarios de correo hacia `collectibles.uy` ni `*.collectibles.uy`, ya que dicho dominio se encuentra bajo control de terceros.

---

## 1. Principio Rector del Rollback

Si tras el despliegue en producción se detectara una regresión operativa en cualquier capa (Frontend/Vercel, Supabase Edge Functions, Base de Datos o Cloudflare Worker), la recuperación **siempre** se ejecuta manteniendo bloqueado `collectibles.uy` y utilizando, en caso de contingencia de dominio o DNS, el dominio de respaldo verificado de primera parte:
- **Dominio de contingencia oficial:** `https://collectibles-ecommerce.vercel.app`
- **Buzón administrativo de contingencia:** `collectiblesuy@gmail.com`

---

## 2. Procedimientos de Rollback por Capa

### 2.1 Capa 1 — Frontend y Vercel Serverless (`api/*`, SPA)
- **Qué NO hacer:** **NO hacer `git revert` hacia commits previos a `a24eaec`/`b06daea`** sin conservar los guardias de seguridad (`domainMarketResolver.ts` y `api/catalog-image.js`), porque los commits anteriores en `main` autorizaban `collectibles.uy`.
- **Acción segura ante incidente de UI/SEO:**
  1. Aplicar hotfix puntual sobre `main` manteniendo `collectibles.com.uy` y `collectibles-ecommerce.vercel.app` como únicos orígenes confiables.
  2. Si existiera una degradación temporal de DNS/SSL exclusiva en `collectibles.com.uy`, operar temporalmente sobre `https://collectibles-ecommerce.vercel.app` (ya autorizado como `PREVIEW_AUTHORIZED` con `canCheckoutOnDomain: true` y presente en la allowlist de `_shared/cors.ts`).

### 2.2 Capa 2 — Supabase Edge Functions (`cobtsgkwcftvexaarwmo`)
- **Riesgo de rollback ciego:** Volver a una versión histórica de `create-payment`, `transactional-emails`, `notification-dispatcher` o `meta-capi` en Supabase reintroduciría `notificaciones@collectibles.uy` y `ACAO: https://collectibles.uy`.
- **Acción segura ante fallo puntual de una Edge Function:**
  1. Identificar únicamente la función afectada en **Supabase Dashboard → Edge Functions → Logs**.
  2. Corregir la lógica funcional manteniendo intactos los imports de `../_shared/cors.ts` y `../_shared/email-guard.ts`, y redesplegar solo esa función:
     ```powershell
     npx supabase functions deploy <nombre-funcion> --remote=cobtsgkwcftvexaarwmo --use-api
     ```
  3. En caso de emergencia con el proveedor Resend, **vaciar temporalmente `RESEND_FROM`**: `transactional-emails` y `notification-dispatcher` entrarán automáticamente en parada segura (`provider_unavailable`, `is_permanent_error = false`), preservando el registro en `notification_logs` para reintento posterior sin perder órdenes ni pagos.

### 2.3 Capa 3 — Base de Datos PostgreSQL (`cobtsgkwcftvexaarwmo`)
Cada cambio del Bloque A de [`supabase/manual_remediation/20261126_domain_migration_com_uy.sql`](file:///c:/Projects/Collectibles2026/supabase/manual_remediation/20261126_domain_migration_com_uy.sql) es atómico y posee rollback seguro sin apuntar jamás a `collectibles.uy`:
1. **`public.banners` (`316eae0d-...`, `aaae3686-...`, `cab5516b-...`):** Las rutas relativas (`/collection/minecraft`, `/collection/99-noches-en-el-bosque`, `/collection/20--dto-dia-del-nio`) funcionan tanto en `collectibles.com.uy` como en `collectibles-ecommerce.vercel.app`. Si un banner causara error comercial, desactivarlo temporalmente (`UPDATE public.banners SET is_active = false WHERE id = '<uuid>';`).
2. **`public.payment_providers` (`handy`, `f247d0be-1f39-4836-9e35-fca418d8a4a1`):** Si `collectibles.com.uy` no estuviera accesible, apuntar `config.site_url` al dominio de respaldo propio:
   ```sql
   UPDATE public.payment_providers
   SET config = jsonb_set(config, '{site_url}', '"https://collectibles-ecommerce.vercel.app"'::jsonb, true),
       updated_at = now()
   WHERE id = 'f247d0be-1f39-4836-9e35-fca418d8a4a1'
     AND provider_key = 'handy';
   ```
3. **`public.product_images` (`9b2fc489-...`, `910b95ad-...`):** Apuntan al asset oficial en Supabase Storage (`public-assets/1775828705619-isologocolle.jpg`), que es 100% independiente del dominio público.

### 2.4 Capa 4 — Cloudflare Worker (`collectibles-catalog-api`)
- Actualmente `CATALOG_RUNTIME_ENABLED = "false"` y `CF_PUBLIC_CATALOG_ENABLED` no está activo en runtime público.
- Si tras un futuro despliegue del Worker hubiera cualquier anomalía, mantener `CATALOG_RUNTIME_ENABLED = "false"` (kill-switch activo por defecto, devolviendo `X-Catalog-Kill-Switch: active` y haciendo fallback inmediato y transparente a Supabase en el frontend y `api/seo-prerender.js`).

# COLLECTIBLES 2026 — PLAN DE RELEASE Y CUTOVER A PRODUCCIÓN

> [!IMPORTANT]
> **Estado actual:** Todos los cambios de código, configuraciones locales, suite de seguridad y validación en Staging (`csnudufkpfzveoonjumy`) están **COMPLETOS y LISTOS PARA PRODUCCIÓN** en la rama `fix/domain-migration-com-uy` (Pull Request **#50**).
> Conforme a las reglas de autorización de Fase 2, **NO se ha fusionado a `main` ni modificado Producción (`cobtsgkwcftvexaarwmo`)** a la espera de la aprobación expresa del propietario.

---

## 1. Pre-Condiciones Superadas (Quality & Security Gates)

- [x] Contención de correos sensibles (`_shared/email-guard.ts`): `0` envíos posibles a `@collectibles.uy`.
- [x] Endurecimiento CORS (`_shared/cors.ts` + 69 Edge Functions + Cloudflare Worker): `collectibles.uy` y `*.vercel.app` ajenos rechazados con `403`.
- [x] Clasificador de dominio (`domainMarketResolver.ts`): `collectibles.com.uy` y `www.collectibles.com.uy` = `PRODUCTION_OFFICIAL`; `collectibles.uy` = `UNTRUSTED_UNKNOWN` (`canCheckoutOnDomain: false`).
- [x] Protección SSRF y DNS-pinning en `api/catalog-image.js`, `frontend/api/catalog-image.js` y `media-proxy`.
- [x] Paridad exacta (`0` diferencias) de `verify_jwt` en `supabase/config.toml` frente a las 72 funciones de Producción.
- [x] Typecheck (`0` errores), Build de Producción (`0` errores) y Suites Vitest de Seguridad/SEO/Dominio (`162/162` PASS).
- [x] Certificación HTTP real en Supabase Staging (`csnudufkpfzveoonjumy` — 12 funciones verificadas en vivo).
- [x] Escaneo de seguridad: `0` secretos, `0` `.env`, `0` PII expuesta en commits o reportes.

---

## 2. Secuencia Exacta de Ejecución del Release (Orden Estricto sin Downtime)

Una vez otorgada la aprobación del propietario, ejecutar exactamente en este orden:

### Paso 1 — Secretos y Auth en Supabase Producción (`cobtsgkwcftvexaarwmo`) [5 min]
1. En **Supabase Dashboard → Edge Functions → Secrets**, confirmar/definir:
   - `PUBLIC_SITE_URL=https://collectibles.com.uy`
   - `FRONTEND_URL=https://collectibles.com.uy`
   - `ADMIN_EMAIL=collectiblesuy@gmail.com`
   - `RESEND_REPLY_TO=info@collectibles.com.uy`
   - `MERCADOLIBRE_REDIRECT_URI=https://collectibles.com.uy/callback`
   *(Mantener `RESEND_FROM` en un remitente ya verificado en Resend; cambiar a `@collectibles.com.uy` únicamente cuando Resend marque `Verified`).*
2. En **Supabase Dashboard → Authentication → URL Configuration**, fijar `Site URL = https://collectibles.com.uy` y actualizar la lista cerrada de **Redirect URLs** según `DOMAIN_MIGRATION_MANUAL_ACTIONS.md` (Sección 1.1).
3. En **Google Cloud Console**, agregar `https://collectibles.com.uy` y `https://www.collectibles.com.uy` en *Authorized JavaScript origins* y conservar `https://cobtsgkwcftvexaarwmo.supabase.co/auth/v1/callback`.

### Paso 2 — Despliegue de las 69 Edge Functions Actualizadas en Producción [8 min]
Ejecutar los 4 lotes exactos documentados en [`DOMAIN_MIGRATION_EDGE_FUNCTIONS_MANIFEST.md`](file:///c:/Projects/Collectibles2026/DOMAIN_MIGRATION_EDGE_FUNCTIONS_MANIFEST.md) (Sección 3) contra `--remote=cobtsgkwcftvexaarwmo --use-api`:
- **Lote 1:** Contención crítica (`meta-capi`, `media-proxy`, `transactional-emails`, `notification-dispatcher`, crons).
- **Lote 2:** Checkout, órdenes, pagos y reembolsos (`create-order`, `create-payment`, `confirm-payment`, `create-handy-payment`, `mercadopago-checkout`, `dlocalgo-webhook`, `refund-order`, etc.).
- **Lote 3:** Auth Admin, Mercado Libre, `sitemap`, IA y `process-catalog-outbox`.
- **Lote 4:** Conectores logísticos (DAC, Distrilogic, SoyDelivery, UES, MBE, Zinc).

### Paso 3 — Ejecución del SQL Quirúrgico en Producción (`cobtsgkwcftvexaarwmo`) [3 min]
Ejecutar el **Bloque A** de [`supabase/manual_remediation/20261126_domain_migration_com_uy.sql`](file:///c:/Projects/Collectibles2026/supabase/manual_remediation/20261126_domain_migration_com_uy.sql) verificando cada `SELECT` previo y posterior:
1. **A.0:** Actualizar los 3 banners en `public.banners` (`316eae0d-...`, `aaae3686-...`, `cab5516b-...`) a rutas internas `/collection/...`.
2. **A.1:** Actualizar `config.site_url` de Handy (`f247d0be-...`) a `https://collectibles.com.uy`.
3. **A.2:** Actualizar las 2 imágenes en `public.product_images` (`9b2fc489-...`, `910b95ad-...`) al asset público oficial en Supabase Storage.
4. **A.3:** Confirmar `seo_site_url = 'https://collectibles.com.uy'` en `public.site_settings` (preservando `social_instagram_url = 'collectibles.uy'`).
*(Ejecutar Bloques B.1 y/o B.2 solo si el propietario lo indica expresamente).*

### Paso 4 — Merge del Pull Request #50 a `main` y Deploy Automático en Vercel [4 min]
1. Verificar variables de entorno en **Vercel Dashboard → Settings → Environment Variables** (`PUBLIC_SITE_URL=https://collectibles.com.uy`, `VITE_SITE_URL=https://collectibles.com.uy`).
2. Marcar **PR #50** (`fix/domain-migration-com-uy` → `main`) como *Ready for Review* y ejecutar **Squash & Merge** o **Merge Commit**.
3. Esperar a que el deployment de Producción en Vercel finalice en estado `READY`.
4. **Desvincular `collectibles.uy` y `www.collectibles.uy`** en **Vercel → Settings → Domains**.

### Paso 5 — Cloudflare Worker (`collectibles-catalog-api`) [Opcional / Preparado]
- Si se tiene sesión Wrangler activa, desplegar la configuración actualizada (`CATALOG_RUNTIME_ENABLED = "false"` se mantiene inactivo por seguridad):
  ```powershell
  cd cloudflare/collectibles-catalog-api
  npx wrangler deploy
  ```

---

## 3. Checklist de Smoke Testing Post-Cutover en Producción (`collectibles.com.uy`)

Ejecutar inmediatamente después del Paso 4 (sin generar compras reales):
1. **Dominio y Redirecciones:**
   - `curl -I https://collectibles.com.uy` → `HTTP/2 200`
   - `curl -I https://www.collectibles.com.uy` → `HTTP/2 308` con `Location: https://collectibles.com.uy/`
2. **CORS Positivo y Negativo en Producción:**
   - `OPTIONS https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/create-payment` con `Origin: https://collectibles.com.uy` → `200` y `ACAO: https://collectibles.com.uy`.
   - Mismo `OPTIONS` con `Origin: https://collectibles.uy` → **`403 Forbidden`** sin `ACAO`.
3. **SEO, Sitemap y Feeds Comerciales:**
   - `GET https://collectibles.com.uy/robots.txt` → contiene `Sitemap: https://collectibles.com.uy/sitemap.xml` y `0` menciones a `collectibles.uy`.
   - `GET https://collectibles.com.uy/sitemap.xml` → `<loc>https://collectibles.com.uy/...</loc>`.
   - `GET https://collectibles.com.uy/shop` con `User-Agent: Googlebot/2.1` → `<link rel="canonical" href="https://collectibles.com.uy/shop" />`.
   - `GET https://collectibles.com.uy/merchant-feed.xml` y `/meta-catalog.csv` → enlaces de producto e imágenes bajo `https://collectibles.com.uy/...` o `cobtsgkwcftvexaarwmo.supabase.co`.
4. **Proxy de Imágenes y Seguridad SSRF:**
   - `GET https://collectibles.com.uy/catalog-images/public-assets/1775828705619-isologocolle.jpg` → `200 image/jpeg`.
   - `GET https://collectibles.com.uy/api/catalog-image?path=external/collectibles.uy/logo.png` → **`403 Forbidden`**.
5. **Autenticación:**
   - Verificar flujo de inicio de Google OAuth (`/auth/v1/authorize?provider=google&redirect_to=https://collectibles.com.uy/`) → `auth.flow_state.referrer` resuelve a `https://collectibles.com.uy/` (ya no `http://localhost:3000`).

---

## 4. Referencia al Plan de Rollback Seguro

En caso de cualquier incidente durante o después del cutover, seguir estrictamente [`DOMAIN_MIGRATION_ROLLBACK_PLAN.md`](file:///c:/Projects/Collectibles2026/DOMAIN_MIGRATION_ROLLBACK_PLAN.md) — **nunca restaurando tráfico, confianza, CORS ni correos hacia `collectibles.uy`**.

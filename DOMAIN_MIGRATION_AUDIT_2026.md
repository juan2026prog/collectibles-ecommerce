# COLLECTIBLES — AUDITORÍA INTEGRAL DE MIGRACIÓN DE DOMINIO Y SEGURIDAD (`DOMAIN_MIGRATION_AUDIT_2026.md`)

**Fecha de auditoría:** 26 de noviembre de 2026  
**Fase:** Fase 1 — Auditoría y Diagnóstico Exclusivo de Lectura (0 modificaciones en producción, 0 migraciones ejecutadas, 0 deploys, 0 merges)  
**Dominio anterior (NO CONFIABLE / TERCERO):** `https://collectibles.uy` / `https://www.collectibles.uy`  
**Nuevo dominio oficial:** `https://collectibles.com.uy` / `https://www.collectibles.com.uy`  
**Dominio de respaldo:** `https://collectibles-ecommerce.vercel.app`  
**Repositorio:** `juan2026prog/collectibles-ecommerce`  
**Supabase Producción:** `cobtsgkwcftvexaarwmo` (`ACTIVE_HEALTHY`, PostgreSQL 17.6)  
**Supabase Staging:** `csnudufkpfzveoonjumy` (`ACTIVE_HEALTHY`, PostgreSQL 17.11)

> [!CAUTION]
> **DICTAMEN EJECUTIVO: PLATAFORMA NO LISTA PARA DECLARAR MIGRACIÓN COMPLETA EN PRODUCCIÓN.**  
> Aunque `https://collectibles.com.uy` responde `HTTP 200 OK` con SSL válido y redirección `308` desde `www.collectibles.com.uy`, **el checkout, el login con Google/Magic Link, los eventos de Meta CAPI, los feeds comerciales y las notificaciones están actualmente bloqueados o apuntando al dominio comprometido `collectibles.uy` o a `http://localhost:3000`**. Además, existen **riesgos críticos P0 de seguridad** porque el dominio anterior (hoy en nameservers de un tercero `dns1..4.hosted-domains.net`) continúa autorizado en listas blancas de CORS, proxies SSRF de imágenes, destinatarios de alertas financieras y banners activos de portada.

---

## 1. Dashboard de Diagnóstico (Resumen Cuantitativo)

| Indicador de Diagnóstico | Cantidad | Detalle / Observación |
|---|---:|---|
| **Referencias totales analizadas en plataforma** | **263** | 127 activas en código/tests/scripts/workflows + 9 registros activos en BD Prod + 6 handles sociales legítimos + 121 referencias históricas (migraciones/reportes `.md`) |
| **Hallazgos documentados en matriz maestra (`AUD-001` a `AUD-078`)** | **78** | Agrupados por archivo/servicio/configuración con evidencia verificada |
| **Referencias activas que requieren modificación** | **136** | 127 ubicaciones de código/config/tests/scripts + 9 registros/ajustes en BD y servicios |
| **Referencias legítimas / históricas que deben conservarse** | **127** | 6 URLs/handles reales de IG/FB (`collectibles.uy`), 4 exclusiones de `collectiblesuy@gmail.com` en analítica, migraciones SQL ejecutadas, v1.0 firmada de términos legales y reportes `.md` históricos |
| **Riesgos P0 CRÍTICOS** | **9** | CORS abierto a `collectibles.uy` y bloqueado en `.com.uy`, emails admin con datos de disputas/clientes enviados a `notificaciones@collectibles.uy`, banners activos en Home redirigiendo clientes a `collectibles.uy`, `payment_providers` Handy con `site_url: collectibles.uy`, proxy SSRF `catalog-image.js`/`media-proxy`, `domainMarketResolver` marcando `.com.uy` como `UNTRUSTED_UNKNOWN` (`canCheckoutOnDomain: false`), falta de DMARC/DKIM Resend y dominio `collectibles.uy` aún vinculado en Vercel |
| **Riesgos P1 ALTOS** | **18** | Supabase Auth `SITE_URL` en `http://localhost:3000` (Google OAuth / OTP rotos), `create-payment` origin sin whitelist + `guest@collectibles.uy`, 31 deep links de Email/WhatsApp/Push a `collectibles.uy` (riesgo phishing a admins/vendors/clientes), Cloudflare Worker D1 CORS y feeds en `.uy`, Mercado Libre OAuth `redirect_uri`, OneSignal Web Push origin, PR #50 en Draft sin merge |
| **Riesgos P2 MEDIOS** | **29** | `api/seo-prerender.js`, `SEO.tsx`, `seoConfig.ts`, `api/merchant-feed.js`, `api/meta-catalog.js`, `api/gsc-monitor.js`, canónicas en 10 páginas SPA, Pixel duplicado en `appearance_head_code`, exportadores CSV, GitHub Action horaria fallando contra `collectibles.uy`, tests Vitest con `.not.toContain('collectibles.com.uy')` |
| **Riesgos P3 BAJOS** | **12** | Copy comercial `"Collectibles.uy"`, placeholders UI, reglas de agente (`AGENTS.md`, `GEMINI.md`, skill deploy), migraciones históricas y reportes antiguos (10 adicionales `VERIFIED_OK` / `NOT_APPLICABLE`) |
| **Integraciones verificadas directamente (código + red/SQL)** | **14** | DNS nuevo/viejo, SSL/TLS, Vercel HTTP/redirects, Supabase DB Prod/Staging, Supabase Auth endpoints, Edge Functions (49 en Prod / 10 en Staging), CORS en vivo, Prerender SEO, Sitemaps, Robots.txt, Merchant Feed, Meta Catalog CSV, Cloudflare Worker D1 CORS, Catálogo Público API |
| **Integraciones pendientes de verificación manual en consola (`NOT_VERIFIED`)** | **10** | Vercel Dashboard (lista exacta de dominios/env vars), Supabase Dashboard Auth UI/SMTP, Google Cloud Console OAuth, Mercado Pago Panel, dLocal Go Panel, Mercado Libre DevCenter, Meta Business/Commerce Manager, GA4/GSC/Ads UI, Resend Dashboard, OneSignal Dashboard |
| **Pruebas no destructivas ejecutadas** | **28** | **19 EXITOSAS** (`HTTP 200/308/410`, SSL, catálogo, rutas SPA) · **9 FALLIDAS (`TEST_FAILED`)** (CORS en 5 Edge Functions, CORS en CF Worker, Google OAuth redirect a `localhost:3000`, Sitemap/Prerender/Feeds en vivo aún emitiendo `collectibles.uy`) |
| **Pruebas pendientes (requieren credenciales de prueba o fase post-fix)** | **8** | Login real con Google post-cambio Auth, recuperación de contraseña E2E, compra sandbox Mercado Pago/dLocal/Handy, recepción webhook simulado firmado, vinculación OAuth Mercado Libre, suscripción Web Push OneSignal |

---

## 2. Estado Real del Dominio Nuevo vs. Dominio Anterior

### 2.1 Verificación de Red, DNS, Certificados SSL y HTTP en Vivo

| Comprobación | Resultado Verificado | Evidencia Técnica | Estado |
|---|---|---|---|
| **DNS `collectibles.com.uy` (Nameservers)** | Delegado a Vercel DNS | `NS`: `ns1.vercel-dns.com`, `ns2.vercel-dns.com` | `VERIFIED_OK` |
| **DNS `collectibles.com.uy` (Registros A)** | Apunta a Vercel Anycast | `A`: `216.198.79.1`, `64.29.17.1` (TTL 1328s) | `VERIFIED_OK` |
| **DNS `www.collectibles.com.uy` (Registros A)** | Apunta a Vercel Anycast | `A`: `64.29.17.65`, `216.198.79.1` (wildcard/alias en Vercel DNS) | `VERIFIED_OK` |
| **SSL `https://collectibles.com.uy`** | Certificado válido y activo | `CN=collectibles.com.uy`, Emisor: `Let's Encrypt (YR2)`, válido `2026-11-26` a `2027-02-24` | `VERIFIED_OK` |
| **SSL `https://www.collectibles.com.uy`** | Certificado válido y activo | `CN=www.collectibles.com.uy`, Emisor: `Let's Encrypt (YR1)`, válido hasta `2027-02-24` | `VERIFIED_OK` |
| **HTTP `https://collectibles.com.uy`** | Responde `HTTP 200 OK` | `Server: Vercel`, `Strict-Transport-Security: max-age=63072000`, región `gru1` | `VERIFIED_OK` |
| **Redirección `https://www.collectibles.com.uy`** | Redirige al apex nuevo | `HTTP 308 Permanent Redirect` → `Location: https://collectibles.com.uy/` | `VERIFIED_OK` |
| **Dominio respaldo `collectibles-ecommerce.vercel.app`** | Responde `HTTP 200 OK` | HSTS activo; sirve el mismo deployment actual de `main` | `VERIFIED_OK` |
| **Correo DNS `collectibles.com.uy` (MX / SPF / DKIM / DMARC)** | Google Workspace parcial; **sin DMARC ni Resend DKIM** | `MX`: `1 smtp.google.com`; `TXT`: `v=spf1 include:_spf.google.com ~all` y `google-site-verification=Z4XaqBqp...`; `google._domainkey` presente; **`resend._domainkey` inexistente**; **`_dmarc` sin TXT** (resuelve IP comodín `216.198.79.65`) | `SECURITY_RISK` |
| **Estado DNS de `collectibles.uy` (Dominio anterior)** | **Controlado por tercero externo** | `NS`: `dns1.hosted-domains.net` .. `dns4.hosted-domains.net`. Actualmente sin registros `A`, `MX` ni `TXT` públicos (solo `SOA`), pero el tercero tiene control total de zona DNS para activar servidores web o de correo en cualquier instante | `SECURITY_RISK` |

---

## 3. Estado del Pull Request #50 (`fix/domain-migration-com-uy`)

Se inspeccionó vía API de GitHub el PR **#50** (`https://github.com/juan2026prog/collectibles-ecommerce/pull/50`):

- **Título:** `Migrar URLs públicas a collectibles.com.uy`
- **Rama origen → destino:** `fix/domain-migration-com-uy` (`475432f1ab0b7efb5543584a46d6be93d3c4bc10`) → `main`
- **Estado actual:** **`OPEN` y en modo `DRAFT` (`draft: true`, `merged: false`, `mergeable: true`, `mergeable_state: "clean"`)**.
- **Alcance real del PR #50 (solo 3 archivos modificados):**
  1. [api/sitemap.js](file:///c:/Projects/Collectibles2026/api/sitemap.js) (líneas 4 y 48): cambia `BASE_URL` y `new URL(rawUrl, ...)` a `https://collectibles.com.uy`.
  2. [frontend/index.html](file:///c:/Projects/Collectibles2026/frontend/index.html) (líneas 9, 23, 95-146): actualiza `keywords`, `og:url` y `@id`/`url`/`urlTemplate` del JSON-LD inicial, **conservando correctamente** `https://instagram.com/collectibles.uy` y `https://facebook.com/collectibles.uy`.
  3. [frontend/public/robots.txt](file:///c:/Projects/Collectibles2026/frontend/public/robots.txt) (líneas 46-47): actualiza `Sitemap:` a `https://collectibles.com.uy/sitemap.xml` y `sitemap_index.xml`.

> [!WARNING]
> **Por qué NO debe hacerse merge aislado del PR #50 tal como está:**
> 1. **Rompería la suite de tests automatizados (`Vitest`)**: los archivos [seo_audit_verification.test.ts](file:///c:/Projects/Collectibles2026/frontend/src/tests/seo_audit_verification.test.ts#L135) y [seo_audit_verification.test.ts](file:///c:/Projects/Collectibles2026/tests/seo/seo_audit_verification.test.ts#L46) contienen la aserción explícita `expect(body).not.toContain('collectibles.com.uy')`.
> 2. **Cubre menos del 5% del problema real**: deja intactos `api/seo-prerender.js` (que sirve todas las páginas a Googlebot/WhatsApp/Meta según `vercel.json`), `SEO.tsx`, `seoConfig.ts`, `api/merchant-feed.js`, `api/meta-catalog.js`, Cloudflare Worker D1, CORS de las 49 Edge Functions de Supabase, `domainMarketResolver.ts`, emails transaccionales y registros en base de datos.

---

## 4. Riesgos Críticos de Seguridad y Operación Detectados (P0 y P1)

### 4.1 Riesgos P0 CRÍTICOS (Exposición a terceros / Bloqueo total de plataforma)

1. **`P0` — Fuga activa de información sensible de contracargos y clientes a `notificaciones@collectibles.uy`:**  
   En [transactional-emails/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts#L439-L501) (líneas `439`, `470` y `501`), las alertas administrativas `admin_chargeback_received`, `admin_refund_manual_required` y `admin_refund_failed` envían correos directamente a `'notificaciones@collectibles.uy'` incluyendo **ID de disputa, monto, número de orden, nombre completo y email del comprador, tienda del vendedor y motivo**. Si el tercero que controla `collectibles.uy` configura un registro `MX` catch-all en `dns1..4.hosted-domains.net`, **recibirá en texto plano datos financieros y personales de clientes de Collectibles**.
2. **`P0` — Remitente por defecto `RESEND_FROM` en dominio ajeno (`notificaciones@collectibles.uy`):**  
   En [transactional-emails/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts#L13) y [notification-dispatcher/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/notification-dispatcher/index.ts#L362), el fallback de `RESEND_FROM` es `'Collectibles Marketplace <notificaciones@collectibles.uy>'`. Además, los propios templates dicen *"responde directamente a este correo"*: cualquier respuesta de un comprador con comprobantes de pago o cédula iría a `@collectibles.uy` si el tercero activa correo entrante.
3. **`P0` — CORS de Supabase Edge Functions autoriza al dominio del tercero (`collectibles.uy`) y BLOQUEA al nuevo dominio (`collectibles.com.uy`):**  
   Verificado en vivo mediante preflight `OPTIONS` y lectura del código desplegado en `cobtsgkwcftvexaarwmo`: [cors.ts](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/cors.ts#L2-L23) y [meta-capi/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/meta-capi/index.ts#L4-L20) devuelven `Access-Control-Allow-Origin: https://collectibles.uy` cuando el `Origin` es `https://collectibles.uy`, pero cuando un cliente opera en `https://collectibles.com.uy` devuelven `https://collectibles-ecommerce.vercel.app` (o `https://collectibles.uy` en `meta-capi`), **provocando fallo CORS total en navegador para `create-order`, `create-payment`, `mercadopago-checkout`, `mercadolibre-auth` y `meta-capi`**. Adicionalmente, cada Edge Function empaqueta su propia copia de `_shared/cors.ts` al desplegarse (p. ej. `mercadolibre-auth` conserva incluso `origin.endsWith('.vercel.app')`), por lo que **todas las Edge Functions deben redesplegarse** tras corregir `_shared/cors.ts`.
4. **`P0` — Dos Hero Banners ACTIVOS en Base de Datos de Producción envían tráfico de portada a `https://collectibles.uy`:**  
   En `public.banners` de `cobtsgkwcftvexaarwmo`, los banners activos `aaae3686-fd7b-4b35-bca0-d6218cfd32d0` (*"SONIC Y MINECRAFT"*, `is_active: true`) y `316eae0d-ee47-41fa-8489-a3a22dfc4391` (*"99 Sombras en el bosque"*, `is_active: true`) tienen `link_url` absoluto apuntando a `https://collectibles.uy/collection/...` (más un tercer banner inactivo `cab5516b-59a4-477e-b18c-c0d717182e79`). Cualquier usuario en `collectibles.com.uy` que haga clic en esos banners es enviado al dominio controlado por el tercero.
5. **`P0` — Pasarela de pagos Handy en Producción configurada con `site_url: "https://collectibles.uy"`:**  
   En `public.payment_providers` (`id = f247d0be-1f39-4836-9e35-fca418d8a4a1`, `provider_key = 'handy'`, `is_active = true`, `environment = 'production'`), el JSON `config` almacena `"site_url": "https://collectibles.uy"`, y [create-handy-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts#L244-L246) también tiene fallback `"https://collectibles.uy"`. Esto redirige el retorno post-pago con tarjeta al dominio del tercero.
6. **`P0` — Clasificador de seguridad de dominio (`domainMarketResolver.ts`) marca `collectibles.com.uy` como `UNTRUSTED_UNKNOWN`:**  
   En [domainMarketResolver.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/marketEngine/domainMarketResolver.ts#L39-L50), `AUTHORIZED_DOMAIN_MAPPINGS` autoriza `collectibles.uy` y `www.collectibles.uy` como `PRODUCTION_OFFICIAL`, mientras que `collectibles.com.uy` y `www.collectibles.com.uy` caen en `classification: 'UNTRUSTED_UNKNOWN'`, `isAuthorizedHost: false`, **`canCheckoutOnDomain: false`**.
7. **`P0` — Proxies de imágenes (`catalog-image.js` y `media-proxy`) confían en `*.collectibles.uy` y bloquean `collectibles.com.uy`:**  
   [api/catalog-image.js](file:///c:/Projects/Collectibles2026/api/catalog-image.js#L4-L50), [frontend/api/catalog-image.js](file:///c:/Projects/Collectibles2026/frontend/api/catalog-image.js#L4-L50) y [media-proxy/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/media-proxy/index.ts#L14) incluyen `'collectibles.uy'` (y cualquier subdominio `*.collectibles.uy` siguiendo hasta 5 redirecciones HTTP) en su lista blanca SSRF, permitiendo que el backend conecte hacia infraestructura del tercero mientras rechaza con `403` URLs de `collectibles.com.uy`.
8. **`P0` — Implicación de mantener `collectibles.uy` asociado al proyecto Vercel:**  
   Mientras `collectibles.uy` siga agregado en `Vercel > Project Settings > Domains`, si el tercero apunta un registro `A` a `216.198.79.1` o `CNAME` a Vercel, Vercel servirá la aplicación de Collectibles bajo el dominio del tercero (permitiéndole hacer proxy inverso/MITM intermitente o suplantación), o generará conflictos de enrutamiento. Debe desvincularse de forma controlada (ver Sección 10.6).
9. **`P0` — Ausencia de registro `_dmarc` y de DKIM para Resend en DNS de `collectibles.com.uy`:**  
   En Vercel DNS existe un registro comodín que responde `A` para `_dmarc.collectibles.com.uy`, sin registro `TXT` de `DMARC`, y el SPF solo incluye `_spf.google.com` sin Resend, dejando el nuevo dominio expuesto a spoofing de correo y bloqueo de envíos transaccionales desde `@collectibles.com.uy`.

### 4.2 Riesgos P1 ALTOS (Autenticación, Pagos, Phishing en Notificaciones e Integraciones)

1. **`P1` — Supabase Auth en Producción (`cobtsgkwcftvexaarwmo`) tiene `SITE_URL = http://localhost:3000` y rechaza `redirect_to` de `collectibles.com.uy`:**  
   Comprobado mediante inspección de solo lectura en `auth.flow_state` tras consultar `/auth/v1/authorize?provider=google` sin seguir redirecciones: tanto sin `redirect_to` como enviando `redirect_to=https://collectibles.com.uy/...`, GoTrue resuelve `referrer = "http://localhost:3000"`. Hoy **ningún usuario puede completar Google Login, Magic Link (`signInWithOtp`), confirmación de registro (`signUp`) ni invitación (`inviteUserByEmail`) en producción**, porque al volver de Google/correo es enviado a `http://localhost:3000`. *(Nota positiva de seguridad: actualmente tampoco envía tokens a `collectibles.uy`, pero debe asegurarse que `collectibles.uy` quede eliminado del `Redirect URLs` Allow List).*
2. **`P1` — 31 Deep Links en Emails, WhatsApp y Push (`notificationTemplates.ts` + `notification-dispatcher` + `abandoned-carts-cron`) apuntan a `https://collectibles.uy/...`:**  
   Los enlaces de órdenes, reembolsos, preguntas y paneles (`/admin/orders`, `/admin/refunds`, `/admin/marketplace`, `/vendor`, `/affiliate`, `/account`, `/checkout?recover=...`) llevan a usuarios, vendedores y administradores directamente a `https://collectibles.uy`. Si el tercero levanta un clon de login en `collectibles.uy`, **capturaría credenciales de administradores, vendors y clientes**.
3. **`P1` — `create-payment` refleja `req.headers.get("origin")` sin validación de lista blanca en URLs de retorno de pago y usa `guest@collectibles.uy`:**  
   En [create-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-payment/index.ts#L141) y `:431-444`, `origin` se toma del header HTTP `Origin` sin validar contra una lista cerrada de dominios propios para construir `success_url`/`back_url` (dLocal Go), `return_url`/`cancel_url` (PayPal) y `back_urls` (Mercado Pago). Además, en `:436` usa `guest@collectibles.uy` como fallback de email del comprador en Mercado Pago, y [mercadopago-checkout/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/mercadopago-checkout/index.ts#L9) usa `"https://collectibles.uy"` como fallback de `origin`.
4. **`P1` — Cloudflare Worker D1 (`collectibles-catalog-api`) bloquea CORS a `collectibles.com.uy` y emite feeds con `collectibles.uy`:**  
   Verificado en vivo (`Origin: https://collectibles.com.uy` → `ACAO: https://collectibles.uy`) y en [wrangler.toml](file:///c:/Projects/Collectibles2026/cloudflare/collectibles-catalog-api/wrangler.toml#L19) + [src/index.ts](file:///c:/Projects/Collectibles2026/cloudflare/collectibles-catalog-api/src/index.ts#L161). Si `CF_PUBLIC_CATALOG_ENABLED=true`, además sobre-escribe `/meta-catalog.csv` y `/merchant-feed.xml` con enlaces a `collectibles.uy`.
5. **`P1` — dLocal Go Webhook (`dlocalgo-webhook`) carece de `payments_dlocal_go_x_login` en `site_settings`:**  
   En BD `site_settings`, dLocal Go está actualmente deshabilitado (`payments_dlocal_go_enabled = 'false'`, `payments_dlocal_go_sandbox = 'false'`), pero si se activa en producción, [dlocalgo-webhook/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/dlocalgo-webhook/index.ts#L40-L60) exige `payments_dlocal_go_x_login` (clave ausente en `site_settings`) y devolverá `HTTP 500`. Además, en modo sandbox (`isSandbox === true`), si falta `x_login` omite la verificación HMAC.
6. **`P1` — Mercado Libre OAuth (`Redirect URIs`), OneSignal Web Push (`Site URL`) y dependencia temporal de Google Workspace:**  
   Requieren reconfiguración coordinada en paneles externos para no interrumpir sincronización ML, notificaciones push ni recepción de `info@collectibles.com.uy` al vencer la prueba de Google Workspace.

---

## 5. Matriz Maestra de Hallazgos (`AUD-001` a `AUD-078`)

Estados utilizados (estrictamente según especificación): `VERIFIED_OK`, `OLD_DOMAIN_FOUND`, `SECURITY_RISK`, `MANUAL_ACTION_REQUIRED`, `NOT_VERIFIED`, `NOT_APPLICABLE`, `TEST_FAILED`.

### 5.1 Seguridad, Autenticación, Base de Datos y Edge Functions

| ID | Módulo | Archivo o servicio | Referencia encontrada | Riesgo | Evidencia | Cambio propuesto | Estado |
|---|---|---|---|---|---|---|---|
| `AUD-001` | Edge Functions CORS | [cors.ts](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/cors.ts#L2-L23) + 49 funciones en `cobtsgkwcftvexaarwmo` | `ALLOWED_ORIGINS` incluye `collectibles.uy` / `www.collectibles.uy` y omite `collectibles.com.uy` | **P0 CRÍTICO** | Preflight `OPTIONS` en vivo devuelve `ACAO: https://collectibles-ecommerce.vercel.app` para `.com.uy` y `ACAO: https://collectibles.uy` para `.uy` | Reemplazar `.uy` por `https://collectibles.com.uy` (índice 0) y `https://www.collectibles.com.uy`; eliminar `.uy`; redesplegar todas las Edge Functions | `SECURITY_RISK` |
| `AUD-002` | Meta CAPI CORS & Source | [meta-capi/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/meta-capi/index.ts#L4-L21) y `#L88` | `allowedOrigins` propio con `collectibles.uy`, fallback `allowOrigin = 'https://collectibles.uy'` y `eventSourceUrl` `.uy` | **P0 CRÍTICO** | Preflight `OPTIONS` en vivo a `meta-capi` desde `collectibles.com.uy` devuelve `ACAO: https://collectibles.uy` (`TEST_FAILED`) | Reemplazar `.uy` por `https://collectibles.com.uy` y `https://www.collectibles.com.uy` en líneas 5-6, 20 y 88; redesplegar `meta-capi` | `SECURITY_RISK` |
| `AUD-003` | Emails Transaccionales (Fuga PII) | [transactional-emails/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts#L439-L501) | Destinatario hardcodeado `'notificaciones@collectibles.uy'` en contracargos y reembolsos fallidos | **P0 CRÍTICO** | Líneas `439`, `470`, `501` envían nombre/email de cliente, orden y monto a buzón del dominio de tercero | Enviar a destinatarios activos de `admin_notification_settings.email_recipients` (fallback `collectiblesuy@gmail.com` / `info@collectibles.com.uy`) | `SECURITY_RISK` |
| `AUD-004` | Emails Transaccionales (`From`) | [transactional-emails/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts#L13) y [notification-dispatcher/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/notification-dispatcher/index.ts#L362) | `RESEND_FROM` fallback `'Collectibles Marketplace <notificaciones@collectibles.uy>'` | **P0 CRÍTICO** | Código en repo y función desplegada v30/v21; respuestas de clientes irían a `@collectibles.uy` | Verificar `collectibles.com.uy` en Resend (DKIM+SPF) y cambiar `RESEND_FROM` secret + código a `notificaciones@collectibles.com.uy` + `reply_to` seguro | `SECURITY_RISK` |
| `AUD-005` | Market Engine / Host Guard | [domainMarketResolver.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/marketEngine/domainMarketResolver.ts#L39-L49) | Autoriza `collectibles.uy` / `www.collectibles.uy`; desconoce `collectibles.com.uy` | **P0 CRÍTICO** | `classifyHost('collectibles.com.uy')` retorna `UNTRUSTED_UNKNOWN` y `canCheckoutOnDomain: false` | Reemplazar `collectibles.uy` y `www.collectibles.uy` por `collectibles.com.uy` y `www.collectibles.com.uy` (`PRODUCTION_OFFICIAL`) | `SECURITY_RISK` |
| `AUD-006` | Proxy Imágenes (SSRF) | [api/catalog-image.js](file:///c:/Projects/Collectibles2026/api/catalog-image.js#L8), [frontend/api/catalog-image.js](file:///c:/Projects/Collectibles2026/frontend/api/catalog-image.js#L8), [media-proxy/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/media-proxy/index.ts#L14) | `'collectibles.uy'` en `ALLOWED_HOSTS` / `ALLOWED_DOMAINS` (incluye `*.collectibles.uy`) | **P0 CRÍTICO** | El proxy sigue hasta 5 redirects hacia `*.collectibles.uy` y bloquea `collectibles.com.uy` con `403` | Eliminar `'collectibles.uy'` de la lista blanca y agregar `'collectibles.com.uy'` | `SECURITY_RISK` |
| `AUD-007` | BD Prod — Banners Home | Tabla `public.banners` en `cobtsgkwcftvexaarwmo` (3 filas) | `link_url = 'https://collectibles.uy/collection/...'` en 2 banners activos y 1 inactivo | **P0 CRÍTICO** | SQL verificó IDs `aaae3686-...` (`is_active: true`), `316eae0d-...` (`is_active: true`) y `cab5516b-...` (`false`) | Actualizar `link_url` a rutas relativas `/collection/minecraft`, `/collection/99-noches-en-el-bosque`, `/collection/20--dto-dia-del-nio` | `SECURITY_RISK` |
| `AUD-008` | BD Prod — Pagos Handy | Tabla `public.payment_providers` (`id: f247d0be-...`) + [create-handy-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts#L246) | `config.site_url = "https://collectibles.uy"` y fallback `"https://collectibles.uy"` | **P0 CRÍTICO** | SQL verificó `payment_providers` activo en prod + línea 246 de Edge Function v40 | Actualizar `config.site_url` a `"https://collectibles.com.uy"` en BD y fallback en `create-handy-payment/index.ts` | `SECURITY_RISK` |
| `AUD-009` | Supabase Auth Prod | Proyecto `cobtsgkwcftvexaarwmo` (`Site URL` y `Redirect URLs`) | `SITE_URL` actual es `http://localhost:3000`; `collectibles.com.uy` NO está en `Redirect URLs` | **P1 ALTO** | `GET /auth/v1/authorize?provider=google&redirect_to=https://collectibles.com.uy/...` registró `referrer = "http://localhost:3000"` en `auth.flow_state` (`2026-11-26 18:36Z`) | En Supabase Auth > URL Configuration fijar `Site URL = https://collectibles.com.uy`, agregar rutas exactas de `.com.uy` y asegurar que `collectibles.uy` NO esté en Redirect URLs | `TEST_FAILED` |
| `AUD-010` | Supabase Auth Código | [AuthContext.tsx](file:///c:/Projects/Collectibles2026/frontend/src/contexts/AuthContext.tsx#L184-L210), [DeblexAuth.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/argentina/DeblexAuth.tsx#L61-L63), [deblex-manage-users/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/deblex-manage-users/index.ts#L103) | `signUp` e `inviteUserByEmail` dependen de `SITE_URL`; OAuth/OTP usan `${window.location.origin}/`; Deblex usa `/deblex?reset=true`; PKCE activo en [supabase.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/supabase.ts#L16) | **P1 ALTO** | `Login.tsx:154` tiene botón "¿Olvidaste tu contraseña?" deshabilitado; cambio de clave autenticado vive en `CustomerPortal.tsx:910` y `DeblexEntryPage.tsx:171` | Pasar `emailRedirectTo: \`${window.location.origin}/\`` en `signUp` y autorizar explícitamente en Supabase: `https://collectibles.com.uy/`, `https://www.collectibles.com.uy/`, `https://collectibles.com.uy/deblex`, `https://collectibles-ecommerce.vercel.app/` | `MANUAL_ACTION_REQUIRED` |
| `AUD-011` | Supabase Auth Templates/SMTP | Consola Supabase `cobtsgkwcftvexaarwmo` y `csnudufkpfzveoonjumy` (Email Templates & Custom SMTP) | `mailer_autoconfirm: true` verificado en `/auth/v1/settings`; plantillas HTML y credenciales SMTP de GoTrue solo visibles en Dashboard | **P1 ALTO** | `/auth/v1/settings` leído OK; templates/SMTP inaccesibles por API pública/SQL | Revisar en Supabase Dashboard > Authentication > Email Templates y Auth > SMTP que no figure `@collectibles.uy` ni links a `collectibles.uy` | `NOT_VERIFIED` |
| `AUD-012` | Deep Links Notificaciones | [notificationTemplates.ts](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/notificationTemplates.ts#L113-L1194) (31 líneas) | Todos los botones de órdenes, reembolsos, preguntas y paneles (`/admin/*`, `/vendor*`, `/affiliate*`, `/account*`) apuntan a `https://collectibles.uy` | **P1 ALTO** | 31 ocurrencias verificadas en código compartido por Email, WhatsApp e In-App | Centralizar constante `SITE_URL = Deno.env.get('PUBLIC_SITE_URL') \|\| 'https://collectibles.com.uy'` y migrar las 31 URLs (y `/producto/` en lugar de `/p/`) | `SECURITY_RISK` |
| `AUD-013` | Dispatcher & Crons Links | [notification-dispatcher/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/notification-dispatcher/index.ts#L745), `#L2472`, `#L2962`, `#L2992`, `#L3225`, `#L3254`; [abandoned-carts-cron/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/abandoned-carts-cron/index.ts#L90), `#L177`; [transactional-emails/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts#L546) | Links OneSignal Push, healthcheck Resend (`d.name === 'collectibles.uy'`), `canonical_domain` y carrito abandonado (`https://collectibles.uy/checkout?recover=...`) | **P1 ALTO** | Inspección directa de archivos en `supabase/functions/` | Actualizar todas las URLs a `https://collectibles.com.uy` y healthcheck Resend a `'collectibles.com.uy'` | `OLD_DOMAIN_FOUND` |
| `AUD-014` | Edge Functions CORS Estático | `dlocalgo-checkout`, `dlocalgo-webhook`, `transactional-emails`, `refund-order`, `create-test-user` y otras que importan `corsHeaders` fijo | Usan `ALLOWED_ORIGINS[0]` (`https://collectibles-ecommerce.vercel.app`) en vez de `getCorsHeaders(req)` | **P1 ALTO** | [dlocalgo-checkout/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/dlocalgo-checkout/index.ts#L8), [transactional-emails/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts#L155) | Poner `https://collectibles.com.uy` como `ALLOWED_ORIGINS[0]` y migrar endpoints invocados desde navegador a `getCorsHeaders(req)` | `OLD_DOMAIN_FOUND` |
| `AUD-015` | Cron Jobs PostgreSQL | `cron.job` en `cobtsgkwcftvexaarwmo` (18 jobs activos/inactivos) | Todos los crons invocan `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/...` o funciones SQL internas | **P3 BAJO** | Inspección SQL completa de `cron.job` (ningún job apunta a `collectibles.uy`) | No requiere cambio de URL en `cron.job` (solo redesplegar las Edge Functions invocadas por esos crons) | `VERIFIED_OK` |

---

### 5.2 Pasarelas de Pago, Marketplaces y Logística

| ID | Módulo | Archivo o servicio | Referencia encontrada | Riesgo | Evidencia | Cambio propuesto | Estado |
|---|---|---|---|---|---|---|---|
| `AUD-016` | Pagos — Orquestador | [create-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-payment/index.ts#L141) y `#L430-L448` | `origin` tomado de `req.headers.get("origin")` sin allowlist; fallback `.vercel.app`; payer fallback `"guest@collectibles.uy"` en `#L436` | **P1 ALTO** | Código fuente líneas `141`, `157-159`, `278-279`, `431-447`. Los `notification_url` apuntan a `cobtsgkwcftvexaarwmo.supabase.co/functions/v1/*-webhook` (`VERIFIED_OK`) | Validar `origin` contra lista cerrada (`collectibles.com.uy`, `www.collectibles.com.uy`, `collectibles-ecommerce.vercel.app`), fijar fallback `https://collectibles.com.uy` y cambiar `guest@collectibles.uy` a `guest@collectibles.com.uy` | `SECURITY_RISK` |
| `AUD-017` | Mercado Pago Checkout | [mercadopago-checkout/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/mercadopago-checkout/index.ts#L9) | `"origin": req.headers.get("origin") \|\| "https://collectibles.uy"` | **P1 ALTO** | Verificado tanto en repo local como en bundle desplegado v30 en `cobtsgkwcftvexaarwmo` | Cambiar fallback a `"https://collectibles.com.uy"` y redesplegar con nuevo `_shared/cors.ts` | `OLD_DOMAIN_FOUND` |
| `AUD-018` | Mercado Pago Webhook | [mercadopago-webhook/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/mercadopago-webhook/index.ts#L16-L117) + Panel MP | Webhook URL en preferencias apunta a `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadopago-webhook` con validación HMAC-SHA256 (`x-signature`) en tiempo constante | **P1 ALTO** | Código verificado OK; falta confirmar en Panel de Desarrolladores de Mercado Pago si hay URL IPN/Webhook global registrada hacia `collectibles.uy` | Verificar en Mercado Pago Developers > Webhooks/IPN que la URL global (si existe) sea `cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadopago-webhook` y nunca `collectibles.uy` | `NOT_VERIFIED` |
| `AUD-019` | dLocal Go | [create-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-payment/index.ts#L143-L215) y [dlocalgo-webhook/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/dlocalgo-webhook/index.ts#L37-L60) | En `site_settings`: `payments_dlocal_go_enabled = 'false'`, `payments_dlocal_go_sandbox = 'false'`, falta clave `payments_dlocal_go_x_login`; [dlocalgo-checkout/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/dlocalgo-checkout/index.ts#L52) es función legacy rota (`paymentPayload` no definido) | **P1 ALTO** | Inspección de `site_settings` en BD Prod y código de ambas Edge Functions; `notification_url` usa `supabase.co/functions/v1/dlocalgo-webhook` | Verificar en panel dLocal Go que no exista Notification URL fija a `collectibles.uy`; si se reactiva dLocal Go, cargar `payments_dlocal_go_x_login` y exigir firma también en sandbox | `NOT_VERIFIED` |
| `AUD-020` | Reembolsos -> Meta CAPI | [refund-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/refund-order/index.ts#L1351) | `event_source_url: 'https://collectibles.uy/admin/refunds'` | **P2 MEDIO** | Línea `1351` de `refund-order` | Cambiar a `'https://collectibles.com.uy/admin/refunds'` y usar `getCorsHeaders(req)` | `OLD_DOMAIN_FOUND` |
| `AUD-021` | Checkout UI | [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L4741), `#L618`, `#L4449` | Link de Términos apunta a `https://collectibles-ecommerce.vercel.app/page/terminos`; etiqueta de tienda principal muestra `'Collectibles.uy'` | **P2 MEDIO** | Líneas `618`, `4449` y `4741` de `Checkout.tsx` | Cambiar `href` en `:4741` a `/page/terminos` (ruta interna); decidir cambio coordinado de etiqueta `'Collectibles.uy'` junto con sus tests unitarios/E2E | `OLD_DOMAIN_FOUND` |
| `AUD-022` | Mercado Libre OAuth | [mercadolibre-auth/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/mercadolibre-auth/index.ts#L12), [AdminMercadoLibre.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminMercadoLibre.tsx#L476), [MLCallback.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/MLCallback.tsx#L33), [Callback.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Callback.tsx#L33), [VMercadoLibre.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/vendor/VMercadoLibre.tsx#L388) | Frontend envía `window.location.origin` (`/callback`, `/auth/callback`, `/vendor/ml/callback`) o `VITE_ML_REDIRECT_URI`; Edge Function usa `MERCADOLIBRE_REDIRECT_URI` | **P1 ALTO** | En BD `site_settings`: `ml_connection_status = 'true'`, `ml_webhooks_enabled = 'true'`, `ml_sync_paused = 'true'`. Crons de renovación token (`ml-oauth-token-check`) y webhooks van directo a `cobtsgkwcftvexaarwmo.supabase.co` | En Mercado Libre DevCenter (App ID `2640840034755802`) registrar `https://collectibles.com.uy/callback`, `/auth/callback` y `/vendor/ml/callback`, eliminar `collectibles.uy/*` y verificar que Notifications Callback URL apunte a `cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-webhook` | `MANUAL_ACTION_REQUIRED` |
| `AUD-023` | Logística (SoyDelivery, DAC, UES, Distrilogic, MBE, SkyPostal, Zinc) | `public.shipping_providers`, `zinc_integration_settings`, [AdminLogistics.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminLogistics.tsx#L2202-L2204), [mbe-logistics/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/mbe-logistics/index.ts#L723), [skypostal-client.ts](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/skypostal/skypostal-client.ts#L123) | SoyDelivery (`active`), DAC (`active`), UES (`inactive`), Distrilogic (`testing_enabled: true`, `webhook_enabled: false`), Zinc (`sandbox` activo, webhook en `supabase.co`). `AdminLogistics.tsx:2203` muestra URL errónea de webhook DAC en `.vercel.app/functions/v1/dac-webhook`; `skypostal-client.ts` mock usa `storage.collectibles.uy`; `mbe-logistics:723` usa `ventas@collectibles.com` | **P2 MEDIO** | Inspección SQL de `shipping_providers` y `zinc_integration_settings` + código de Edge Functions | Corregir texto informativo en `AdminLogistics.tsx:2203` a `${supabaseUrl}/functions/v1/dac-webhook`, mock `skypostal-client.ts` a `storage.collectibles.com.uy` (junto con sus 2 tests) y remitente en `mbe-logistics` | `OLD_DOMAIN_FOUND` |

---

### 5.3 SEO Técnico, Feeds Comerciales, Analítica, Meta y Cloudflare D1

| ID | Módulo | Archivo o servicio | Referencia encontrada | Riesgo | Evidencia | Cambio propuesto | Estado |
|---|---|---|---|---|---|---|---|
| `AUD-024` | SEO Prerender (Bots) | [api/seo-prerender.js](file:///c:/Projects/Collectibles2026/api/seo-prerender.js#L6) y `#L715`, `#L1452-L1506` | `const BASE_URL = 'https://collectibles.uy';` | **P1 ALTO** | Prueba en vivo con `User-Agent: Googlebot/2.1` en `https://collectibles.com.uy/shop` devolvió `<link rel="canonical" href="https://collectibles.uy/shop" />` (`TEST_FAILED`) | Actualizar `BASE_URL` y JSON-LD en `api/seo-prerender.js` a `https://collectibles.com.uy` (**conservando** líneas `1463-1464` de IG/FB) | `TEST_FAILED` |
| `AUD-025` | Sitemaps en Producción | [api/sitemap.js](file:///c:/Projects/Collectibles2026/api/sitemap.js#L4), [frontend/api/sitemap.js](file:///c:/Projects/Collectibles2026/frontend/api/sitemap.js#L10), [supabase/functions/sitemap/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/sitemap/index.ts#L12) | En `main` y en vivo `/sitemap.xml` y `/sitemap_index.xml` emiten `<loc>https://collectibles.uy/...</loc>`; `frontend/api/sitemap.js` no fue incluido en PR #50; Edge Function tiene `'https://www.tudominio.com'` | **P1 ALTO** | Prueba HTTP en vivo sobre `https://collectibles.com.uy/sitemap.xml` (`TEST_FAILED`) | Incluir corrección de `api/sitemap.js` (PR #50), `frontend/api/sitemap.js` y `supabase/functions/sitemap/index.ts` | `TEST_FAILED` |
| `AUD-026` | Robots.txt e `index.html` | [frontend/public/robots.txt](file:///c:/Projects/Collectibles2026/frontend/public/robots.txt#L46-L47) y [frontend/index.html](file:///c:/Projects/Collectibles2026/frontend/index.html#L9-L146) | En producción actual (`main`) apuntan a `https://collectibles.uy`; corregidos en rama borrador PR #50 | **P2 MEDIO** | `GET https://collectibles.com.uy` y `/robots.txt` muestran aún `collectibles.uy` | Integrar cambios de PR #50 junto con el lote completo SEO y tests actualizados | `OLD_DOMAIN_FOUND` |
| `AUD-027` | SEO Cliente SPA & Helpers | [seoConfig.ts](file:///c:/Projects/Collectibles2026/frontend/src/seo/seoConfig.ts#L3), [SEO.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/SEO.tsx#L22-L100), [seo-helpers.js](file:///c:/Projects/Collectibles2026/server/lib/seo-helpers.js#L1), [frontend/api/social.js](file:///c:/Projects/Collectibles2026/frontend/api/social.js#L21), [AdminSeo.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminSeo.tsx#L52) | `BASE_URL = 'https://collectibles.uy'`, normalizador `www.collectibles.uy` y schemas JSON-LD en cliente | **P2 MEDIO** | Omitidos en PR #50; generan `<link rel="canonical">` al dominio viejo al navegar en React | Actualizar a `https://collectibles.com.uy` y normalizar `www.collectibles.com.uy -> collectibles.com.uy` (**conservando** `SEO.tsx:57-58` IG/FB) | `OLD_DOMAIN_FOUND` |
| `AUD-028` | Canónicas en Páginas SPA | [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx#L1234-L1240), [DynamicPage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/DynamicPage.tsx#L465), [VendorStorefront.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/VendorStorefront.tsx#L671), [AISearchPage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/AISearchPage.tsx#L432), [ComparePage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/compare/ComparePage.tsx#L510), [ImportHubPage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/importhub/ImportHubPage.tsx#L207), [RadarFeedPage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/radar/RadarFeedPage.tsx#L360), [ReleaseCalendarPage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/radar/ReleaseCalendarPage.tsx#L72), [ReleaseDetailPage.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/radar/ReleaseDetailPage.tsx#L224), [Home.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Home.tsx#L1158) | 10 vistas pasan URLs canónicas o keywords con `https://collectibles.uy/...` | **P2 MEDIO** | Inspección exhaustiva de `frontend/src/pages/` | Usar constante centralizada `BASE_URL` (`https://collectibles.com.uy`) en las 10 páginas | `OLD_DOMAIN_FOUND` |
| `AUD-029` | Google Merchant Feed | [api/merchant-feed.js](file:///c:/Projects/Collectibles2026/api/merchant-feed.js#L65-L103) + Google Merchant Center | `<link>https://collectibles.uy</link>`, `<g:link>` e imágenes proxy `https://collectibles.uy/catalog-images/...` | **P1 ALTO** | Prueba en vivo `GET https://collectibles.com.uy/merchant-feed.xml` devolvió `<link>https://collectibles.uy</link>` (`TEST_FAILED`); imágenes externas proxy dan DNS error porque `collectibles.uy` no resuelve | Actualizar `api/merchant-feed.js` a `https://collectibles.com.uy` y reclamar/actualizar dominio `collectibles.com.uy` + URL del feed en Google Merchant Center | `TEST_FAILED` |
| `AUD-030` | Meta Catalog CSV | [api/meta-catalog.js](file:///c:/Projects/Collectibles2026/api/meta-catalog.js#L11), `#L33` y [frontend/api/meta-catalog.js](file:///c:/Projects/Collectibles2026/frontend/api/meta-catalog.js#L8), `#L30` | `BASE_SITE_URL = 'https://collectibles.uy'` para `link` e `image_link` | **P1 ALTO** | Prueba en vivo `GET https://collectibles.com.uy/meta-catalog.csv` emite links e imágenes hacia `https://collectibles.uy/...` (`TEST_FAILED`) | Cambiar `BASE_SITE_URL` a `https://collectibles.com.uy`, reescribir prefijos viejos en `resolveImageUrl` y actualizar URL del Data Feed en Meta Commerce Manager | `TEST_FAILED` |
| `AUD-031` | Cloudflare Worker D1 | [wrangler.toml](file:///c:/Projects/Collectibles2026/cloudflare/collectibles-catalog-api/wrangler.toml#L19) y [src/index.ts](file:///c:/Projects/Collectibles2026/cloudflare/collectibles-catalog-api/src/index.ts#L161), `#L1240-L1346` | `ALLOWED_ORIGINS` solo permite `collectibles.uy` y genera Merchant/Meta/Sitemap con `https://collectibles.uy` | **P1 ALTO** | Preflight en vivo a `collectibles-catalog-api.pixelsncodes-uy.workers.dev` devolvió `ACAO: https://collectibles.uy` (`TEST_FAILED`) | Actualizar `ALLOWED_ORIGINS` (removiendo `.uy` y agregando `.com.uy` + `www`) y las URLs de feeds en `src/index.ts`; desplegar Worker si se habilita D1 | `TEST_FAILED` |
| `AUD-032` | Meta Pixel, CAPI & Domain Verification | [frontend/index.html](file:///c:/Projects/Collectibles2026/frontend/index.html#L17), `#L79`, [metaPixel.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/meta/metaPixel.ts#L9), [metaCapi.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/meta/metaCapi.ts#L26), `site_settings.appearance_head_code` | Pixel oficial `1623445247816011` con deduplicación `eventID` (`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`) y `event_source_url = window.location.href` (`VERIFIED_OK`), **PERO**: (1) `<meta name="facebook-domain-verification" content="ef350bebbc47il5yan0fr22rbwupmj">` corresponde a `collectibles.uy`; (2) `site_settings.appearance_head_code` inyecta un **segundo Pixel distinto (`2487606138177497`)** con HTML malformado (`</head>---other website code---`) cuando se aceptan cookies | **P2 MEDIO** | Verificado en `index.html`, `StorefrontLayout.tsx:357-359` y consulta SQL a `site_settings`/`public_site_config` | Conservar Pixel ID `1623445247816011`; verificar `collectibles.com.uy` en Meta Business Manager (vía TXT DNS en Vercel o nuevo meta tag), autorizar dominio en Traffic Permissions del Pixel, actualizar campañas activas y limpiar `appearance_head_code` en BD | `MANUAL_ACTION_REQUIRED` |
| `AUD-033` | Google Search Console API | [api/gsc-monitor.js](file:///c:/Projects/Collectibles2026/api/gsc-monitor.js#L12-L23), `#L105`, `#L115`, `#L162` y [google-search-console.js](file:///c:/Projects/Collectibles2026/server/lib/google-search-console.js#L31) | `raw.includes('collectibles.uy')` (**no** hace match con `'collectibles.com.uy'`) y `PRIORITY_URL_SAMPLE` / `targetSitemap` apuntan a `collectibles.uy` | **P2 MEDIO** | DNS TXT `google-site-verification=Z4XaqBqplj63tTWCyo9GM5aSI3MMiAuVHDsvJV57xQQ` ya existe en `collectibles.com.uy`, pero el monitor API sigue buscando `collectibles.uy` | Actualizar `findCollectiblesProperty` a `'collectibles.com.uy'` y URLs en `api/gsc-monitor.js`; dar permisos a la Service Account en la propiedad GSC de `collectibles.com.uy` y enviar `https://collectibles.com.uy/sitemap.xml` (**NO usar Change of Address**) | `OLD_DOMAIN_FOUND` |
| `AUD-034` | Google Analytics 4 & Ads | [frontend/index.html](file:///c:/Projects/Collectibles2026/frontend/index.html#L56-L63) y [analyticsTracker.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/analyticsTracker.ts#L15-L22) | `G-JGVY58K11H` instalado correctamente; `analyticsTracker.ts` clasifica `collectibles.com.uy` como tráfico comercial (`VERIFIED_OK`); configuración interna de Data Stream URL, Referral Exclusions y Google Ads inaccesible desde repo | **P2 MEDIO** | Inspección de código + HTML en vivo | Conservar Measurement ID `G-JGVY58K11H` (no crear propiedad nueva); en GA4 Admin > Data Streams actualizar Website URL a `https://collectibles.com.uy`, verificar pasarelas en Unwanted Referrals (`mercadopago.com.uy`, `dlocalgo.com`, `handy.uy`, `paypal.com`) y actualizar URLs finales en Google Ads | `NOT_VERIFIED` |
| `AUD-035` | OneSignal Web Push | [onesignal.ts](file:///c:/Projects/Collectibles2026/frontend/src/config/onesignal.ts), [notification-dispatcher/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/notification-dispatcher/index.ts#L352) y Panel OneSignal | `ONESIGNAL_APP_ID = 00a0c8cc-6b24-4ad1-9503-2e329ee5c566`; los Service Workers Web Push están ligados por navegador al origen exacto configurado en OneSignal | **P1 ALTO** | Logs en `notification_logs` confirman envíos previos por `onesignal`; consola externa inaccesible | Verificar/actualizar `Site URL` a `https://collectibles.com.uy` en OneSignal Dashboard > Settings > Web Configuration | `NOT_VERIFIED` |
| `AUD-036` | Google Cloud Console OAuth | Proyecto GCP del Client ID `836776591370-4p755d7c8cjd6p93tvqp8bum7jc1u5p9.apps.googleusercontent.com` | Callback OAuth redirige correctamente a `https://cobtsgkwcftvexaarwmo.supabase.co/auth/v1/callback` (**conservar obligatorio**), pero OAuth Consent Screen (Homepage, Privacy, Terms, Authorized Domains) y JS Origins en GCP no son accesibles | **P1 ALTO** | Extraído de Location `302` de `/auth/v1/authorize?provider=google` | Revisar en Google Cloud Console > APIs & Services > Credentials y OAuth Consent Screen: conservar `https://cobtsgkwcftvexaarwmo.supabase.co/auth/v1/callback` en Authorized Redirect URIs, reemplazar `collectibles.uy` por `collectibles.com.uy` en Authorized JS Origins, Authorized Domains, Homepage, Privacy (`/page/pol-ticas-de-privacidad`) y Terms (`/page/terminos`) | `NOT_VERIFIED` |

---

### 5.4 Correo Corporativo, Base de Datos Secundaria, Exportaciones, Scripts, Tests y Reglas

| ID | Módulo | Archivo o servicio | Referencia encontrada | Riesgo | Evidencia | Cambio propuesto | Estado |
|---|---|---|---|---|---|---|---|
| `AUD-037` | Correo Corporativo y Contacto | DNS `collectibles.com.uy` + [Contact.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Contact.tsx#L50), `#L231-L235` + [StorefrontLayout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/layouts/StorefrontLayout.tsx#L1118) + `admin_notification_settings` | Ecommerce **NO depende de Google Workspace para enviar correos** (usa Resend API + FormSubmit a `collectiblesuy@gmail.com` + `admin_notification_settings` ya apunta a `collectiblesuy@gmail.com`). **SÍ depende de Google Workspace para recibir** en `info@collectibles.com.uy` y `soporte@collectibles.com.uy` (`MX smtp.google.com`) | **P1 ALTO** | Al vencer el trial de Google Workspace, rebotarán los correos entrantes a `@collectibles.com.uy` si no se migra la recepción | Antes del fin del trial, configurar reenvío gratuito (`ImprovMX` gratuito sin cambiar NS de Vercel, o `Cloudflare Email Routing` gratuito) hacia `collectiblesuy@gmail.com` + configurar Resend DKIM/SPF + `_dmarc` TXT (ver Sección 7) | `MANUAL_ACTION_REQUIRED` |
| `AUD-038` | BD Prod — Imágenes Test | Tabla `public.product_images` (`9b2fc489-...`, `910b95ad-...`) y `public.products` (`7f1e43d9-...`) | `url = 'https://collectibles.uy/images/collectibles-logo-official.png'` en producto `"producto prueba collectibles"` (`status: 'published'`, `is_active: true`) | **P2 MEDIO** | Consulta SQL verificó que `7f1e43d9-4f58-4a40-8768-6c56e18a0ee5` está publicado y activo en tienda con imagen rota apuntando a `collectibles.uy` | Desactivar producto de prueba en producción (`is_active = false`) y actualizar `url` a asset en Supabase Storage o `https://collectibles.com.uy/...` | `OLD_DOMAIN_FOUND` |
| `AUD-039` | BD Prod — Términos Vendors | Tabla `public.legal_documents` (`id: 864f0228-...`, v1.0) y `vendor_terms_acceptances` (2 aceptaciones) | 7 menciones a `Collectibles.uy` en `Términos y Condiciones para Vendedores v1.0` (con `checksum` SHA-256 firmado por 2 vendors) | **P3 BAJO** | Consulta SQL verificó 2 registros en `vendor_terms_acceptances` | **NO sobrescribir v1.0 histórica** (rompería integridad probatoria del checksum); insertar nueva versión `v1.1` con `Collectibles` / `collectibles.com.uy` si el marketplace se reactiva (`marketplace_enabled` hoy es `false`) | `VERIFIED_OK` |
| `AUD-040` | BD Prod — CMS & Plantillas | `public.pages`, `public.communication_templates`, `public.admin_notification_settings` | `pages` (`condiciones-de-compra`) ya tiene `info@collectibles.com.uy` (0 con `.uy`); `communication_templates` tiene 0 con `.uy`; `admin_notification_settings` ya usa `collectiblesuy@gmail.com` | **P3 BAJO** | Consultas SQL directas en `cobtsgkwcftvexaarwmo` | Mantener; sin acción requerida en estas 3 tablas | `VERIFIED_OK` |
| `AUD-041` | BD Staging | Proyecto `csnudufkpfzveoonjumy` (`site_settings`, `store_settings`, `payment_providers`, `Edge Functions`) | `0` filas con `collectibles.uy` en BD Staging; 10 Edge Functions activas (`create-payment`, `create-order`, `confirm-payment`, `dlocalgo-webhook`, etc.) comparten `_shared/cors.ts` | **P2 MEDIO** | Inspección SQL y `list_edge_functions` en `csnudufkpfzveoonjumy` | Redesplegar las 10 Edge Functions en Staging primero para certificar antes de Producción, y configurar `Redirect URLs` en Auth Staging | `MANUAL_ACTION_REQUIRED` |
| `AUD-042` | Exportación / Campos Catálogo | [exportProductsEngine.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/exportProductsEngine.ts#L79), [productFieldRegistry.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/productFieldRegistry.ts#L142), `#L150-L152`, `#L668`, `#L685`, [VProducts.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/vendor/VProducts.tsx#L1651), [AdminProducts.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminProducts.tsx#L1930) | Exportador CSV/XLSX genera `https://collectibles.uy/producto/...`; preview SEO en Admin/Vendor muestra `https://collectibles-ecommerce.com/p/` | **P2 MEDIO** | Inspección directa de archivos | Actualizar a `https://collectibles.com.uy/producto/...` (junto con `exportProducts.test.ts`) | `OLD_DOMAIN_FOUND` |
| `AUD-043` | IA Sourcing, Radar y Monedas | [sourcing-openai-research/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/sourcing-openai-research/index.ts#L15), `#L246`, [radarAIEngine.ts](file:///c:/Projects/Collectibles2026/frontend/src/plugins/collector-radar/core/radarAIEngine.ts#L393-L394), `#L615`, [radarNewsRefresh.js](file:///c:/Projects/Collectibles2026/server/lib/radarNewsRefresh.js#L34), `#L102`, [sourcingSourceVerifier.js](file:///c:/Projects/Collectibles2026/server/lib/sourcingSourceVerifier.js#L68), `#L77`, [currencyService.ts](file:///c:/Projects/Collectibles2026/frontend/src/services/currencyService.ts#L148), [api/currency-sync.js](file:///c:/Projects/Collectibles2026/api/currency-sync.js#L511), `#L556` | User-Agent de bot, `source_url`, fallbacks de `actor_email` (`@collectibles.uy`) y lista de auto-exclusión de dominios propios en agente OpenAI | **P2 MEDIO** | Inspección de código fuente | Actualizar URLs/emails fallback a `collectibles.com.uy`; en `sourcing-openai-research:246` **mantener** `collectibles.uy` y **agregar** `collectibles.com.uy` para que no cite a ninguno como competidor externo | `OLD_DOMAIN_FOUND` |
| `AUD-044` | UI / Vault / Placeholders / Fallbacks | [VaultShareCardModal.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/vault/VaultShareCardModal.tsx#L141), `#L161`, `#L477`, [NotificationCenterPanel.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/common/NotificationCenterPanel.tsx#L749), [EmailRecipientsModal.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/common/EmailRecipientsModal.tsx#L207), `useInternationalMarkets.ts:83`, `AdminCurrencies.tsx:173,212`, `AdminInternationalMarkets.tsx:1242`, `aiAdminService.ts:326` + ~22 archivos con texto de marca `"Collectibles.uy"` | Tarjeta compartible de My Vault imprime `collectibles.uy`; panel notificaciones cita `notificaciones@collectibles.uy`; fallbacks de auditoría usan `admin@collectibles.uy` | **P3 BAJO** | Inventario completo en Sección 6.2 | Actualizar `VaultShareCardModal`, `NotificationCenterPanel`, placeholders y `actor_email` fallbacks a `.com.uy`; unificar copy comercial a `"Collectibles"` / `"Collectibles.com.uy"` | `OLD_DOMAIN_FOUND` |
| `AUD-045` | GitHub Actions & Monitoreo | [.github/workflows/database-stability.yml](file:///c:/Projects/Collectibles2026/.github/workflows/database-stability.yml#L27) → [check_database_stability.mjs](file:///c:/Projects/Collectibles2026/scripts/check_database_stability.mjs#L4) + ~34 scripts en `scripts/` y `frontend/scripts/` | `const ORIGIN = 'https://collectibles.uy';` ejecutado cada hora (`17 * * * *`) en GitHub Actions | **P2 MEDIO** | El workflow horario sondea el dominio del tercero y falla por DNS `ENOTFOUND` | Actualizar `ORIGIN` en `check_database_stability.mjs` y scripts activos de validación/deploy a `https://collectibles.com.uy` | `OLD_DOMAIN_FOUND` |
| `AUD-046` | Suites de Tests (Vitest / Playwright) | [frontend/src/tests/seo_audit_verification.test.ts](file:///c:/Projects/Collectibles2026/frontend/src/tests/seo_audit_verification.test.ts#L135), [tests/seo/seo_audit_verification.test.ts](file:///c:/Projects/Collectibles2026/tests/seo/seo_audit_verification.test.ts#L46) + 25 archivos de test adicionales | Dos tests exigen literalmente `.not.toContain('collectibles.com.uy')`; `multicountry_block1_reconciliation.test.ts` exige `collectibles.uy` como `PRODUCTION_OFFICIAL` | **P2 MEDIO** | Lectura directa de tests | Actualizar los 27 archivos de tests en el mismo PR de migración para que validen `collectibles.com.uy` como dominio oficial y `collectibles.uy` como no autorizado | `OLD_DOMAIN_FOUND` |
| `AUD-047` | Reglas de Agentes y Deploy | [AGENTS.md](file:///c:/Projects/Collectibles2026/AGENTS.md#L20-L23), [GEMINI.md](file:///c:/Projects/Collectibles2026/GEMINI.md#L20-L23), [.agents/rules/collectibles-production-deploy.md](file:///c:/Projects/Collectibles2026/.agents/rules/collectibles-production-deploy.md#L13-L22), [SKILL.md](file:///c:/Projects/Collectibles2026/.agents/skills/collectibles-production-deploy/SKILL.md#L3-L241) | Instruyen verificar `https://collectibles.uy` tras cada deploy | **P2 MEDIO** | Lectura de reglas del workspace | Actualizar las 4 definiciones de reglas/skills a `https://collectibles.com.uy` para evitar que agentes futuros intenten conectarse a `collectibles.uy` | `OLD_DOMAIN_FOUND` |
| `AUD-048` | Vercel Dashboard (Dominios / Env Vars / Protection) | Proyecto Vercel `collectibles-ecommerce` | Vercel CLI local deslogueado (`> Logged out`); no es posible listar por CLI dominios vinculados ni variables de entorno de producción | **P0 CRÍTICO** | `npx vercel whoami` devolvió `Logged out` | Verificar manualmente en Vercel Dashboard > Settings > Environment Variables y Settings > Domains (y desvincular `collectibles.uy` siguiendo Sección 10.6) | `NOT_VERIFIED` |
| `AUD-049` | Redes Sociales Legítimas | [frontend/index.html](file:///c:/Projects/Collectibles2026/frontend/index.html#L125-L126), [SEO.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/SEO.tsx#L57-L58), [api/seo-prerender.js](file:///c:/Projects/Collectibles2026/api/seo-prerender.js#L1463-L1464), `site_settings.social_instagram_url` | `https://instagram.com/collectibles.uy`, `https://facebook.com/collectibles.uy` y handle `'collectibles.uy'` en `site_settings`/`public_site_config` | **N/A** | Son los nombres de usuario reales de las cuentas oficiales en Meta | **CONSERVAR SIN MODIFICAR** (excluir explícitamente de cualquier búsqueda/reemplazo) | `VERIFIED_OK` |
| `AUD-050` | Históricos (Migraciones SQL, Exclusiones Analítica y Reportes `.md`) | `supabase/migrations/*.sql`, `scripts/analytics/diagnose-sales.ts:35`, `scripts/clarity_export.js:28`, ~95 reportes `.md` de auditorías pasadas | Referencias históricas en migraciones ya aplicadas, filtro de órdenes de prueba `collectiblesuy@gmail.com` y reportes cerrados | **P3 BAJO** | Regla de integridad de migraciones e historial | **CONSERVAR SIN MODIFICAR** | `VERIFIED_OK` |

*(Nota: Las sub-referencias individuales de páginas SPA `AUD-051..060`, tests `AUD-061..070` y scripts operativos `AUD-071..078` están desglosadas con archivo y línea exacta en el Anexo Técnico Sección 6).*

---

## 6. Anexo de Archivos, Líneas Exactas y Variables de Entorno Afectadas

### 6.1 Variables de Entorno y Secretos Afectados (Sin Valores Sensibles)

Se inspeccionaron los nombres de variables en los 9 archivos `.env*` locales y referencias `process.env` / `Deno.env` / `import.meta.env` en el repositorio (**ningún valor secreto fue expuesto**):

1. **Vercel Environment Variables (`collectibles-ecommerce`) — Estado: `NOT_VERIFIED` (verificar en consola):**
   - Comprobar si existen y qué dominio contienen: `SITE_URL`, `PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `VITE_SITE_URL`, `VITE_ML_REDIRECT_URI`, `CF_PUBLIC_CATALOG_ENABLED`, `CF_CATALOG_WORKER_URL`, `VITE_CF_CATALOG_API_URL`.
   - Agregar variable canónica recomendada: `PUBLIC_SITE_URL=https://collectibles.com.uy` y `VITE_SITE_URL=https://collectibles.com.uy`.
2. **Supabase Edge Functions Secrets (`cobtsgkwcftvexaarwmo` Prod y `csnudufkpfzveoonjumy` Staging) — Estado: `MANUAL_ACTION_REQUIRED`:**
   - `RESEND_FROM`: cambiar a `Collectibles <notificaciones@collectibles.com.uy>` **únicamente después** de verificar el dominio `collectibles.com.uy` en Resend.
   - `MERCADOLIBRE_REDIRECT_URI`: actualizar a `https://collectibles.com.uy/callback` (o la URI principal registrada en Mercado Libre DevCenter).
   - `FRONTEND_URL` / `PUBLIC_SITE_URL`: fijar en `https://collectibles.com.uy`.
   - `ADMIN_EMAIL`: fijar en `collectiblesuy@gmail.com` (o `info@collectibles.com.uy` una vez activo el reenvío permanente).
3. **Cloudflare Worker Variables (`cloudflare/collectibles-catalog-api/wrangler.toml:19`):**
   - `ALLOWED_ORIGINS`: cambiar de `"https://collectibles.uy,https://www.collectibles.uy,http://localhost:5173,http://localhost:3000"` a `"https://collectibles.com.uy,https://www.collectibles.com.uy,https://collectibles-ecommerce.vercel.app,http://localhost:5173,http://localhost:3000"`.

### 6.2 Listado Exacto de Archivos de Código con Líneas a Modificar

- **Seguridad, CORS, Proxies y Dominio:**
  - `frontend/src/lib/marketEngine/domainMarketResolver.ts`: líneas `9, 15, 41, 42`
  - `supabase/functions/_shared/cors.ts`: líneas `3-5, 20-23, 37` (+ redespliegue de las 49 funciones en Prod y 10 en Staging)
  - `supabase/functions/meta-capi/index.ts`: líneas `5-7, 20, 88`
  - `supabase/functions/create-test-user/index.ts`: líneas `20, 38`
  - `api/catalog-image.js`: línea `8`
  - `frontend/api/catalog-image.js`: línea `8`
  - `supabase/functions/media-proxy/index.ts`: línea `14`
  - `cloudflare/collectibles-catalog-api/wrangler.toml`: línea `19`
  - `cloudflare/collectibles-catalog-api/src/index.ts`: líneas `161, 168, 1240, 1253-1255, 1298, 1330-1331, 1336, 1341, 1346`
- **Pagos y Checkout:**
  - `supabase/functions/create-payment/index.ts`: líneas `141, 431, 436`
  - `supabase/functions/mercadopago-checkout/index.ts`: línea `9`
  - `supabase/functions/create-handy-payment/index.ts`: líneas `244-246`
  - `supabase/functions/refund-order/index.ts`: líneas `3, 1351`
  - `frontend/src/pages/Checkout.tsx`: líneas `618, 4449, 4741`
- **Correos y Notificaciones:**
  - `supabase/functions/transactional-emails/index.ts`: líneas `13, 192, 210, 216, 240, 267, 289, 309, 330, 439, 470, 501, 516, 546, 549`
  - `supabase/functions/notification-dispatcher/index.ts`: líneas `362, 745, 2472, 2631, 2962, 2992, 3225, 3254`
  - `supabase/functions/_shared/notificationTemplates.ts`: líneas `113, 125, 156, 197, 231, 233, 252, 282, 333, 394, 429, 474, 520, 552, 553, 628, 630, 631, 703, 705, 706, 825, 827, 828, 867, 905, 957, 1078, 1157, 1158, 1194`
  - `supabase/functions/abandoned-carts-cron/index.ts`: líneas `90, 177`
  - `supabase/functions/_shared/alerts.ts`: línea `93`
  - `supabase/functions/mbe-logistics/index.ts`: línea `723`
- **SEO, Feeds y Search Console:**
  - `api/sitemap.js`: líneas `4, 48` *(en PR #50)*
  - `frontend/public/robots.txt`: líneas `46, 47` *(en PR #50)*
  - `frontend/index.html`: líneas `9, 17 (meta verificación Meta), 23, 95, 96, 101, 107, 114, 117, 137, 139, 146` *(parcial en PR #50; conservar `125-126`)*
  - `api/seo-prerender.js`: líneas `6, 715, 1452, 1477, 1482, 1497, 1506` *(conservar `1463-1464`)*
  - `server/lib/seo-helpers.js`: línea `1`
  - `frontend/src/seo/seoConfig.ts`: línea `3`
  - `frontend/src/components/SEO.tsx`: líneas `22, 34, 39, 49, 71, 76, 82, 91, 100` *(conservar `57-58`)*
  - `frontend/api/sitemap.js`: línea `10`
  - `frontend/api/social.js`: línea `21`
  - `supabase/functions/sitemap/index.ts`: línea `12`
  - `api/merchant-feed.js`: líneas `65, 71, 103`
  - `api/meta-catalog.js`: líneas `11, 33`
  - `frontend/api/meta-catalog.js`: líneas `8, 30`
  - `api/gsc-monitor.js`: líneas `13-22, 105, 115, 162`
  - `server/lib/google-search-console.js`: líneas `23, 31`
  - `frontend/src/pages/admin/AdminSeo.tsx`: líneas `52, 121, 122`
  - Páginas con canónicas explícitas: `Shop.tsx:1234,1236,1238,1240`, `DynamicPage.tsx:465`, `VendorStorefront.tsx:671,706`, `AISearchPage.tsx:432`, `ComparePage.tsx:510`, `ImportHubPage.tsx:207`, `RadarFeedPage.tsx:360`, `ReleaseCalendarPage.tsx:72`, `ReleaseDetailPage.tsx:224`, `Home.tsx:1158`
- **Catálogo, IA, Logística UI, Monitoreo, Reglas y Tests:**
  - `frontend/src/lib/exportProductsEngine.ts:79`, `frontend/src/lib/productFieldRegistry.ts:142,150,152,668,685`
  - `frontend/src/components/vendor/VProducts.tsx:1651`, `frontend/src/pages/admin/AdminProducts.tsx:1930`
  - `frontend/src/pages/admin/AdminLogistics.tsx:2202-2204`, `supabase/functions/_shared/skypostal/skypostal-client.ts:123,241,263`
  - `supabase/functions/sourcing-openai-research/index.ts:15,246`, `radarAIEngine.ts:393-394,615`, `radarNewsRefresh.js:34,102`, `sourcingSourceVerifier.js:68,77`
  - `currencyService.ts:148`, `api/currency-sync.js:511,556`
  - `VaultShareCardModal.tsx:141,161,477`, `NotificationCenterPanel.tsx:749`, `EmailRecipientsModal.tsx:207`, `useInternationalMarkets.ts:83`, `AdminCurrencies.tsx:173,212`, `AdminInternationalMarkets.tsx:1242`, `aiAdminService.ts:326`
  - `scripts/check_database_stability.mjs:4` (y scripts activos en `scripts/`)
  - `AGENTS.md:20,23`, `GEMINI.md:20,23`, `.agents/rules/collectibles-production-deploy.md:13,22`, `.agents/skills/collectibles-production-deploy/SKILL.md`
  - Suites de tests: `frontend/src/tests/seo_audit_verification.test.ts`, `tests/seo/seo_audit_verification.test.ts`, `multicountry_block1_reconciliation.test.ts`, `exportProducts.test.ts`, `productQuestionRules.test.ts`, `licensesAndThemes.test.ts`, `legacy_product_resolution.test.ts`, `seo_incident_resilience.test.ts`, `merchant_feed_resilience.test.ts`, `skypostal_*.test.ts` y specs Playwright E2E.

---

## 7. Auditoría de Correos Corporativos y Estrategia Post-Google Workspace (Costo $0)

### 7.1 Diagnóstico de Dependencia Actual

1. **Envío de correos transaccionales y campañas (Outbound):**  
   **NO depende de Google Workspace.** Las Edge Functions (`transactional-emails` y `notification-dispatcher`) utilizan la API HTTP de **Resend** (`https://api.resend.com/emails`), y el formulario público `/contact` utiliza `FormSubmit` hacia `collectiblesuy@gmail.com`.
2. **Notificaciones administrativas:**  
   La tabla `admin_notification_settings` en producción ya envía alertas operativas a **`collectiblesuy@gmail.com`** (excepto los 3 casos hardcodeados en `transactional-emails/index.ts:439,470,501` que apuntan por error a `notificaciones@collectibles.uy`).
3. **Recepción de correos corporativos (Inbound):**  
   Actualmente `collectibles.com.uy` tiene `MX 1 smtp.google.com`. **Cuando finalice el período de prueba de Google Workspace**, Google suspenderá los buzones y cualquier cliente, banco, proveedor o pasarela que escriba o responda a `info@collectibles.com.uy` o `soporte@collectibles.com.uy` (mostrado hoy en el footer de la tienda y en Condiciones de Compra) recibirá rebote `550 No such user`.

### 7.2 Solución Recomendada de Costo $0 (Sin Dependencias Pagas)

Para mantener `info@collectibles.com.uy` y `soporte@collectibles.com.uy` operativos permanentemente sin pagar Google Workspace **y manteniendo Vercel DNS (`ns1/ns2.vercel-dns.com`)**:

1. **Recepción gratuita (Email Forwarding sin cambiar Nameservers de Vercel):**  
   Usar **ImprovMX (Plan Free — $0/mes, hasta 25 alias)** o, si en el futuro se delega DNS a Cloudflare, **Cloudflare Email Routing ($0/mes)**. Con ImprovMX manteniendo Vercel DNS:
   - Al terminar el trial de Google Workspace, reemplazar en Vercel DNS el `MX smtp.google.com` por `mx1.improvmx.com` (pref 10) y `mx2.improvmx.com` (pref 20).
   - Crear los alias `info@collectibles.com.uy` → `collectiblesuy@gmail.com`, `soporte@collectibles.com.uy` → `collectiblesuy@gmail.com` y `notificaciones@collectibles.com.uy` → `collectiblesuy@gmail.com`.
2. **Envío transaccional del ecommerce ($0/mes en tier gratuito de Resend):**  
   - Agregar el dominio `collectibles.com.uy` (o subdominio dedicado `send.collectibles.com.uy`) en **Resend Dashboard > Domains**.
   - Cargar en Vercel DNS los registros TXT/MX de Resend (`resend._domainkey.collectibles.com.uy` y `send`).
3. **Registros SPF y DMARC unificados en Vercel DNS (`collectibles.com.uy`):**
   - `TXT @`: `v=spf1 include:spf.improvmx.com include:amazonses.com ~all` *(o mantener `include:_spf.google.com` mientras dure el trial de Google Workspace)*.
   - `TXT _dmarc`: `v=DMARC1; p=quarantine; rua=mailto:collectiblesuy@gmail.com; adkim=r; aspf=r; pct=100` *(elimina el hueco actual donde `_dmarc` no tiene TXT)*.
4. **Responder desde Gmail como `info@collectibles.com.uy` (Opcional):**  
   En `collectiblesuy@gmail.com` > Configuración > Cuentas e importación > *"Enviar mensaje como"*, usar el servidor SMTP de Resend (`smtp.resend.com`, puerto `465` SSL, usuario `resend`, contraseña = API Key de Resend con permiso de envío). Así los correos manuales salen firmados con DKIM real de `collectibles.com.uy` a costo $0.

---

## 8. Auditoría de Otros Módulos e Integraciones (Sección 15)

| Módulo / Portal | Estado Operativo Real Verificado | Impacto de Dominio Detectado |
|---|---|---|
| **Catálogo Público y Búsqueda** | Operativo (`HTTP 200`, 1.209 resultados para `"funko"` en `/api/public-catalog`) | Funciona en `collectibles.com.uy` por ruta relativa `/api/public-catalog`; D1 directo bloqueado por CORS hasta actualizar Worker |
| **Panel Administrativo (`/admin`)** | Operativo en SPA (`HTTP 200`, protegido por `ProtectedRoute requireAdmin`) | Links de alertas admin en emails/push apuntan a `collectibles.uy/admin/*`; login Google roto hasta corregir Supabase `SITE_URL` |
| **Marketplace / Panel de Vendors (`/vendor`)** | Desactivado públicamente (`marketplace_enabled = 'false'` en `site_settings`), rutas SPA activas | Links de invitación usan `window.location.origin` (`OK`), pero emails de notificación y OAuth ML requieren migración a `.com.uy` |
| **Panel de Afiliados (`/affiliate`)** | Ruta activa; generador de referidos (`AffiliateDashboard.tsx:85`) usa `window.location.origin` | Links en notificaciones (`notificationTemplates.ts:957`) apuntan a `https://collectibles.uy/affiliate?tab=overview` |
| **Panel de Artistas (`/artist`)** | Ruta activa en SPA (`PortalLayout type="artist"`) | Sin URLs hardcodeadas a `collectibles.uy` (`VERIFIED_OK`) |
| **Star2Fan (`/star2fan`)** | Ruta activa; soporte usa `soporte@star2fan.app` (`S2FSupport.tsx:102`) | Sin dependencia de `collectibles.uy` (`VERIFIED_OK`) |
| **Portales Internacionales (`AR`, `CL`, `PE`, `CO`, `EC`, `BR`, `MX`)** | En `public.international_markets`, **solo `UY` está `LIVE` (`checkout_enabled: true`)**; `AR`, `BR`, `MX` están `DISABLED` y `CL`, `PE`, `CO`, `EC` en `PREVIEW` (`checkout_enabled: false`) | `DeblexAuth.tsx` usa `window.location.origin`; `domainMarketResolver.ts` requiere registrar `collectibles.com.uy` como `UY` `PRODUCTION_OFFICIAL` |
| **SoyDelivery / DAC / UES / Distrilogic** | SoyDelivery y DAC activos en `shipping_providers` (llamadas server-to-server desde Edge Functions); UES inactivo; Distrilogic en modo test sin webhook | No dependen del dominio frontend, salvo el texto informativo en `AdminLogistics.tsx:2203` |
| **WhatsApp & Chatbot Soporte (`/api/support-chat`)** | `whatsapp_numbers` configurados en BD pero `notification_logs` registra `pending provider connection`; `/api/support-chat` operativo en ruta relativa | Links incluidos en mensajes de WhatsApp (`notificationTemplates.ts`) apuntan a `https://collectibles.uy/...` |
| **Imágenes y Storage (Supabase / Cloudinary)** | **No se usa Cloudinary**; assets servidos desde `cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/...` | `VERIFIED_OK` en Storage, excepto 2 filas de prueba en `product_images` y el proxy `/catalog-images/*` en feeds |
| **Códigos QR de Etiquetas** | `ShipmentLabelModal.tsx:709` y `VendorLabelPreviewModal.tsx` codifican `PICK-<suborder>` / tracking | No codifican URLs de `collectibles.uy` (`VERIFIED_OK`) |

---

## 9. Pruebas Funcionales Ejecutadas y Pendientes (Sección 16)

### 9.1 Pruebas No Destructivas Ejecutadas en Vivo

| # | Prueba Ejecutada | Destino / Método | Resultado Esperado | Resultado Obtenido | Estado |
|---:|---|---|---|---|---|
| 1 | Disponibilidad Home HTTPS | `GET https://collectibles.com.uy/` | `HTTP 200` + HSTS | `HTTP 200`, `HSTS max-age=63072000`, `Server: Vercel` | `VERIFIED_OK` |
| 2 | Redirección WWW nuevo | `GET https://www.collectibles.com.uy/` | `301/308` a apex `.com.uy` | `HTTP 308` → `https://collectibles.com.uy/` | `VERIFIED_OK` |
| 3 | Certificado SSL apex y WWW | Handshake TLS `:443` | Cert válido no vencido | Let's Encrypt válido hasta `24/02/2027` en ambos | `VERIFIED_OK` |
| 4 | Dominio respaldo Vercel | `GET https://collectibles-ecommerce.vercel.app` | `HTTP 200` | `HTTP 200 OK` | `VERIFIED_OK` |
| 5 | Catálogo y Búsqueda API | `GET /api/public-catalog?q=funko&limit=2` | `HTTP 200` JSON con stock | `HTTP 200`, `count=1209`, slug válido devuelto | `VERIFIED_OK` |
| 6 | Navegación SPA pública | `GET /shop`, `/producto/...`, `/categoria/...`, `/marca/funko`, `/contact`, `/page/terminos` | `HTTP 200` | Todas responden `HTTP 200 text/html` | `VERIFIED_OK` |
| 7 | Acceso rutas de paneles SPA | `GET /login`, `/register`, `/admin`, `/vendor`, `/artist`, `/affiliate`, `/star2fan` | `HTTP 200` (shell SPA protegido por guardas) | Todas responden `HTTP 200 text/html` | `VERIFIED_OK` |
| 8 | Redirecciones internas legacy | `GET /product/test-slug`, `/brand/funko`, `/terms` | `HTTP 308` a ruta nueva | `HTTP 308` a `/producto/...`, `/marca/...`, `/page/terminos` | `VERIFIED_OK` |
| 9 | Bloqueo basura WordPress y 404 | `GET /wp-login.php` y `/ruta-inexistente-auditoria-404` | `410 Gone` en WP; SPA en 404 | `/wp-login.php` → `HTTP 410`; ruta SPA desconocida → `HTTP 200` (nota SEO menor: evaluar componente `<Route path="*">` con `noindex` en `App.tsx`) | `VERIFIED_OK` |
| 10 | HTML inicial y JSON-LD en vivo | `GET https://collectibles.com.uy/` | URLs en `collectibles.com.uy` | Emite `og:url` y JSON-LD en `https://collectibles.uy` (PR #50 no mergeado) | `TEST_FAILED` |
| 11 | Sitemaps XML en vivo | `GET /sitemap.xml`, `/sitemap_index.xml`, `/sitemap-products.xml` | `<loc>https://collectibles.com.uy/...</loc>` | Emiten `<loc>https://collectibles.uy/...</loc>` | `TEST_FAILED` |
| 12 | Prerender Bot SEO (`Googlebot`) | `GET https://collectibles.com.uy/shop` (`UA: Googlebot`) | Canonical `collectibles.com.uy` | Emite `<link rel="canonical" href="https://collectibles.uy/shop" />` | `TEST_FAILED` |
| 13 | Google Merchant Feed en vivo | `GET https://collectibles.com.uy/merchant-feed.xml` | `<link>https://collectibles.com.uy</link>` | Emite `<link>https://collectibles.uy</link>` e imágenes proxy rotas | `TEST_FAILED` |
| 14 | Meta Catalog CSV en vivo | `GET https://collectibles.com.uy/meta-catalog.csv` | Links en `collectibles.com.uy` | Emite `link` e `image_link` en `https://collectibles.uy` | `TEST_FAILED` |
| 15 | CORS Edge Functions (`create-order`, `create-payment`, `mercadopago-checkout`, `mercadolibre-auth`, `meta-capi`) | `OPTIONS` con `Origin: https://collectibles.com.uy` | `ACAO: https://collectibles.com.uy` | Devuelve `ACAO: https://collectibles-ecommerce.vercel.app` (y `https://collectibles.uy` en `meta-capi`) — **bloqueado en navegador** | `TEST_FAILED` |
| 16 | CORS Cloudflare Worker D1 | `OPTIONS` a `workers.dev` con `Origin: https://collectibles.com.uy` | `ACAO: https://collectibles.com.uy` | Devuelve `ACAO: https://collectibles.uy` — **bloqueado** | `TEST_FAILED` |
| 17 | Supabase Google OAuth Redirect | `GET /auth/v1/authorize?provider=google&redirect_to=https://collectibles.com.uy/auth/callback` (sin seguir redirect) | `referrer = https://collectibles.com.uy/auth/callback` | Rechaza `redirect_to` y cae a `SITE_URL = http://localhost:3000` | `TEST_FAILED` |

### 9.2 Pruebas Pendientes (Para Ejecutar en Fase 2 Post-Remediación)

1. Login completo con Google OAuth en `https://collectibles.com.uy/login` verificando retorno autenticado a `https://collectibles.com.uy/`.
2. Envío y clic de Magic Link (`signInWithOtp`) y creación de usuario de prueba (`signUp`) con cuenta de test autorizada.
3. Recuperación de contraseña en `/deblex` con cuenta de test autorizada.
4. Creación de orden y checkout en modo **Sandbox** (Mercado Pago `TEST-*`) desde `https://collectibles.com.uy/checkout` verificando `back_urls` hacia `https://collectibles.com.uy/checkout/success`.
5. Simulación firmada de webhook en Staging (`csnudufkpfzveoonjumy`).
6. Envío de correo de prueba desde Admin > Notificaciones verificando cabecera `From`, `DKIM=pass`, `SPF=pass`, `DMARC=pass` y links internos en `.com.uy`.
7. Verificación en Meta Events Manager (Test Events) de recepción dual Browser Pixel + Server CAPI con mismo `event_id` y `event_source_url = https://collectibles.com.uy/...`.
8. Prueba de suscripción Web Push OneSignal en desktop y mobile sobre `https://collectibles.com.uy`.

---

## 10. Instrucciones Manuales Paso a Paso para Servicios Externos

### 10.1 Supabase Dashboard (Producción `cobtsgkwcftvexaarwmo` y Staging `csnudufkpfzveoonjumy`)
1. Ir a **Authentication → URL Configuration**:
   - **Site URL:** establecer `https://collectibles.com.uy` (actualmente está en `http://localhost:3000`).
   - **Redirect URLs:** eliminar cualquier entrada de `collectibles.uy` o `www.collectibles.uy`. Autorizar explícitamente sin comodines innecesarios:
     - `https://collectibles.com.uy/`
     - `https://www.collectibles.com.uy/`
     - `https://collectibles.com.uy/auth/callback`
     - `https://collectibles.com.uy/callback`
     - `https://collectibles.com.uy/deblex`
     - `https://collectibles-ecommerce.vercel.app/`
     - *(Solo en Staging agregar `http://localhost:5173/` y `http://localhost:3000/`)*.
2. Ir a **Authentication → Email Templates** y **Project Settings → Auth → SMTP Settings**: confirmar que el remitente y enlaces usen `{{ .SiteURL }}` (que ya resolverá a `https://collectibles.com.uy`) y ningún texto/email cite `collectibles.uy`.
3. Ir a **Edge Functions → Secrets**: una vez verificado Resend, configurar `RESEND_FROM=Collectibles <notificaciones@collectibles.com.uy>`, `PUBLIC_SITE_URL=https://collectibles.com.uy` y `MERCADOLIBRE_REDIRECT_URI=https://collectibles.com.uy/callback`.

### 10.2 Google Cloud Console (OAuth 2.0)
1. En **APIs & Services → Credentials**, abrir el OAuth 2.0 Client ID `836776591370-4p755d7c8cjd6p93tvqp8bum7jc1u5p9.apps.googleusercontent.com`:
   - **Authorized JavaScript origins:** agregar `https://collectibles.com.uy` y `https://www.collectibles.com.uy`; eliminar `https://collectibles.uy` y `https://www.collectibles.uy`.
   - **Authorized redirect URIs:** **CONSERVAR INTACTO** `https://cobtsgkwcftvexaarwmo.supabase.co/auth/v1/callback` (y el de Staging si comparte cliente). Si existiera alguna URI directa hacia `https://collectibles.uy/...`, eliminarla.
2. En **APIs & Services → OAuth consent screen**:
   - **Application home page:** `https://collectibles.com.uy`
   - **Application privacy policy link:** `https://collectibles.com.uy/page/pol-ticas-de-privacidad`
   - **Application terms of service link:** `https://collectibles.com.uy/page/terminos`
   - **Authorized domains:** agregar `collectibles.com.uy`, conservar `supabase.co`, y eliminar `collectibles.uy` una vez actualizados los links anteriores.

### 10.3 Mercado Libre DevCenter, Mercado Pago y dLocal Go
1. **Mercado Libre DevCenter** (App `2640840034755802`):
   - En **Redirect URI**, agregar `https://collectibles.com.uy/callback`, `https://collectibles.com.uy/auth/callback` y `https://collectibles.com.uy/vendor/ml/callback`; eliminar las equivalentes de `collectibles.uy`.
   - En **Notifications Callback URL**, verificar que siga apuntando a `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-webhook`.
2. **Mercado Pago Developers**: verificar en la aplicación de producción que Webhooks/IPN apunten exclusivamente a `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadopago-webhook`.
3. **dLocal Go Panel**: verificar en Settings > Webhooks que no quede configurada ninguna URL hacia `collectibles.uy`.

### 10.4 Meta Business Manager, Commerce Manager y Google (GA4, GSC, Merchant, Ads)
1. **Meta Business Settings → Brand Safety and Suitability → Domains:** agregar y verificar `collectibles.com.uy` (preferiblemente por registro DNS `TXT` en Vercel DNS) y vincularlo a la cuenta publicitaria/página.
2. **Meta Events Manager → Data Sources (Pixel `1623445247816011`):** conservar el mismo Pixel ID. Si tiene activa una *Allow List* de dominios en *Traffic Permissions*, agregar `collectibles.com.uy` y `www.collectibles.com.uy` y bloquear `collectibles.uy`.
3. **Meta Commerce Manager → Catalog → Data Sources:** cambiar la URL programada del feed CSV de `https://collectibles.uy/meta-catalog.csv` a `https://collectibles.com.uy/meta-catalog.csv` (después de desplegar el fix de `api/meta-catalog.js`). Revisar todas las campañas activas en Meta Ads para sustituir landing pages `collectibles.uy` por `collectibles.com.uy`.
4. **Google Analytics 4 (`G-JGVY58K11H`):** en *Admin → Data Streams*, editar el Web Stream existente cambiando *Website URL* a `https://collectibles.com.uy` (conservando todo el historial). En *Configure tag settings → List unwanted referrals*, verificar inclusión de `collectibles.com.uy`, `mercadopago.com.uy`, `dlocalgo.com`, `handy.uy`, `paypal.com`.
5. **Google Search Console:** la verificación DNS TXT ya existe en `collectibles.com.uy`. Una vez desplegado el fix SEO, enviar `https://collectibles.com.uy/sitemap.xml` en la propiedad de `collectibles.com.uy` y otorgar permiso de lectura a la Service Account usada por `/api/gsc-monitor`. **NO usar la herramienta Change of Address desde `collectibles.uy`.**
6. **Google Merchant Center & Google Ads:** reclamar/verificar `https://collectibles.com.uy`, actualizar la URL de extracción de `/merchant-feed.xml` a `https://collectibles.com.uy/merchant-feed.xml` y actualizar URLs finales de anuncios activos.
7. **OneSignal Dashboard:** en *Settings → All Browsers*, actualizar `Site URL` de `https://collectibles.uy` a `https://collectibles.com.uy`.

### 10.5 Resend y DNS de Correo (`collectibles.com.uy`)
1. En **Resend Dashboard → Domains**, registrar `collectibles.com.uy` y copiar los registros `DKIM` (`resend._domainkey`) y `SPF`/`MX` de envío (`send.collectibles.com.uy`) a **Vercel DNS**.
2. En **Vercel DNS (`collectibles.com.uy`)**, agregar el registro `TXT` para `_dmarc` (`v=DMARC1; p=quarantine; rua=mailto:collectiblesuy@gmail.com; pct=100`).
3. Antes del vencimiento del trial de Google Workspace, activar ImprovMX (o Cloudflare Email Routing) hacia `collectiblesuy@gmail.com` según la Sección 7.2.

### 10.6 Procedimiento Seguro y Reversible para Desvincular `collectibles.uy` de Vercel
1. **Pre-condición:** haber desplegado el código migrado en `collectibles.com.uy` y verificado que `https://collectibles.com.uy` está marcado como *Production Domain* principal en `Vercel → collectibles-ecommerce → Settings → Domains`, con `www.collectibles.com.uy` redirigiendo `308` a `collectibles.com.uy`.
2. **Respaldo documental previo:** tomar captura/registro de la vista `Settings → Domains` y de cualquier registro en `Vercel DNS` asociado a `collectibles.uy` (si aún figurara una zona antigua en la cuenta de Vercel).
3. **Ejecución:** en `Project → collectibles-ecommerce → Settings → Domains`, eliminar `www.collectibles.uy` y `collectibles.uy` del proyecto. Esto impide que el tercero pueda apuntar registros `A/CNAME` hacia Vercel y servir el proyecto de Collectibles bajo su dominio.
4. **Reversibilidad:** si en el futuro Collectibles recupera legalmente la titularidad de `collectibles.uy` en el registrador NIC.uy (`seciu.edu.uy` / Antel), bastará con volver a delegar sus nameservers a `ns1/ns2.vercel-dns.com`, agregar `collectibles.uy` y `www.collectibles.uy` en `Settings → Domains` configurados exclusivamente como **Redirect `308` permanente → `https://collectibles.com.uy`**.

---

## 11. Plan de Implementación Recomendado (Por Fases) y Plan de Rollback

### 11.1 Plan de Implementación (Tras Aprobación de este Informe)

- **Fase A — Configuración Crítica de Auth y Correo Transaccional (Sin Downtime):**
  1. Configurar y verificar `collectibles.com.uy` en Resend + agregar registro `_dmarc` TXT en Vercel DNS.
  2. Corregir en Supabase Dashboard (`cobtsgkwcftvexaarwmo` y `csnudufkpfzveoonjumy`) `Site URL = https://collectibles.com.uy` y `Redirect URLs` autorizados (removiendo `collectibles.uy`).
  3. Actualizar Google Cloud Console OAuth Consent Screen y JS Origins (conservando el callback `supabase.co/auth/v1/callback`).
- **Fase B — Consolidación de Código y Tests en Rama Unificada (Evolución del PR #50):**
  1. Sobre `fix/domain-migration-com-uy` (o rama limpia desde `main`), aplicar las correcciones de `_shared/cors.ts`, `meta-capi`, `domainMarketResolver.ts`, `catalog-image.js`, `media-proxy`, `create-payment`, `mercadopago-checkout`, `create-handy-payment`, `transactional-emails`, `notification-dispatcher`, `notificationTemplates.ts`, `abandoned-carts-cron`, `api/seo-prerender.js`, `SEO.tsx`, `seoConfig.ts`, `api/merchant-feed.js`, `api/meta-catalog.js`, páginas SPA, `check_database_stability.mjs`, reglas del workspace y las 27 suites de tests.
  2. Ejecutar validación local completa: `npm test` (Vitest) y `npm --prefix frontend run build`.
- **Fase C — Certificación en Staging y Despliegue de Edge Functions + Base de Datos:**
  1. Desplegar Edge Functions en Staging (`csnudufkpfzveoonjumy`) y validar CORS/Auth/Pagos sandbox.
  2. Actualizar secretos (`RESEND_FROM`, `PUBLIC_SITE_URL`, `MERCADOLIBRE_REDIRECT_URI`) y redesplegar las Edge Functions afectadas en Producción (`cobtsgkwcftvexaarwmo`).
  3. Ejecutar actualizaciones puntuales y auditadas en BD Prod: `public.banners` (3 filas a rutas relativas), `public.payment_providers` Handy (`site_url: https://collectibles.com.uy`), desactivar producto de prueba `7f1e43d9-...` y limpiar el segundo Pixel duplicado en `site_settings.appearance_head_code`.
  4. Actualizar y desplegar Cloudflare Worker `collectibles-catalog-api` (`ALLOWED_ORIGINS` y feeds).
- **Fase D — Merge a `main`, Deploy Vercel, Paneles Externos y Desvinculación de `collectibles.uy`:**
  1. Hacer merge a `main` y verificar deploy en `https://collectibles.com.uy` (HTML, sitemaps, prerender Googlebot, feeds, CORS, Google Login, checkout sandbox).
  2. Actualizar URLs de feeds y configuración en Meta Commerce/Business Manager, Google Merchant Center, GSC, GA4, Mercado Libre DevCenter y OneSignal.
  3. Desvincular `collectibles.uy` y `www.collectibles.uy` del proyecto Vercel.

### 11.2 Plan de Rollback

- **Código Frontend y Serverless Vercel:** revert inmediato del commit mergeado en GitHub o *Instant Rollback* en Vercel al deployment previo en menos de 30 segundos.
- **Supabase Edge Functions:** redeploy inmediato desde el commit anterior de `main` mediante CLI/MCP; para `RESEND_FROM`, si hubiera cualquier incidencia de verificación DNS en Resend, puede revertirse temporalmente el secret a un remitente verificado mientras se corrige el registro TXT.
- **Base de Datos (`banners`, `payment_providers`, `site_settings`):** respaldar en un archivo JSON de auditoría local los 5 registros exactos antes de ejecutar el `UPDATE` para restaurarlos con una sentencia `UPDATE` inversa inmediata si fuera necesario.
- **Supabase Auth URL Configuration:** anotar los valores previos antes de guardar cambios; el cambio en Dashboard aplica en caliente sin reinicio de base de datos.

---

## 12. Criterios de Aceptación para Declarar la Migración Completada

La migración a `https://collectibles.com.uy` **solo podrá certificarse como `PRODUCTION_READY`** cuando se cumplan simultáneamente estos 12 criterios verificables:

1. `OPTIONS` preflight desde `Origin: https://collectibles.com.uy` y `https://www.collectibles.com.uy` contra `create-order`, `create-payment`, `mercadopago-checkout`, `mercadolibre-auth`, `meta-capi` y Cloudflare Worker devuelve `Access-Control-Allow-Origin` coincidente con el nuevo dominio, y **rechaza** `Origin: https://collectibles.uy`.
2. `classifyHost('collectibles.com.uy')` y `classifyHost('www.collectibles.com.uy')` devuelven `PRODUCTION_OFFICIAL` con `canCheckoutOnDomain: true`, y `classifyHost('collectibles.uy')` devuelve `UNTRUSTED_UNKNOWN` con `canCheckoutOnDomain: false`.
3. `GET /auth/v1/authorize?provider=google&redirect_to=https://collectibles.com.uy/` registra `referrer = https://collectibles.com.uy/` (nunca `localhost:3000` ni `collectibles.uy`), y el login con Google + Magic Link funcionan de punta a punta.
4. Ningún código, variable ni template envía correos o alertas administrativas a `@collectibles.uy`; `RESEND_FROM` envía desde `@collectibles.com.uy` con `SPF=pass`, `DKIM=pass` y `_dmarc` válido.
5. `0` banners activos, `0` productos publicados y `0` pasarelas (`payment_providers`) en `cobtsgkwcftvexaarwmo` contienen `collectibles.uy`.
6. `https://collectibles.com.uy/`, `/robots.txt`, `/sitemap.xml`, `/sitemap_index.xml`, `/merchant-feed.xml`, `/meta-catalog.csv` y el prerender para `Googlebot` / `WhatsApp` emiten exclusivamente URLs en `https://collectibles.com.uy` (conservando únicamente `instagram.com/collectibles.uy` y `facebook.com/collectibles.uy`).
7. `/api/catalog-image` y `media-proxy` bloquean `collectibles.uy` (`403`) y permiten `collectibles.com.uy`.
8. Checkout de prueba en sandbox (Mercado Pago / Handy) retorna exitosamente a `https://collectibles.com.uy/checkout/success`.
9. Las suites `Vitest` y `npm --prefix frontend run build` pasan al 100% sin errores, y el workflow horario `.github/workflows/database-stability.yml` queda en verde contra `https://collectibles.com.uy`.
10. `collectibles.uy` y `www.collectibles.uy` han sido desvinculados de `Vercel → Project Settings → Domains`.
11. El reenvío entrante gratuito (`info@collectibles.com.uy` / `soporte@collectibles.com.uy` → `collectiblesuy@gmail.com`) está probado antes del fin del trial de Google Workspace.
12. Todos los paneles externos marcados hoy como `NOT_VERIFIED` cuentan con confirmación explícita de revisión manual.

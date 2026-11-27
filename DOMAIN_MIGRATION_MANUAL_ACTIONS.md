# COLLECTIBLES 2026 — GUÍA DE ACCIONES MANUALES EN CONSOLAS EXTERNAS

Este documento detalla las configuraciones exactas que el propietario/administrador debe ejecutar o verificar en paneles externos donde el agente no posee acceso directo de escritura o cuyas credenciales administrativas pertenecen exclusivamente al titular.

> [!CAUTION]
> **Regla de Oro:** En ningún panel externo debe conservarse `http://collectibles.uy`, `https://collectibles.uy`, `https://www.collectibles.uy` ni comodines abiertos (`*`) que permitan redirigir tokens, pagos o correos al dominio anterior.

---

## 1. Supabase Dashboard — Autenticación y Secretos (`cobtsgkwcftvexaarwmo` y `csnudufkpfzveoonjumy`)

### 1.1 Authentication → URL Configuration (Producción `cobtsgkwcftvexaarwmo` — **CRÍTICO BLOQUEANTE DE LOGIN**)
Actualmente en Producción `SITE_URL` vale `http://localhost:3000`, impidiendo Google OAuth, Magic Links y recuperación de contraseña.
1. Ir a **Supabase Dashboard → Project `cobtsgkwcftvexaarwmo` → Authentication → URL Configuration**.
2. Configurar **Site URL**:
   ```text
   https://collectibles.com.uy
   ```
3. En **Redirect URLs**, eliminar cualquier entrada que contenga `collectibles.uy` o `localhost` y registrar exactamente las rutas utilizadas por la aplicación (sin comodines innecesarios):
   ```text
   https://collectibles.com.uy/
   https://collectibles.com.uy/login
   https://collectibles.com.uy/login?mode=reset
   https://collectibles.com.uy/account
   https://collectibles.com.uy/callback
   https://collectibles.com.uy/auth/callback
   https://collectibles.com.uy/vendor/ml/callback
   https://www.collectibles.com.uy/
   https://www.collectibles.com.uy/login
   https://www.collectibles.com.uy/login?mode=reset
   https://collectibles-ecommerce.vercel.app/
   https://collectibles-ecommerce.vercel.app/login
   https://collectibles-ecommerce.vercel.app/login?mode=reset
   ```
4. En **Staging (`csnudufkpfzveoonjumy` → Authentication → URL Configuration)**:
   - Configurar `Site URL = https://collectibles-ecommerce.vercel.app` y agregar `http://localhost:5173/`, `http://localhost:5173/login`, `http://localhost:5173/login?mode=reset` únicamente en Staging.

### 1.2 Authentication → Email Templates & SMTP Settings (`cobtsgkwcftvexaarwmo`)
1. Ir a **Authentication → Email Templates** (*Confirm signup*, *Invite user*, *Magic Link*, *Change Email Address*, *Reset Password*).
2. Verificar que las plantillas utilicen `{{ .SiteURL }}` o `{{ .ConfirmationURL }}` y **no contengan enlaces ni textos fijos a `collectibles.uy`**.
3. Ir a **Project Settings → Authentication → SMTP Settings**:
   - Si Custom SMTP está activo, verificar que **Sender email** NO sea `@collectibles.uy`. Usar el remitente verificado en Resend (una vez completada la Sección 3 de esta guía).

### 1.3 Edge Functions → Secrets (`cobtsgkwcftvexaarwmo`)
Ir a **Edge Functions → Secrets** y verificar/definir (sin exponer claves):
- `PUBLIC_SITE_URL` = `https://collectibles.com.uy`
- `FRONTEND_URL` = `https://collectibles.com.uy`
- `ADMIN_EMAIL` = `collectiblesuy@gmail.com`
- `RESEND_REPLY_TO` = `info@collectibles.com.uy`
- `MERCADOLIBRE_REDIRECT_URI` = `https://collectibles.com.uy/callback`
- `RESEND_FROM`:
  - **ANTES de verificar `collectibles.com.uy` en Resend:** mantener el remitente temporal verificado actual en Resend (nunca `@collectibles.uy`). Si no hay dominio verificado aún, nuestra guardia `_shared/email-guard.ts` detendrá de forma segura el envío registrando `provider_unavailable` sin perder el evento ni enviar nada a `@collectibles.uy`.
  - **SOLO DESPUÉS de que Resend muestre `Verified` para `collectibles.com.uy`:** actualizar `RESEND_FROM` a `Collectibles <notificaciones@collectibles.com.uy>`.

---

## 2. Google Cloud Console — Google OAuth (`AUD-036`)

1. Ingresar a **Google Cloud Console → APIs & Services → Credentials**.
2. Abrir el OAuth 2.0 Client ID:
   `836776591370-4p755d7c8cjd6p93tvqp8bum7jc1u5p9.apps.googleusercontent.com`
3. En **Authorized JavaScript origins**:
   - **ELIMINAR:** `https://collectibles.uy` y `https://www.collectibles.uy`
   - **AGREGAR:** `https://collectibles.com.uy`, `https://www.collectibles.com.uy` y `https://collectibles-ecommerce.vercel.app`
4. En **Authorized redirect URIs**:
   - **CONSERVAR OBLIGATORIAMENTE:** `https://cobtsgkwcftvexaarwmo.supabase.co/auth/v1/callback` *(y `https://csnudufkpfzveoonjumy.supabase.co/auth/v1/callback` si comparte cliente con Staging)*.
   - **ELIMINAR** cualquier URI directa bajo `collectibles.uy`.
5. Ir a **APIs & Services → OAuth consent screen**:
   - **Application home page:** `https://collectibles.com.uy`
   - **Application privacy policy link:** `https://collectibles.com.uy/page/pol-ticas-de-privacidad`
   - **Application terms of service link:** `https://collectibles.com.uy/page/terminos`
   - **Authorized domains:** agregar `collectibles.com.uy` y `supabase.co`; eliminar `collectibles.uy`.

---

## 3. DNS de `collectibles.com.uy` (Vercel DNS), Resend y Continuidad de `info@collectibles.com.uy`

> [!IMPORTANT]
> **Preservar recepción actual en Google Workspace:** NO eliminar ni alterar el registro raíz `MX` (`smtp.google.com`) mientras la prueba temporal de Google Workspace siga activa recibiendo correos en `info@collectibles.com.uy`.

1. **Verificar `collectibles.com.uy` en Resend (Envío Transaccional):**
   - En **Resend Dashboard → Domains → Add Domain**, agregar `collectibles.com.uy` (o subdominio dedicado `send.collectibles.com.uy`).
   - Cargar en **Vercel Dashboard → Domains → `collectibles.com.uy` → DNS Records**:
     - El registro `TXT` DKIM (`resend._domainkey.collectibles.com.uy`).
     - Los registros `MX` y `TXT` SPF del subdominio de rebote (`send.collectibles.com.uy` → `feedback-smtp...amazonses.com`), **lo cual NO toca el `MX` raíz de Google Workspace**.
     - En el registro `TXT` SPF raíz (`@`), unificar sin duplicar `v=spf1`:
       ```text
       v=spf1 include:_spf.google.com include:amazonses.com ~all
       ```
2. **Publicar registro DMARC inicial en modo monitoreo (`p=none`):**
   - Agregar registro `TXT` en `_dmarc.collectibles.com.uy`:
     ```text
     v=DMARC1; p=none; rua=mailto:collectiblesuy@gmail.com; adkim=r; aspf=r;
     ```
   - *(Esto sobrescribe la respuesta wildcard `A` en `_dmarc.collectibles.com.uy` sin bloquear entregas legítimas).*
3. **Plan de transición antes del vencimiento del trial de Google Workspace (`info@collectibles.com.uy`):**
   - Antes de que expire la prueba de Google Workspace, configurar un servicio gratuito de reenvío entrante (**ImprovMX** gratuito manteniendo DNS en Vercel, o **Cloudflare Email Routing**) para reenviar `*@collectibles.com.uy` (`info@`, `soporte@`, `notificaciones@`) hacia `collectiblesuy@gmail.com`, cambiando recién en ese momento los registros `MX` raíz.

---

## 4. Vercel Dashboard (`collectibles-ecommerce` — ID `prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`)

1. Ir a **Vercel → `collectibles-ecommerce` → Settings → Environment Variables**:
   - Revisar todas las variables en `Production`, `Preview` y `Development` (`SITE_URL`, `PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `VITE_SITE_URL`, `VITE_ML_REDIRECT_URI`).
   - Reemplazar cualquier valor que contenga `collectibles.uy` por `https://collectibles.com.uy` (y `https://collectibles.com.uy/callback` para `VITE_ML_REDIRECT_URI` si estuviera definida).
2. Ir a **Vercel → `collectibles-ecommerce` → Settings → Domains**:
   - Confirmar que `collectibles.com.uy` sea el dominio principal (`Primary`) y que `www.collectibles.com.uy` redirija (`308 Permanent Redirect`) hacia `https://collectibles.com.uy`.
   - **DESVINCULAR `collectibles.uy` y `www.collectibles.uy` del proyecto Vercel** una vez desplegada esta remediación en producción. Mantener un dominio controlado por terceros vinculado en Vercel permitiría al tercero apuntar su DNS a Vercel para suplantar o hacer proxy inverso del sitio.

---

## 5. Pasarelas de Pago y Marketplaces

### 5.1 Mercado Pago Developers (`AUD-018`)
1. Ingresar a **Mercado Pago Developers → Tus integraciones → Aplicación de Producción → Webhooks / IPN**.
2. Verificar que la URL configurada globalmente en el panel (si existe) sea exclusivamente:
   `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadopago-webhook`
3. Eliminar cualquier URL histórica de IPN/Webhook que apunte a `collectibles.uy`.

### 5.2 Handy Uruguay (`AUD-008`)
1. En el portal de comercio de Handy (si tiene URL de comercio o webhook configurada en panel), verificar que el dominio del comercio sea `https://collectibles.com.uy` y el webhook sea `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/handy-webhook`.
2. Ejecutar el bloque **A.1** de `supabase/manual_remediation/20261126_domain_migration_com_uy.sql` para actualizar `config.site_url` en `public.payment_providers`.

### 5.3 dLocal Go (`AUD-019`)
- Permanece **DESHABILITADO** (`payments_dlocal_go_enabled = false`), respetando la directriz de no activar módulos apagados. Si en el futuro se habilita, verificar que en el panel dLocal Go no figure `collectibles.uy` y cargar `DLOCALGO_X_LOGIN` + `DLOCALGO_SECRET_KEY` en Supabase Secrets.

### 5.4 Mercado Libre DevCenter (`AUD-022`)
1. Ingresar a **Mercado Libre Developers → Aplicación `2640840034755802`**.
2. En **Redirect URIs**, agregar:
   - `https://collectibles.com.uy/callback`
   - `https://collectibles.com.uy/auth/callback`
   - `https://collectibles.com.uy/vendor/ml/callback`
   y **eliminar** las equivalentes de `collectibles.uy`.
3. Verificar que **Notifications Callback URL** siga apuntando a `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-webhook`.

---

## 6. SEO, Catálogos Comerciales y Analítica

### 6.1 Google Search Console (`AUD-033`)
1. Verificar/abrir la propiedad `collectibles.com.uy` (el TXT `google-site-verification=Z4XaqBqplj63tTWCyo9GM5aSI3MMiAuVHDsvJV57xQQ` ya está publicado en DNS).
2. Agregar como usuario con permisos de lectura/propietario a la Service Account configurada en Vercel (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) para que `/api/gsc-monitor` opere sobre `collectibles.com.uy`.
3. Enviar el sitemap oficial: `https://collectibles.com.uy/sitemap.xml`.
4. **IMPORTANTE:** **NO utilizar la herramienta "Cambio de dirección" (Change of Address)** desde `collectibles.uy` mientras ese dominio esté bajo control de terceros sin redirección `301` legítima.

### 6.2 Google Merchant Center (`AUD-029`)
1. En **Business Info → Website**, reclamar y verificar `https://collectibles.com.uy`.
2. En **Products → Feeds**, actualizar la URL de obtención programada del feed primario a:
   `https://collectibles.com.uy/merchant-feed.xml`
   y forzar **Fetch Now** tras desplegar a producción.

### 6.3 Meta Business Manager, Pixel `1623445247816011` y Catálogo (`AUD-030`, `AUD-032`)
1. **Conservar el Pixel ID `1623445247816011`**.
2. En **Brand Safety and Suitability → Domains → Add**, registrar `collectibles.com.uy` y verificarlo preferentemente vía **registro DNS `TXT` en Vercel** (evitando depender del meta tag antiguo `ef350bebbc47il5yan0fr22rbwupmj` de `frontend/index.html:17`, que correspondía a `collectibles.uy`; una vez verificado por DNS TXT, puede sustituirse o retirarse ese meta tag).
3. En **Events Manager → Pixel `1623445247816011` → Settings → Traffic Permissions**, agregar `collectibles.com.uy` y `www.collectibles.com.uy` a la Allow List y remover/bloquear `collectibles.uy`.
4. En **Commerce Manager → Catalog → Data Sources**, actualizar la URL del feed CSV programado a:
   `https://collectibles.com.uy/meta-catalog.csv`
5. Revisar anuncios activos en **Meta Ads Manager** y **Google Ads** para actualizar las URLs de destino a `https://collectibles.com.uy/...`.
6. Revisar el Bloque **B.2** del archivo SQL propuesto para decidir si se limpia el segundo Pixel duplicado/malformado (`2487606138177497`) en `site_settings.appearance_head_code`.

### 6.4 Google Analytics 4 (`G-JGVY58K11H`), Clarity y OneSignal (`AUD-034`, `AUD-035`)
1. **GA4 (`G-JGVY58K11H` — conservar propiedad actual):** En **Admin → Data Streams → Web Stream**, actualizar **Stream URL** a `https://collectibles.com.uy` y verificar en **Configure tag settings → List unwanted referrals** que estén incluidos `collectibles.com.uy`, `mercadopago.com.uy`, `mercadopago.com`, `handy.uy`, `dlocalgo.com` y `paypal.com`.
2. **OneSignal (`00a0c8cc-6b24-4ad1-9503-2e329ee5c566`):** En **Settings → Web Configuration**, actualizar **Site URL** a `https://collectibles.com.uy`.

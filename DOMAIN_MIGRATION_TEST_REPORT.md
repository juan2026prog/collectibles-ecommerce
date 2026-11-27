# COLLECTIBLES 2026 — INFORME DE PRUEBAS Y CERTIFICACIÓN DE FASE 2

## 1. Resumen Ejecutivo de Verificación

| Suite / Control de Calidad | Entorno | Resultado | Detalle Cuantitativo |
|---|---|---|---|
| **TypeScript Compiler (`tsc --noEmit -p tsconfig.app.json`)** | Local (`frontend/`) | **PASS (`0` errores)** | Validación estricta de tipos en todas las páginas, hooks, servicios y resolvers modificados. |
| **Build de Producción (`vite build`)** | Local (`frontend/`) | **PASS (`0` errores)** | `2,165` módulos transformados en `3.55s`, bundle generado limpiamente en `frontend/dist/`. |
| **Nueva Suite de Seguridad y Pruebas Negativas (`domain_migration_security.test.ts`)** | Local (Vitest v4.1.2) | **PASS (`16/16`)** | Cobertura positiva y negativa de `domainMarketResolver`, `_shared/cors.ts`, `_shared/email-guard.ts`, SSRF `api/catalog-image.js`, Cloudflare Worker CORS, SEO/preservación redes sociales y firmas HMAC de webhooks. |
| **Suites de Regresión Dominio, SEO, Feeds y Exportación (9 archivos)** | Local (Vitest v4.1.2) | **PASS (`162/162`)** | `multicountry_block1_reconciliation`, `seo_audit_verification`, `legacy_product_resolution`, `seo_incident_resilience`, `merchant_feed_resilience`, `exportProducts`, `productQuestionRules`, `licensesAndThemes`, `domain_migration_security`. |
| **Corrida Global del Repositorio (`npx vitest run`)** | Local (178 archivos) | **`1,514` PASS / `0` regresiones propias** | `0` fallos atribuibles a la migración de dominio. Las 17 aserciones fallidas preexistentes en `main` documentadas en Sección 4 corresponden a snapshots antiguos de precios OpenAI (`STALE_PRICING`), mercado AR deshabilitado intencionalmente y tablas ausentes en `.env.local` de Staging. |
| **Certificación HTTP en Vivo sobre Supabase Staging (`csnudufkpfzveoonjumy`)** | Remoto Real (12 Edge Functions) | **PASS (`23/23` checks de contención)** | Preflight `OPTIONS`, bloqueo `403` a `collectibles.uy` y `evil.vercel.app`, bloqueo SSRF `403` a `169.254.169.254` y `/rest/v1/orders`, bloqueo `401` sin firma HMAC en `dlocalgo-webhook`, y descarte seguro de `@collectibles.uy` en `transactional-emails`. |
| **Escaneo de Fugas de Secretos y Dominio Antiguo en Código Activo** | Git Diff / Grep | **PASS (`0` fugas)** | `0` secretos/tokens/keys expuestos; `0` URLs web activas hacia `collectibles.uy` (solo permanecen denylists de seguridad y perfiles legítimos `instagram.com/collectibles.uy` y `facebook.com/collectibles.uy`). |

---

## 2. Detalle de la Suite de Seguridad y Pruebas Negativas (`frontend/src/tests/domain_migration_security.test.ts`)

1. **`domainMarketResolver` (`AUD-005`):**
   - Verifica `collectibles.com.uy` y `www.collectibles.com.uy` → `PRODUCTION_OFFICIAL`, `isAuthorizedHost: true`, `canCheckoutOnDomain: true`.
   - Verifica `collectibles-ecommerce.vercel.app` y previews del proyecto → `PREVIEW_AUTHORIZED`, `canCheckoutOnDomain: true`.
   - Verifica rechazo (`UNTRUSTED_UNKNOWN`, `canCheckoutOnDomain: false`) para `collectibles.uy`, `www.collectibles.uy`, `checkout.collectibles.uy`, `evil-collectibles.com.uy`, `collectibles.com.uy.attacker.com`, `arbitrary-other-project.vercel.app` y `collectibles-ecommerce.evil.vercel.app`.
2. **CORS y Orígenes de Retorno (`_shared/cors.ts` — `AUD-001`, `AUD-002`, `AUD-016`):**
   - Verifica `handleOptions()` devolviendo HTTP `200` con `ACAO: https://collectibles.com.uy` para orígenes oficiales y HTTP `403` **sin cabecera `ACAO`** para `https://collectibles.uy` y `https://attacker.vercel.app`.
   - Verifica que `http://localhost:5173` sea rechazado cuando `SUPABASE_URL` apunta a Producción (`cobtsgkwcftvexaarwmo`) y permitido únicamente en desarrollo/staging (`csnudufkpfzveoonjumy`).
   - Verifica que incluso si alguien inyectara `https://collectibles.uy` en la variable `ALLOWED_ORIGINS`, `isTrustedBrowserOrigin` lo bloquee.
   - Verifica que `resolveTrustedReturnOrigin` neutralice open redirects y retornos hacia `collectibles.uy`.
3. **Guardia de Correo y Notificaciones (`_shared/email-guard.ts` — `AUD-003`, `AUD-004`):**
   - Bloquea destinatarios y remitentes `@collectibles.uy`, `@finanzas.collectibles.uy`, `@collectibles.com`, `@tudominio.com` y `@example.invalid`.
   - Verifica `sanitizeStoredRecipients()` purgando buzones heredados `@collectibles.uy` y aplicando fallback a `collectiblesuy@gmail.com`.
   - Verifica parada segura (`allowed: false`, `from: null`) cuando `RESEND_FROM` no está configurado o usa un dominio bloqueado, y `Reply-To` seguro hacia `info@collectibles.com.uy`.
4. **Guardia SSRF en Proxy de Catálogo (`api/catalog-image.js` — `AUD-006`):**
   - Bloquea `127.0.0.1`, `10.0.0.5`, `172.16.0.1`, `192.168.1.10`, `169.254.169.254` (metadata cloud), `0.0.0.0`, `100.64.0.1`, `::1`, `fc00::1`, `fe80::1`, `::ffff:127.0.0.1` y `::ffff:169.254.169.254`.
   - Bloquea esquema `http://`, `collectibles.uy`, `cdn.collectibles.uy`, credenciales embebidas en URL, bucles recursivos `/catalog-images/` y rutas privadas de Supabase (`/rest/v1/orders`, `/storage/v1/object/authenticated/`).
5. **Cloudflare Worker D1 (`cloudflare/collectibles-catalog-api/src/index.ts` — `AUD-031`):**
   - Rechaza `https://collectibles.uy`, `https://random-tenant.vercel.app` y `http://localhost:5173` en `ENVIRONMENT=production`; autoriza `collectibles.com.uy`, `www.collectibles.com.uy` y previews del proyecto `collectibles-ecommerce`.
6. **SEO, Preservación de Redes Sociales y Firmas HMAC (`AUD-019`, `AUD-024..AUD-027`, `AUD-049`):**
   - Confirma emisión de `https://collectibles.com.uy` en `seoConfig.ts`, `api/seo-prerender.js`, `robots.txt` e `index.html`, preservando intactos `https://instagram.com/collectibles.uy` y `https://facebook.com/collectibles.uy`.
   - Confirma validación HMAC en tiempo constante (`timingSafeEqual`) obligatoria en `dlocalgo-webhook` y `mercadopago-webhook`.

---

## 3. Evidencia de Certificación HTTP en Vivo sobre Supabase Staging (`csnudufkpfzveoonjumy`)

Se desplegaron 12 Edge Functions remediadas en `https://csnudufkpfzveoonjumy.supabase.co/functions/v1` (sin utilizar datos reales de clientes ni ejecutar cobros) y se obtuvieron las siguientes respuestas reales:

| Endpoint en Staging (`csnudufkpfzveoonjumy`) | Prueba Ejecutada | Respuesta HTTP Real | Cabecera `ACAO` | Veredicto |
|---|---|---|---|---|
| `OPTIONS /meta-capi` | `Origin: https://collectibles.com.uy` | `200 OK` | `https://collectibles.com.uy` | **PASS** |
| `OPTIONS /meta-capi` | `Origin: https://www.collectibles.com.uy` | `200 OK` | `https://www.collectibles.com.uy` | **PASS** |
| `OPTIONS /meta-capi` | `Origin: https://collectibles-ecommerce.vercel.app` | `200 OK` | `https://collectibles-ecommerce.vercel.app` | **PASS** |
| `OPTIONS /meta-capi` | `Origin: https://collectibles.uy` | `403 Forbidden` | `null` (omitida) | **PASS** |
| `OPTIONS /meta-capi` | `Origin: https://evil.vercel.app` | `403 Forbidden` | `null` (omitida) | **PASS** |
| `POST /meta-capi` | `Origin: https://collectibles.uy` | `403 Forbidden` | `null` (omitida) | **PASS** |
| `OPTIONS /media-proxy` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `GET /media-proxy` | `?url=https://collectibles.uy/images/logo.png` | `403 Forbidden` | `https://collectibles.com.uy` | **PASS** |
| `GET /media-proxy` | `?url=https://169.254.169.254/latest/meta-data/` | `403 Forbidden` | `null` | **PASS** |
| `GET /media-proxy` | `?url=https://cobtsgkwcftvexaarwmo.supabase.co/rest/v1/orders` | `403 Forbidden` | `https://collectibles.com.uy` | **PASS** |
| `GET /media-proxy` | `?url=.../storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg` | `200 OK` (`image/jpeg`) | `https://collectibles.com.uy` | **PASS** |
| `OPTIONS /transactional-emails` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `POST /transactional-emails` | Orden sintética con `customer_email: synthetic-test@collectibles.uy` | `200` (`{"success":false,"skipped":true,"reason":"invalid_or_untrusted_customer_email"}`) | `https://collectibles.com.uy` | **PASS** |
| `OPTIONS /notification-dispatcher` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `OPTIONS /create-order` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `OPTIONS /create-payment` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `OPTIONS /confirm-payment` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `OPTIONS /create-handy-payment` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `OPTIONS /mercadopago-checkout` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `OPTIONS /mercadolibre-auth` | `Origin: https://collectibles.com.uy` vs `collectibles.uy` | `200` / `403` | `.com.uy` / `null` | **PASS** |
| `POST /dlocalgo-webhook` | Payload JSON sin firma HMAC (`X-Date`/`Authorization`) | `401 Unauthorized` (`{"error":"Missing webhook authentication headers"}`) | `null` | **PASS** |

---

## 4. Notas sobre Tests Ajenos Preexistentes en `main` (No Modificados por Alcance)

Durante la corrida global de los 178 archivos de test se observaron 11 suites ajenas a esta migración con fallos preexistentes en `main` (respetando la restricción de no alterar lógica comercial, precios ni mercados internacionales deshabilitados):
- `ai_openai_part2_certification.test.ts`, `sourcing_intelligence_commercial_engine.test.ts`, `sourcing_master_final_closure.test.ts`: esperan `PRICED` sobre una fecha fija de snapshot OpenAI expirada (`STALE_PRICING`).
- `importhub_regression.test.ts`, `skypostal_multicountry_admin_control.test.ts`, `skypostal_phase4_golive_readiness.test.ts`: esperan `AR = LIVE`, mientras que Argentina fue deshabilitada deliberadamente (`DISABLED`) en el bloque previo de gobernanza multipaís.
- `slugRedirects.test.ts`, `search_regression_audit.test.ts`: consultan tablas en `.env.local` (Staging `csnudufkpfzveoonjumy`) que carecen del catálogo completo de producción.
- `ml_sync_queue_load_controls.test.ts`, `database_stability.test.ts`, `sourcing_live_connectors.test.ts`: sin ningún cambio respecto a `origin/main` (`git diff origin/main` vacío en esos módulos).

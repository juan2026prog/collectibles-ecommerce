# COLLECTIBLES 2026 — REVISIÓN FORENSE DE INCIDENTE DE SEGURIDAD Y EXPOSICIÓN DE DATOS

## 1. Resumen Ejecutivo

- **Incidente auditado:** Pérdida temporal de control administrativo sobre el dominio histórico `collectibles.uy` (actualmente delegado a servidores DNS de terceros `dns1..4.hosted-domains.net`), mientras la plataforma comercial migró a `https://collectibles.com.uy`.
- **Veredicto forense:** **SIN EVIDENCIA DE EXFILTRACIÓN EFECTIVA (`0` exposiciones confirmadas de PII, credenciales o fondos)** durante la ventana de pérdida del dominio `collectibles.uy`.
- **Nivel de riesgo previo a esta remediación:** **CRÍTICO (`P0`)**, dado que si el tercero titular actual de `collectibles.uy` hubiera configurado registros `MX` catch-all o un servidor HTTP/TLS activo antes de la contención, habría podido recibir alertas administrativas de contracargos/reembolsos en `@collectibles.uy` o interceptar retornos de navegación.

---

## 2. Línea de Tiempo y Evidencia Forense Verificada (Solo Lectura en `cobtsgkwcftvexaarwmo`)

| Vector investigado | Fuente de evidencia | Resultado verificado | Conclusión de exposición |
|---|---|---|---|
| **Envío de correos transaccionales a `@collectibles.uy`** | Tabla `public.email_logs` (`cobtsgkwcftvexaarwmo`) | `0` registros históricos enviados a `%collectibles.uy%`; `0` registros emitidos en noviembre de 2026. | **0 fugas confirmadas.** |
| **Alertas y notificaciones (`notification_logs`)** | Tabla `public.notification_logs` (`cobtsgkwcftvexaarwmo`) | Únicamente `4` filas históricas de tipo `test_notification` a buzón enmascarado `@collectibles.uy` con fecha `2026-08-30` (bajo control legítimo previo). **`0` envíos en noviembre de 2026.** | **0 fugas en ventana de incidente.** |
| **Disputas / Contracargos (`admin_chargeback_received`)** | Tabla `public.payment_disputes` | `0` registros totales en toda la historia de la tabla. El trigger de correo a `notificaciones@collectibles.uy` **nunca llegó a dispararse**. | **0 fugas confirmadas.** |
| **Reembolsos fallidos / manuales (`admin_refund_*`)** | Tablas `public.manual_refund_tasks` y `public.refunds` | `0` tareas manuales; `1` único reembolso Mercado Pago completado con éxito el `2026-11-04T01:35:42Z` (sin error ni disparo de alerta de fallo). | **0 fugas confirmadas.** |
| **Órdenes, intentos de pago y carritos abandonados** | Tablas `public.orders`, `public.payment_attempts`, `public.abandoned_checkouts` | Última actividad registrada: `2026-11-13T00:52:55Z`. **`0` órdenes, intentos de pago o correos de recuperación desde el 13 de noviembre de 2026.** | **0 redirecciones post-pago ni correos emitidos durante la ventana reciente.** |
| **Flujos OAuth, Magic Links y Tokens GoTrue** | Tabla `auth.flow_state` (`cobtsgkwcftvexaarwmo`) | Último `referrer = https://collectibles.uy/` registrado el `2026-11-10T19:03:19Z`. Durante las pruebas del `2026-11-26`, `SITE_URL` en GoTrue estaba en `http://localhost:3000` (`code_issued = false`), lo que impidió el login en producción pero **evitó que GoTrue emitiera códigos OAuth o tokens hacia `collectibles.uy`**. | **0 tokens de sesión filtrados al tercero.** |
| **Infraestructura DNS actual de `collectibles.uy`** | Consultas DNS en vivo (`NS`, `A`, `AAAA`, `MX`, `TXT`) | Delegado a `dns1.hosted-domains.net` .. `dns4.hosted-domains.net`. **Sin registros `A`, `AAAA` ni `MX` activos** al momento de la auditoría y remediación (`NXDOMAIN` / respuesta vacía). | Sin receptor de correo ni servidor web activo del tercero durante la ventana auditada. |
| **Webhooks de pasarelas de pago (Mercado Pago, Handy, dLocal Go)** | Código desplegado + `public.payment_providers` | Los `notification_url` / `callback_url` apuntan directamente a `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/*-webhook` (dominio de infraestructura Supabase, independiente de `collectibles.uy`). | **0 webhooks financieros dirigidos a `collectibles.uy`.** |

---

## 3. Controles de Contención Implementados en Fase 2

1. **Bloqueo criptográfico y de dominio saliente de correo (`_shared/email-guard.ts`):**
   - Denegación obligatoria de cualquier destinatario, remitente o `Reply-To` bajo `@collectibles.uy`, `*.collectibles.uy`, `@collectibles.com` y `@tudominio.com`.
   - Redirección de fallback administrativo al buzón estable `collectiblesuy@gmail.com` y `Reply-To` público `info@collectibles.com.uy`.
   - Parada segura (`status = 'provider_unavailable'`, sin simular éxito) cuando `RESEND_FROM` no está configurado o apunta a un dominio no verificado.
2. **Aislamiento estricto CORS y Origen de Retorno (`_shared/cors.ts` + 69 Edge Functions + Cloudflare Worker):**
   - Rechazo explícito con HTTP `403` (sin cabecera `Access-Control-Allow-Origin`) ante `Origin: https://collectibles.uy`, subdominios `*.collectibles.uy` y proyectos arbitrarios `*.vercel.app`.
   - Validación estricta de `return_url` / `back_urls` / `site_url` en `create-payment`, `mercadopago-checkout`, `create-handy-payment` y `dlocalgo-checkout` mediante `resolveTrustedReturnOrigin()`.
3. **Bloqueo de Checkout en Dominios No Confiables (`domainMarketResolver.ts` + `Checkout.tsx`):**
   - `collectibles.uy` y `*.collectibles.uy` quedan clasificados permanentemente como `UNTRUSTED_UNKNOWN` con `canCheckoutOnDomain: false`.
4. **Mitigación SSRF y DNS Rebinding en Proxies de Imágenes (`api/catalog-image.js`, `frontend/api/catalog-image.js`, `media-proxy`):**
   - Eliminación total de `collectibles.uy`, bloqueo de IPs privadas/reservadas/metadata (`169.254.169.254`, RFC1918, IPv6 local/mapeado), validación por salto de redirección (máx. 5) y restricción de Supabase exclusivamente a `/storage/v1/object/public/`.
5. **Eliminación de Secretos en Tests (`postgres_remote_certification.test.ts`):**
   - Removida credencial JWT hardcodeada del archivo de test; protegida tras `ALLOW_REMOTE_DB_CERT === 'true'` y variable de entorno `SUPABASE_SERVICE_ROLE_KEY`. *(Recomendación adicional en Manual Actions: rotar `service_role` key en una ventana programada de mantenimiento si el repositorio tuvo acceso de terceros).*

---

## 4. Acciones Residuales Obligatorias para Cerrar la Superficie Externa

1. **Desvincular `collectibles.uy` y `www.collectibles.uy` del proyecto Vercel (`collectibles-ecommerce`)** inmediatamente después del despliegue a producción, evitando que el tercero pueda apuntar un registro `A`/`CNAME` hacia Vercel para servir la tienda bajo su dominio.
2. **Actualizar `Site URL` y `Redirect URLs` en Supabase Auth Producción (`cobtsgkwcftvexaarwmo`)** eliminando cualquier entrada histórica de `collectibles.uy`.
3. **Ejecutar el Bloque A del SQL quirúrgico** (`supabase/manual_remediation/20261126_domain_migration_com_uy.sql`) para limpiar los 3 banners en `public.banners`, el `site_url` de Handy en `public.payment_providers` y las 2 imágenes de prueba en `public.product_images`.

# COLLECTIBLES 2026 — REPORTE FINAL DE IMPLEMENTACIÓN Y CERTIFICACIÓN P2 + P3 + P4

**Fecha:** 2026-11-19  
**Rama de trabajo:** `fix/p2-p3-p4-production-readiness`  
**Baseline certificado:** `fix/p0-p1-international-hardening` @ `e89cd05` (`main` de referencia: `99a8ab3`)  
**Producción (`https://collectibles.uy` / Supabase `cobtsgkwcftvexaarwmo`):** **INTACTA — 0 modificaciones, 0 migraciones aplicadas, 0 deploys realizados.**  
**Veredicto Global de Liberación a Producción:** **`NO-GO`** *(Bloqueado por Gate 2 — PayPal Sandbox E2E y Gate 3 — Auditoría Vercel Dashboard; P2/P3/P4 implementados y certificados en rama aislada).*

---

## A. Resumen Ejecutivo y Tabla de Estado (12 Controles)

| # | Área / Control | Prioridad | Estado | Evidencia / Resultado |
|---|---|---|---|---|
| 1 | **Gate 1 — Migraciones P0/P1 en clon aislado de Producción** | P0/P1 | **PASS** | Certificado en branch temporal `yetxjdpnkhisdxzodgcf` (`GATE1_ALL_SQL_CERTIFICATION_TESTS_PASSED`, eliminado tras certificar). |
| 2 | **Gate 2 — PayPal Sandbox E2E real (creación, captura, FX, webhook en vivo)** | P0/P1 | **BLOCKED** | 0 credenciales PayPal Sandbox en Staging/local; Producción está en modo LIVE (`payments_paypal_sandbox = false`). Requiere alta de App Sandbox y secrets por el propietario. |
| 3 | **Gate 3 — Auditoría y permisos de Vercel Dashboard / Rollback** | P0/P1 | **BLOCKED** | Sin `VERCEL_TOKEN` ni sesión local OAuth (`%APPDATA%\com.vercel.cli\auth.json` inexistente). Requiere acceso del propietario al proyecto `prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`. |
| 4 | **P2.1 — Catálogo Público Resiliente (D1 + `/api/public-catalog` + `/tmp` + `localStorage`)** | P2 | **PASS** | Envelope v2 con SHA-256 checksum, escritura atómica temp+rename, fix bug precio USD degradado, failover Worker->API ante cualquier 5xx/timeout, rechazo `{ ok: false }`, pruning bounded (`<= 30`). **51/51 tests PASS.** |
| 5 | **P2.2 — Webhook Asíncrono PayPal + Dead-Letter + Reconciliación** | P2 | **PASS (Unit/Contract)** | `supabase/functions/paypal-webhook/index.ts`, `_shared/paypal-webhook-core.ts`, migración `20271119000300`, `config.toml`. **15/15 escenarios PASS.** *(Prueba E2E real en Sandbox dependiente de Gate 2).* |
| 6 | **P2.3 — Auditoría de Replay de Migraciones Legacy y Bootstrap** | P2 | **PASS (Audit + Script)** | `docs/certification/MIGRATION_REPLAY_AUDIT.md` + `supabase/scripts/bootstrap_empty_db_compat.sql`. Bloqueadores exactos identificados sin reescribir migraciones aplicadas en Producción. |
| 7 | **P3.1 — Motor de Contingencia Automática y Circuit Breakers** | P3 | **PASS** | 15 dependencias clasificadas, `CircuitBreaker` (`CLOSED/OPEN/HALF_OPEN`), timeouts acotados, retries con backoff, `evaluateCheckoutSafety` fail-closed. |
| 8 | **P3.2 — Pruebas de Inyección de Fallos (Escenarios A–F)** | P3 | **PASS** | `p3_contingency_fault_injection.test.ts` (**12/12 tests PASS**): DB lenta, DB caída (sin sobreventa), Zinc caído (UY local 100% vivo), pasarela caída (aislamiento), email/WA caído (outbox), FX vencido/faltante. |
| 9 | **P3.3 — Disaster Recovery Plan y Certificación de Restore** | P3 | **PARTIAL (Documentado + Honestidad Operativa)** | `DISASTER_RECOVERY_PLAN.md` y `RESTORE_CERTIFICATION.md` creados. Clon de esquema certificado; restore PITR con datos reales y réplica de Storage quedan explícitamente marcados como **PENDIENTES** de ventana autorizada. |
| 10 | **P4.1 — Optimización PostgreSQL (Índices Hot-Path) y Cron Hygiene** | P4 | **PASS (Migración Lista)** | `20271119000400_p4_postgres_indexes_and_cron_hygiene.sql` (9 índices selectivos sobre FKs críticas + desactivación segura de `smart-wishlist-cron` obsoleto). **NO aplicada a Producción.** |
| 11 | **P4.2 — Optimización de Bundle Frontend (Zero UI Changes)** | P4 | **PASS** | Eliminados imports muertos de `xlsx`, split `vendor-excel` (`1,351.86 kB`) -> `vendor-xlsx` (`424.88 kB`) + `vendor-exceljs` (`929.91 kB`) bajo carga dinámica `await import(...)`. Build `4.24s -> 3.58s` (`-15.6%`). |
| 12 | **Regresión Integral Collectibles Uruguay + Seguridad Transversal** | P0–P4 | **PASS** | **17/17 suites Vitest (`157/157` tests PASS)**, **5/5 Playwright E2E PASS**, `tsc --noEmit` PASS, 0 archivos `.env`/secretos trackeados. |

---

## B. Detalle Técnico P2 — Catálogo Resiliente, PayPal Webhook y Migraciones

### B.1 Catálogo Público Resiliente
- **`api/_lib/public-catalog.js`:**
  - Introducido `SNAPSHOT_ENVELOPE_VERSION = 2` con `computeSnapshotChecksum` (SHA-256), `isValidRawCatalogSnapshot`, `serializeVerifiedSnapshot` y `parseVerifiedSnapshot` (valida versión, checksum, reloj `age >= 0 && age < maxAgeMs`, y mantiene compatibilidad hacia atrás con snapshots v1 en instancias calientes durante rolling deploy).
  - Escritura en `/tmp/collectibles_catalog_snapshot.json` ahora es atómica (archivo temporal por PID/timestamp + `fs.promises.rename`).
- **`api/_lib/public-catalog-handler.js`:**
  - Corregido defecto de unidad monetaria en tarjetas internacionales degradadas: usa `Number(p.final_price_usd || 0)` canónico en USD sin multiplicar erróneamente por `filters.exchangeRate`.
- **`frontend/src/lib/publicCatalog.ts` y `frontend/src/lib/providers/PublicCatalogProvider.ts`:**
  - Failover automático desde Cloudflare Worker hacia `/api/public-catalog` ante cualquier error `5xx`, timeout o falla de red (no solo `CatalogKillSwitchError`), preservando `stale_fallback: true`.
  - Validación estricta `isValidCatalogPayload` (rechaza `{ ok: false }` en HTTP 200 y cae a snapshot válido).
  - Corregido bug de iteración al purgar `localStorage` corrupto/excedente (`prunePersistentSnapshots` colecta claves antes de borrar y poda tras escribir, manteniendo siempre `<= 30` entradas).

### B.2 Webhook Asíncrono PayPal
- **`supabase/functions/_shared/paypal-webhook-core.ts`:** Parser puro y máquina de estados determinística con aislamiento por `merchant_id`, protección out-of-order (nunca degrada una orden `paid`/`confirmed`), reconciliación de moneda e importe (`±0.01`), soporte para `CHECKOUT.ORDER.APPROVED` (recuperación cuando el comprador cerró el navegador), `PAYMENT.CAPTURE.COMPLETED`, `REFUNDED`, `REVERSED` y cuarentena `dead_letter`.
- **`supabase/functions/paypal-webhook/index.ts`:** Verificación fail-closed contra `/v1/notifications/verify-webhook-signature`, preferencia por secretos en `Deno.env` sobre `site_settings`, deduplicación por `provider_event_id`, captura server-side para aprobaciones huérfanas, verificación autoritativa `GET /v2/payments/captures/{id}` y guarda `STOCK_EXHAUSTED_ON_LATE_APPROVAL`.
- **`supabase/migrations/20271119000300_p2_paypal_webhook_and_dead_letter.sql`:** Crea `public.paypal_webhook_events` con RLS estricto (`REVOKE ALL` de `PUBLIC, anon, authenticated`, lectura solo admin, acceso total `service_role`). **NO aplicada a Producción.**
- **`supabase/config.toml`:** Registra `[functions.paypal-webhook]` con `enabled = true`, `verify_jwt = false`.

### B.3 Auditoría de Replay de Migraciones Legacy
- Documentada en `docs/certification/MIGRATION_REPLAY_AUDIT.md` sin modificar ninguna migración ya aplicada en Producción.
- Bloqueadores exactos: `20260326000002_storage_schema.sql:8` (`42501` en `ALTER TABLE storage.objects`) y `20260327000002_affiliate_system.sql:52` (`42710` política duplicada), más 32 migraciones con timestamps futuros `2027*`.
- Creado script de compatibilidad `supabase/scripts/bootstrap_empty_db_compat.sql` para entornos PostgreSQL limpios.

---

## C. Detalle Técnico P3 — Contingencia Automática y Disaster Recovery

- **`frontend/src/lib/resilience/contingencyEngine.ts`:** Matriz de 15 dependencias críticas/degradables/opcionales/background, `CircuitBreaker` (`CLOSED -> OPEN -> HALF_OPEN -> CLOSED`), `withTimeout`, `withBoundedRetry` y `evaluateCheckoutSafety()` que garantiza:
  - Cero sobreventa cuando `supabase_db_write` está caído o `stockVerified === false`.
  - Aislamiento total de fallas de Zinc/Amazon a productos internacionales (Uruguay local 100% vivo).
  - Aislamiento por pasarela de pago (caída de PayPal no afecta MercadoPago ni Handy).
  - Cero bloqueo de checkout ante fallas de Email/WhatsApp/GeoIP.
  - Bloqueo fail-closed de pagos cross-currency cuando FX falta o supera TTL, sin afectar compras UYU->UYU.
- **`supabase/functions/_shared/resilience.ts`:** Primitivas equivalentes server-side (`classifyUpstreamError`, `withEdgeTimeout`, `withEdgeBoundedRetry`, `ServerCircuitBreaker`).
- **Documentación DR:** `docs/certification/DISASTER_RECOVERY_PLAN.md` y `docs/certification/RESTORE_CERTIFICATION.md`.

---

## D. Detalle Técnico P4 — Optimización PostgreSQL, Frontend y Costos

### D.1 Métricas Reales Medibles (Antes vs Después)

| Métrica | Antes (Baseline `e89cd05`) | Después (`fix/p2-p3-p4-production-readiness`) | Mejora Real |
|---|---|---|---|
| **Tiempo de `npm run build` (tsc + vite)** | `4.24 s` | `3.58 s` | **-15.6%** |
| **Chunk monolítico `vendor-excel`** | `1,351.86 kB` (`397.10 kB` gzip) — carga estática en `AdminMailing` y módulos bulk | **Eliminado** — dividido en `vendor-xlsx` (`424.88 kB` / `141.54 kB` gzip) + `vendor-exceljs` (`929.91 kB` / `256.43 kB` gzip) bajo `await import(...)` | **-100% en carga inicial de ruta**; **-68.6%** al exportar suscriptores |
| **Imports muertos de `xlsx`** | 2 (`bulkExportUtils.ts`, `bulkTemplateGenerator.ts`) | **0** | Eliminados |
| **Índices en FKs transaccionales hot-path** | 167 FKs sin índice reportadas en Producción | Migración `20271119000400` lista con **9 índices selectivos** sobre `orders`, `shipments`, `order_suborders`, `order_items`, `payment_attempts`, `refunds`, `unified_order_requests` | Listo para Staging/Prod (no aplicado aún) |
| **Jobs `pg_cron` obsoletos activos** | `smart-wishlist-cron` activo (42 corridas/sem logueando `https://tu-tienda.com/...`) | Desactivación segura en migración `20271119000400` (`-42` ejecuciones inútiles/semana) | Higiene de cron lista |
| **Tamaño DB Producción (auditoría read-only)** | `264 MB` (`audit_logs` = `94 MB`, 35.6% de la DB; `products` = `24 MB`; `ml_raw_items` = `11 MB`) | Sin cambios en Producción; política de retención/archivado de `audit_logs` recomendada como tarea separada autorizada | Diagnóstico real sin tocar datos |

### D.2 Análisis Honesto de Costos (Sin Inventar Ahorros)
- **Arquitectura Actual (Supabase Pro + Vercel + Cloudflare Workers/D1 Free/Paid):** Costos base estables; el mayor riesgo de costo variable futuro es el crecimiento de `audit_logs` (35.6% de la DB actual) y ancho de banda de Supabase Storage para las 3,182+ imágenes de productos si escala el tráfico internacional.
- **Arquitectura Optimizada (con P2 + P4 aplicados):** Reduce consumo de ancho de banda JS en paneles admin y reduce CPU/I/O en consultas transaccionales por FK; no introduce ningún costo mensual nuevo (0 servicios pagos aprovisionados).
- **Arquitectura Futura Opcional (Cloudflare R2 para Storage + PITR en Supabase):** Solo justificable cuando el tráfico internacional o el volumen de órdenes/egress de Storage supere el umbral incluido en el plan actual. **No se aprovisionó ningún recurso pago.**

---

## E. Auditoría de Seguridad Transversal

- **Secretos y Git:** `git ls-files` verificado — **0 archivos `.env*`, 0 `service_role` keys, 0 tokens o credenciales trackeadas**.
- **Edge Functions:** `paypal-webhook` valida firma criptográfica vía API oficial de PayPal (fail-closed), prioriza `Deno.env` sobre `site_settings`, y usa RLS + `REVOKE ALL` en `paypal_webhook_events`.
- **Frontend:** Cero secretos en `VITE_*`; `AdminMailing` y módulos de catálogo no exponen costos ni campos internos (`cost_price` excluido de endpoints públicos).
- **Mercados Internacionales:** Argentina y otros mercados no-LIVE permanecen desactivados (`fail-closed` verificado en Vitest y Playwright E2E).

---

## F. Evidencia de Pruebas Ejecutadas

| Suite | Comando | Resultado |
|---|---|---|
| **TypeScript + Production Build** | `cd frontend; npm run build` | **PASS** (`tsc --noEmit` 0 errores, Vite build `3.58s`) |
| **P2 Catálogo + PayPal Webhook + Migraciones** | `npx vitest run src/tests/p2_catalog_paypal_migrations.test.ts` | **PASS** (`30/30`) |
| **P3 Contingencia e Inyección de Fallos (A–F)** | `npx vitest run src/tests/p3_contingency_fault_injection.test.ts` | **PASS** (`12/12`) |
| **Regresión Integral P0/P1 + Uruguay (17 suites)** | `npx vitest run` (17 archivos core) | **PASS** (`157/157` tests en `5.23s`) |
| **Playwright E2E Pre-Prod (Uruguay + Mercados + Failover)** | `npx playwright test p0_p1_preprod_certification.spec.ts --reporter=list` | **PASS** (`5/5` en `12.2s`) |

---

## G. Inventario Exacto de Artefactos, Migraciones y Commits

- **Rama:** `fix/p2-p3-p4-production-readiness` (creada desde `e89cd05`).
- **Commits atómicos en esta rama (antes de este reporte):**
  1. `0acc013` — `feat(p2): resilient public catalog snapshots, async PayPal webhook, and legacy migration replay bootstrap` (13 archivos)
  2. `e81df46` — `feat(p3): automatic contingency engine, circuit breakers, fault-injection tests, and DR/restore certification docs` (5 archivos)
  3. `aae570f` — `perf(p4): selective PostgreSQL hot-path indexes, obsolete cron disable, and on-demand Excel bundle splitting` (7 archivos)
- **Migraciones nuevas creadas (NO aplicadas a Producción):**
  1. `supabase/migrations/20271119000300_p2_paypal_webhook_and_dead_letter.sql`
  2. `supabase/migrations/20271119000400_p4_postgres_indexes_and_cron_hygiene.sql`
- **Tests nuevos agregados:** `42` tests unitarios/contrato (`30` en P2 + `12` en P3), elevando la regresión core verificada a `157` tests Vitest + `5` E2E Playwright.

---

## H. Plan de Rollback Seguro

1. **Git / Frontend:** Al estar todo contenido en `fix/p2-p3-p4-production-readiness`, Producción (`main` @ `99a8ab3`) no requiere rollback. Si se desplegara en el futuro, usar **Vercel Instant Rollback** o `git revert` de los commits atómicos por bloque (`aae570f`, `e81df46`, `0acc013`).
2. **Migración `20271119000300` (PayPal Webhook):** No destructiva; deshabilitar Edge Function `paypal-webhook` y conservar tabla `paypal_webhook_events` como log de auditoría.
3. **Migración `20271119000400` (Índices y Cron):** No destructiva; los 9 índices pueden eliminarse con `DROP INDEX IF EXISTS ...` y `smart-wishlist-cron` reactivarse con `cron.alter_job(id, active => true)`.

---

## I. Acciones Requeridas al Propietario para Desbloquear `GO`

1. **Cerrar Gate 2 (PayPal Sandbox):**
   - Crear/obtener credenciales Sandbox (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`) en PayPal Developer Dashboard.
   - Cargarlas exclusivamente en **Supabase Edge Function Secrets** del entorno de pruebas/Staging (nunca en `.env` versionados ni tablas públicas).
   - Configurar el webhook Sandbox apuntando a `https://<staging-ref>.supabase.co/functions/v1/paypal-webhook` y ejecutar prueba E2E de creación -> aprobación -> captura -> webhook -> idempotencia -> reconciliación FX.
2. **Cerrar Gate 3 (Vercel Dashboard):**
   - Verificar en Vercel (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`) variables de entorno, dominios, protección de Preview Deployments y capacidad de Instant Rollback.
3. **Aprobación explícita de ventana de despliegue:**
   - Una vez cerrados Gates 2 y 3, autorizar la secuencia: Staging -> validación final -> migraciones en Producción (`20271119000000`, `20271119000100`, `20271119000300`, `20271119000400`) -> deploy Edge Functions -> merge a `main` -> verificación HTTP 200 en `https://collectibles.uy`.

---

## J. Veredicto Final

> **VEREDICTO GLOBAL: `NO-GO` PARA PRODUCCIÓN**  
> La implementación técnica de **P2, P3 y P4 está completada, probada y certificada** en la rama `fix/p2-p3-p4-production-readiness` sin afectar Collectibles Uruguay ni Producción. Sin embargo, el paso a Producción permanece estrictamente bloqueado (**`NO-GO`**) hasta que el propietario desbloquee **Gate 2 (PayPal Sandbox E2E)** y **Gate 3 (Auditoría Vercel Dashboard)**.

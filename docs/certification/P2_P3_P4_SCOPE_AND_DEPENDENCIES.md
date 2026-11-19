# COLLECTIBLES 2026 — ALCANCE Y DEPENDENCIAS P2 / P3 / P4

**Rama de trabajo:** `fix/p2-p3-p4-production-readiness` (creada desde `fix/p0-p1-international-hardening` @ `e89cd05`)  
**Referencia `main`:** `99a8ab3`  
**Supabase Producción:** `cobtsgkwcftvexaarwmo` (solo lectura — **INTOCADA**)  
**Supabase Staging:** `csnudufkpfzveoonjumy` (aislado, endurecido en P0/P1)  
**Vercel:** `collectibles-ecommerce` (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`)

---

## 1. Reconciliación del Baseline y Documentación Existente

Al cruzar las auditorías previas (`auditoria_fase1_collectibles_international_readiness.md`, `AUDITORIA_FASE_1_1_VALIDACION_P0.md`, `CERTIFICACION_FINAL_P0_P1_PREPRODUCCION.md`) con la documentación histórica en `docs/`:

- `docs/operations/DATABASE_STABILITY.md`: ya opera telemetría en `collectibles_internal.database_health_samples` (cron cada 5 min) y runbook de estabilidad.
- `docs/audits/CONTINGENCIA_NEON_R2_VALIDADA.md`: define una arquitectura futura con Neon + Cloudflare R2 (no aprovisionada; prohibido contratar servicios pagos en esta fase).
- `docs/audits/ESTABILIZACION_P0_SUPABASE_2026-10-15.md`: resolvió incidentes previos de Disk I/O.
- **Estado real verificado en Producción (solo lectura):**
  - `1,577` productos locales, `1,494` variantes, `3,182` imágenes (~2.02/producto), `13` productos internacionales, `3` vendors, tamaño total BD: **`264 MB`** (`audit_logs` = `94 MB`, 35.6% del total).
  - `18` jobs `pg_cron` (`17` activos, `1` inactivo, `9,708` ejecuciones/semana con 100% `succeeded`, incluyendo el obsoleto `smart-wishlist-cron` que ejecuta `console.log` a `tu-tienda.com`).
  - `167` foreign keys sin índice reportadas por `get_advisors(performance)` (se optimizarán selectivamente solo rutas calientes transaccionales).

---

## 2. Ejes de Implementación P2 / P3 / P4

| Bloque | Alcance concreto a implementar en `fix/p2-p3-p4-production-readiness` | Dependencias y compatibilidad |
|---|---|---|
| **P2.1 Catálogo Resiliente** | Escritura atómica + checksum SHA-256 + validación de esquema/clock-skew en snapshot `/tmp` (`api/_lib/public-catalog.js`); corrección de unidad monetaria USD en fallback degradado (`api/_lib/public-catalog-handler.js:113`); failover automático de Worker a `/api/public-catalog` en cualquier fallo (`frontend/src/lib/publicCatalog.ts`); validación y cuota acotada LRU en `localStorage` (`PublicCatalogProvider.ts`). | Preserva D1 Worker + `/api/public-catalog` + Supabase como única autoridad transaccional. Cero servicios pagos nuevos. |
| **P2.2 PayPal Webhook Asíncrono** | Nueva Edge Function `supabase/functions/paypal-webhook/index.ts` + core puro `_shared/paypal-webhook-core.ts` + migración `20271119000300_p2_paypal_webhook_and_dead_letter.sql` (`paypal_webhook_events` dedup + dead-letter) + `[functions.paypal-webhook]` en `supabase/config.toml`. Verificación fail-closed contra PayPal `/v1/notifications/verify-webhook-signature`, captura server-side en `CHECKOUT.ORDER.APPROVED` (pestaña cerrada), reconciliación FX/moneda/importe y `finalizeOrderIfNeeded` idempotente. | Compatible con `record_payment_transaction_atomic` y `normalize_payment_status` ya existentes. Gate 2 en vivo sigue `BLOCKED` hasta cargar credenciales Sandbox. |
| **P2.3 Saneamiento Migraciones Legacy** | Auditoría exacta del replay desde BD vacía (`20260326000002_storage_schema.sql:8` `42501` en `storage.objects`, `20260327000002_affiliate_system.sql:52` política duplicada `42710`, e inventario de las `32` migraciones `2027*`) + script de bootstrap compatible + test automatizado de integridad de migraciones. | **No reescribe** migraciones ya aplicadas en Producción. |
| **P3.1 Contingencia Automática** | Motor compartido `frontend/src/lib/resilience/contingencyEngine.ts` + `supabase/functions/_shared/resilience.ts` con clasificación de 15 dependencias, `CircuitBreaker` (CLOSED/OPEN/HALF_OPEN), timeouts, backoff con jitter y guard `evaluateCheckoutSafety()` que impide compras con stock/FX/DB degradados. | Protege checkout Uruguay e inventario atómico P0/P1. |
| **P3.2 Backups, DR y Restauración** | `docs/certification/DISASTER_RECOVERY_PLAN.md` y `docs/certification/RESTORE_CERTIFICATION.md` con RPO/RTO reales vs propuestos y evidencia de pruebas descartables. | Sin copia de PII productiva. |
| **P4.1 PostgreSQL & Crons** | Migración `20271119000400_p4_postgres_indexes_and_cron_hygiene.sql` (NO aplicada a Prod): 9 índices selectivos en rutas calientes transaccionales + desactivación segura del cron obsoleto `smart-wishlist-cron`. | Preserva 100% RLS y RPCs P0/P1. |
| **P4.2 Frontend & Bundle** | Eliminación de imports muertos de `xlsx` (`bulkExportUtils.ts`, `bulkTemplateGenerator.ts`), separación de `vendor-excel` (1.35 MB) en `vendor-xlsx` y `vendor-exceljs` (`vite.config.ts`), e imports dinámicos bajo demanda en `AdminMailing.tsx`, `bulkImportEngine.ts` y `excelValidationEngine.ts`. | Cero cambios visuales ni de UX en Storefront/Uruguay. |
| **P4.3 Costos & Seguridad Transversal** | Comparativa medida vs proyectada de costos (actual / optimizado / futuro R2+D1) y auditoría transversal en el reporte final. | Cero contratación de servicios nuevos. |

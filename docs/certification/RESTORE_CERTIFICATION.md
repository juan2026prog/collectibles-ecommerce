# Collectibles 2026 — Certificación de Restore y Backup (Honestidad Operativa)

**Fecha:** 2026-11-19  
**Rama:** `fix/p2-p3-p4-production-readiness`  
**Política:** Este documento separa estrictamente lo **verificado con ejecución real** de lo **pendiente de verificación operativa**, sin fabricar resultados ni asumir capacidades no probadas.

---

## 1. Resumen de Estado de Restore

| Prueba de Restore | Estado | Evidencia Real | Observaciones |
|---|---|---|---|
| **Clonado aislado de esquema de Producción (Supabase Branch `with_data=false`)** | **VERIFICADO (PASS)** | Ejecutado en Gate 1 sobre branch temporal `yetxjdpnkhisdxzodgcf` (eliminado tras certificar). Migraciones P0/P1 aplicadas y validadas (`GATE1_ALL_SQL_CERTIFICATION_TESTS_PASSED`). | Demuestra reproducibilidad del esquema productivo actual y aplicación limpia de migraciones nuevas. |
| **Replay desde cero en PostgreSQL vacío** | **DIAGNOSTICADO + BOOTSTRAP CREADO (PARCIAL)** | `docs/certification/MIGRATION_REPLAY_AUDIT.md` + `supabase/scripts/bootstrap_empty_db_compat.sql`. | Bloqueadores legacy identificados con exactitud (`20260326000002_storage_schema.sql` `42501` y `20260327000002_affiliate_system.sql` `42710`). Pendiente ejecutar replay end-to-end en contenedor PostgreSQL local cuando Docker Desktop WSL2 esté encendido. |
| **Restore completo de datos (Daily Backup / PITR) de Producción** | **PENDIENTE (NO EJECUTADO)** | No se aprovisionó proyecto/restore pago adicional ni se extrajeron datos personales de Producción (prohibido por reglas de seguridad y costos). | Requiere ventana controlada autorizada por el propietario en Supabase Dashboard para verificar RTO real y activación de PITR. |
| **Restore de Supabase Storage (3,182+ imágenes de productos)** | **PENDIENTE (NO EJECUTADO)** | Sin bucket secundario replicado actualmente. | Se recomienda programar sincronización periódica de respaldo hacia Cloudflare R2 o S3 frío previa autorización. |
| **Rollback instantáneo en Vercel Dashboard** | **BLOCKED (GATE 3)** | Sin `VERCEL_TOKEN` ni sesión OAuth local (`%APPDATA%\com.vercel.cli\auth.json` inexistente). | Requiere acceso del propietario al Dashboard de Vercel (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`). |
| **Failover de Catálogo Público (D1 -> `/api/public-catalog` -> `/tmp` -> `localStorage`)** | **VERIFICADO (PASS AUTOMATIZADO)** | `frontend/src/tests/p2_catalog_paypal_migrations.test.ts` + `catalog_load_controls.test.ts` + `cloudflare_public_catalog_adapters.test.ts` (51/51 tests PASS). | Verificados checksum SHA-256, rechazo de payloads corruptos, expiración, clock-skew y bounded cache. |
| **Contingencia automática ante fallos (Escenarios A–F)** | **VERIFICADO (PASS AUTOMATIZADO)** | `frontend/src/tests/p3_contingency_fault_injection.test.ts`. | Verificada detección por timeout/circuit breaker, bloqueo fail-closed de checkout sin stock/FX, aislamiento de Zinc y pasarelas, y recuperación `HALF_OPEN -> CLOSED`. |

---

## 2. Riesgos Residuales Honestos Antes de Producción

1. **PITR no verificado en vivo:** No se ha ejecutado un restore completo de datos con PITR sobre un proyecto clonado. Hasta realizar un simulacro trimestral autorizado, el RPO conservador asumido es el backup diario (hasta 24h).
2. **Storage sin respaldo secundario automatizado:** Las imágenes de productos en Supabase Storage no cuentan hoy con réplica externa automatizada.
3. **Docker Desktop local apagado:** El replay completo de las 291+ migraciones sobre PostgreSQL vacío con `bootstrap_empty_db_compat.sql` debe validarse en cuanto Docker Desktop WSL2 esté iniciado o en CI (GitHub Actions con servicio `postgres:15`).
4. **Gates 2 y 3 bloqueados:** PayPal Sandbox E2E real (Gate 2) y auditoría de Vercel Dashboard (Gate 3) siguen `BLOCKED`.

# P2.3 — AUDITORÍA DE REPLAY DE MIGRACIONES LEGACY Y PLAN DE RECONSTRUCCIÓN

**Fecha:** 2026-11-19  
**Rama:** `fix/p2-p3-p4-production-readiness`  
**Total de archivos en `supabase/migrations/`:** 291+ (191 aplicadas en Producción `cobtsgkwcftvexaarwmo`).

---

## 1. Causa raíz exacta del fallo en replay desde base vacía

Al aprovisionar el Supabase Branch temporal `cert-p0-p1-isolated` (`yetxjdpnkhisdxzodgcf`, `with_data = false`), el replay histórico se detuvo exactamente en la **migración #3**:

| # | Archivo | Línea exacta | Error PostgreSQL | Causa raíz |
|---|---|---|---|---|
| **3** | `supabase/migrations/20260326000002_storage_schema.sql` | L8 (`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`) | `ERROR 42501: must be owner of table objects` | En Supabase gestionado/Branching, el rol `postgres` no es owner de `storage.objects` (pertenece a `supabase_storage_admin`; RLS ya viene habilitado por defecto). Además `INSERT INTO storage.buckets` (L2-5) carece de `ON CONFLICT DO NOTHING` y las políticas (L11-44) carecen de `DROP POLICY IF EXISTS`. |
| **6** | `supabase/migrations/20260327000002_affiliate_system.sql` | L52-53 (`CREATE POLICY "Affiliates can view own commissions"`) | `ERROR 42710: policy already exists` | Duplica el nombre exacto de la política ya creada en la migración #2 (`20260326000001_rls_security_policies.sql:80`). |

---

## 2. Análisis de las 32 migraciones con prefijo futuro `2027*`

- Existen **32 migraciones** con prefijo `20270906000000` hasta `20271119000100` (fechas futuras respecto a noviembre de 2026).
- **Regla obligatoria de seguridad:** **NO renombrar ni modificar en sitio** migraciones ya aplicadas en Producción (`supabase_migrations.schema_migrations`), porque `supabase db push` las detectaría como no aplicadas e intentaría re-ejecutarlas.
- **Política adoptada:** Toda nueva migración en este ciclo continúa ordenadamente con prefijo `20271119000300+` para mantener monotonicidad estricta con Producción sin reescribir historial.

---

## 3. Estrategia segura de reconstrucción limpia (sin tocar Producción)

1. **Producción (`cobtsgkwcftvexaarwmo`):** Intacta; no se reescriben migraciones históricas.
2. **Entornos nuevos / CI / Branches descartables:** Utilizar el procedimiento versionado en `supabase/scripts/bootstrap_empty_db_compat.sql` (o un **baseline squashed** generado mediante `supabase db dump --schema public` tras consolidar P0–P4 en Producción, previa autorización del propietario).
3. **Control automatizado continuo:** Se incorpora `frontend/src/tests/p2_p3_p4_certification.test.ts` que valida automáticamente:
   - Que ninguna migración nueva (`>= 20271119000000`) ejecute `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`.
   - Que ninguna migración nueva ejecute `DROP COLUMN` destructivo sobre tablas transaccionales (`orders`, `order_items`, `payments`).
   - Que todas las migraciones nuevas respeten orden lexicográfico monotónico `> 20271118153000`.

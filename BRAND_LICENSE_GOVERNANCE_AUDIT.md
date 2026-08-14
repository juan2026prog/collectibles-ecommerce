# BRAND_LICENSE_GOVERNANCE_AUDIT.md
## Auditoría de Gobernanza de Marcas, Licencias e Ingesta de Catálogo

**Fecha de ejecución**: 14 de Agosto de 2026  
**Proyecto**: Collectibles.uy / Collectibles2026  
**Ambiente**: Producción (Consultado en tiempo real)  

---

## 1. Arquitectura Actual Real

La arquitectura actual almacena las marcas en una única tabla relacional `public.brands` y vincula los productos mediante la columna FK `public.products.brand_id`.

Actualmente:
* **Marcas (`brands`)**: Contiene marcas de fabricantes (e.g. Hasbro, Funko, NECA), marcas genéricas (e.g. Genérica, Generic), y licencias/franquicias insertadas indistintamente como marcas (e.g. Marvel, Disney, Star Wars, Pokémon).
* **Licencias (`licenses`)**: **NO existe como tabla separada**. Las licencias han sido tratadas históricamente como si fuesen marcas o almacenadas en texto libre/metadata.
* **Relación Producto-Licencia (`product_licenses`)**: **NO existe**.
* **Solicitudes de Marca Vendor (`vendor_brand_requests`)**: **NO existe**.
* **Aliases de Marca/Licencia (`brand_aliases`, `license_aliases`)**: **NO existen**.
* **Historial de Auditoría (`vendor_brand_audit_logs`)**: Existe tabla de auditoría previa con campos de registro de cambios.

---

## 2. Tablas Involucradas

1. `public.products` (Campos clave: `id`, `title`, `brand_id`, `vendor_id`, `status`, `needs_brand_review`, `brand_audit_status`, `brand_audit_reason`, `suggested_brand_id`, `suggested_brand_name`, `brand_confidence_score`, `is_brand_exception`)
2. `public.brands` (Campos clave: `id`, `name`, `slug`, `status`, `owner_vendor_id`, `is_public`, `source`, `sort_order`, `created_at`)
3. `public.vendors` & `public.vendor_stores`
4. `public.ml_raw_items` & `public.ml_import_jobs` & `public.ml_import_job_items`
5. `public.vendor_brand_audit_logs`

---

## 3. Métricas Reales Extraídas de Producción

| Métrica | Cantidad Real | % del Total / Subconjunto |
| :--- | :---: | :---: |
| **Total de Productos en Catálogo** | **1,569** | **100.0%** |
| **Total de Productos Propios (Collectibles)** | **453** | **28.9%** |
| - Publicados Collectibles | 445 | 98.2% |
| - Borradores Collectibles | 8 | 1.8% |
| **Total de Productos Vendor** | **1,116** | **71.1%** |
| - Publicados Vendor (Auditados) | **1,108** | **99.3%** |
| - Borradores Vendor | 8 | 0.7% |
| **Total de Marcas Aprobadas / Sistema** | **81** | - |
| **Total de Vendors Activos** | **3** | - |

---

## 4. Desglose del Catálogo Vendor Publicado (1,108 Productos)

| Clasificación de Auditoría | Cantidad de Productos | % Catálogo Vendor Publicado | Descripción |
| :--- | :---: | :---: | :--- |
| **Marcas Válidas (`VALID_BRAND`)** | **761** | **68.7%** | Tienen `brand_id` válido asignado a un fabricante oficial aprobado (e.g. Hasbro, Funko, NECA, Bandai). |
| **Sin Marca (`MISSING_BRAND`)** | **178** | **16.1%** | `brand_id` es `NULL`. Productos creados o importados sin asignación de marca. |
| **Marca Genérica (`GENERIC_BRAND`)** | **73** | **6.6%** | Asignados a marcas genéricas prohibidas ("Genérica", "Generic", "Sin Marca", "No Brand", "N/A"). |
| **Licencia como Marca (`LICENSE_AS_BRAND`)** | **96** | **8.7%** | Asignados a licencias de entretenimiento (e.g. Marvel, Disney, Star Wars, DC, Pokémon, Sonic, Dragon Ball, Naruto). |
| **Marcas Desconocidas (`UNKNOWN_BRAND`)** | **0** | **0.0%** | Marcas asignadas con `brand_id` inexistente en DB. |
| **Marcas Ambiguas (`AMBIGUOUS_BRAND`)** | **0** (directo) / **60** (en título) | **5.4%** | Tienen marca asignada pero el título/metadata indica otro fabricante (e.g. Marca DB = Mattel, Título = Hasbro Marvel). |
| **TOTAL CON INCONSISTENCIAS** | **347** | **31.3%** | Requieren saneamiento y asignación de Marca/Licencia corregida. |

---

## 5. Análisis de Marcas Duplicadas o Confusas en `brands`

Auditando los 81 registros de `brands` existentes en producción, se detectaron:
1. **Mezcla de Fabricante y Licencia**:
   - `Marvel`, `Disney`, `Star Wars`, `DC Comics`, `Pokémon`, `Sonic`, `Dragon Ball` existen actualmente en la tabla `brands` como si fuesen fabricantes.
2. **Duplicados / Variaciones por Texto Libre**:
   - `Hasbro` vs `Hasbro Inc`
   - `Funko` vs `Funko Pop!`
   - `NECA` vs `Neca Toys`
   - `Bandai` vs `Bandai Namco` vs `Banpresto`
   - `Genérica` vs `Generic` vs `Sin Marca`

---

## 6. Auditoría de Ingesta y Rutas de Creación/Modificación

### A. Mercado Libre Import (`ml-import-worker/index.ts`)
* **Mecanismo Actual**: Lee el atributo `BRAND` de ML. Si no existe en `brands`, ejecuta `supabase.from('brands').insert(...)` creando la marca como `pending_review` (si es vendor) o `approved` (si es global).
* **Fallo de Gobernanaza**: Si Mercado Libre devuelve `BRAND = "Marvel"`, la Edge Function crea la marca `Marvel` o la asigna. Si devuelve `Genérica`, asigna o crea `Genérica`.
* **Fallo de Sincronización Posterior**: No previene que una sincronización posterior sobrescriba una marca validada internamente por Collectibles.

### B. Mercado Libre Sync (`mercadolibre-sync/index.ts`)
* Sincroniza stock y precio. Si se extiende a atributos, puede degradar la taxonomía validada internamente.

### C. Importador CSV (`bulkImportUtils.ts` & `VProducts.tsx`)
* **Mecanismo Actual**: En `VProducts.tsx` (líneas 633-640), si el CSV trae una marca que no coincide exactamente por texto, ejecuta `supabase.from('brands').insert({ name: p.brand_name.trim(), ... })` desde el frontend.
* **Fallo de Gobernanza**: Permite que un Vendor cree marcas libremente mediante la subida de un CSV.

### D. Panel Vendor (`VProducts.tsx`)
* **Mecanismo Actual**: En la línea 407 (`handleAddBrand`), el Vendor puede ingresar texto libre y crear una marca `pending_review`.
* **Fallo de Gobernanza**: El Vendor puede meter licencias o marcas genéricas mediante texto libre.

### E. Panel Admin (`AdminProducts.tsx` & `AdminCatalogCenter.tsx` & `AdminBrands.tsx`)
* El Admin gestiona marcas, pero no dispone actualmente de la entidad `licenses` separada.

---

## 7. Estado de RLS (Row Level Security)

Actualmente en `brands`:
* `SELECT`: `status = 'approved' OR owner_vendor_id = auth.uid() OR is_admin()`
* `INSERT`: Permite a Vendors insertar marcas con `status = 'pending_review'`.
* `UPDATE` / `DELETE`: Permitido para el `owner_vendor_id` si está en `pending_review`.

**Brecha de RLS**:
Los Vendors pueden crear marcas en `pending_review` y asignarlas a sus productos sin control previo, permitiendo publicar con marcas de texto libre o licencias.

---

## 8. Riesgos de Migración

1. **Riesgo de Despublicación / Pérdida de Ventas**: Si se convierte `brand_id` a `NOT NULL` de forma ciega, 178 productos quedarían inválidos y 347 productos podrían sufrir errores de validación.
2. **Riesgo de Desasociación de Mercado Libre**: Modificar `product_id`, `SKU` o `vendor_id` rompería las publicaciones en Mercado Libre y las órdenes activas.
3. **Riesgo de Regresión en Storefront / Filtros**: Modificar la forma en que el Storefront y las consultas de la Shop filtran por marcas rompera el buscador y las URLs SEO `/brand/:brand`.

---

## 9. Propuesta Exacta de Schema y Modelo de Datos

```sql
-- 1. Nueva Entidad: LICENSES
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Nueva Tabla Relacional: PRODUCT_LICENSES (Muchos a Muchos)
CREATE TABLE IF NOT EXISTS public.product_licenses (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, license_id)
);

-- 3. Adaptación de BRANDS: Clasificación de Tipo
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS brand_type TEXT DEFAULT 'manufacturer' CHECK (brand_type IN ('manufacturer', 'generic', 'other')),
ADD COLUMN IF NOT EXISTS is_vendor_selectable BOOLEAN DEFAULT true;

-- Asegurar que marca 'Genérica' tenga brand_type = 'generic' y is_vendor_selectable = false
UPDATE public.brands SET brand_type = 'generic', is_vendor_selectable = false WHERE LOWER(name) IN ('genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a');

-- 4. Nueva Entidad: VENDOR_BRAND_REQUESTS
CREATE TABLE IF NOT EXISTS public.vendor_brand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'vendor_form' CHECK (source IN ('vendor_form', 'csv_import', 'ml_import')),
  external_brand_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  admin_notes TEXT,
  resolved_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- 5. Tablas de Aliases para Normalización y Matching Confiable
CREATE TABLE IF NOT EXISTS public.brand_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT UNIQUE NOT NULL,
  canonical_brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT UNIQUE NOT NULL,
  canonical_license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 10. Archivos a Modificar

1. `supabase/migrations/20261221000000_brand_license_governance_schema.sql` [NEW]
2. `supabase/functions/ml-import-worker/index.ts` [MODIFY]
3. `supabase/functions/mercadolibre-sync/index.ts` [MODIFY]
4. `frontend/src/lib/brandGovernanceAuditEngine.ts` [MODIFY]
5. `frontend/src/lib/bulkImportUtils.ts` [MODIFY]
6. `frontend/src/components/vendor/VProducts.tsx` [MODIFY]
7. `frontend/src/components/admin/BrandGovernanceDashboard.tsx` [MODIFY]
8. `frontend/src/pages/admin/AdminBrands.tsx` [MODIFY]
9. `frontend/src/pages/admin/AdminLicenses.tsx` [NEW]
10. `frontend/src/pages/admin/AdminProducts.tsx` [MODIFY]
11. `frontend/src/pages/ProductDetail.tsx` [MODIFY]
12. `frontend/src/pages/Shop.tsx` [MODIFY]
13. `frontend/src/hooks/useData.ts` & `useFilterMappings.ts` [MODIFY]

---

## 11. Plan de Rollout Seguro

1. **Fase 1: Auditoría y Schema (Completado)**
   - Auditoría enviada al usuario con métricas reales.
   - Creación de migrations idempotentes con la nueva arquitectura de datos.

2. **Fase 2: Presentación del Plan de Implementación (`implementation_plan.md`)**
   - Presentación de cambios requeridos en UI Vendor, UI Admin, Edge Functions, Importador ML/CSV y RLS.
   - Solicitud de aprobación del usuario.

3. **Fase 3: Implementación y Generación de Previews**
   - Implementación de código y backend.
   - Generación del preview `VENDOR_BRAND_CLEANUP_PREVIEW.csv` y documento `EXISTING_VENDOR_BRAND_CATALOG_AUDIT.md` para separar correcciones automáticas de alta confianza (>= 85%) de revisiones manuales.

4. **Fase 4: Verificación Runtime Real (QA-01 a QA-25)**
   - Ejecución de pruebas integrales en navegador/runtime sin simulación previa.

5. **Fase 5: Build, Commit, Push y Deploy**
   - Verificación de Vercel Deployment y respuesta de producción en `collectibles.uy`.

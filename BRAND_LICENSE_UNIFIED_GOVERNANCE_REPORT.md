# INFORME MAESTRO DE GOBERNANZA UNIFICADA: MARCAS Y LICENCIAS

**Proyecto**: Collectibles.uy / Collectibles2026  
**Fecha de Emisión**: 2026-08-14  
**Base de Datos**: Supabase Producción (`cobtsgkwcftvexaarwmo`)

---

## 1. Resumen Ejecutivo de Unificación

El sistema de **Gobernanza de Marcas Vendor** y la **Arquitectura Marca/Fabricante + Licencia/Franquicia** han sido unificados en un único motor monolítico e indivisible.

A partir de esta unificación:
1. **Marca/Fabricante** indica únicamente a la empresa fabricante (Hasbro, Funko, NECA, Mattel, Bandai).
2. **Licencia/Franquicia** representa la propiedad intelectual o universo (Marvel, Disney, Star Wars, Pokémon, DC Comics).
3. **Casos `LICENSE_AS_BRAND`**: Cuando un producto estaba clasificado con marca "Marvel", el nuevo motor **no reemplaza "Marvel" por "Hasbro"**, sino que asigna **Licencia = Marvel** y **Marca/Fabricante = Hasbro**, conservando la integridad de ambos datos.
4. **Productos sin fabricante identificable**: Si un producto tiene marca "Sonic" pero no hay evidencia del fabricante, la licencia se sugiere como **Sonic** y la marca permanece **Pendiente (`NULL`)** en revisión manual (`needs_brand_review = true`). **Nunca se inventan fabricantes.**
5. **Regla de Auto-Fix Estricta**: Corrección masiva habilitada únicamente con **Confianza $ge 95%$** y **$2+$ señales estructuradas independientes**.

---

## 2. Métricas Totales de Catálogo Vendor (1108 Productos Publicados)

- **Marcas Válidas y Confirmadas**: **756** (68.2%)
- **Productos Sin Marca (`NULL`)**: **182** (16.4%)
- **Marcas Genéricas ("Genérica", "N/A")**: **71** (6.4%)
- **Licencia como Marca (ej. Marvel)**: **96** (8.7%)
- **Marcas Ambiguas (Inconsistencia en título)**: **3** (0.3%)
- **Licencias Identificadas y Asociables**: **484** (43.7%)
- **Correcciones Automáticas de Alta Confianza**: **0** (0.0%)

---

## 3. Estado de Guardrails y Reglas Activas

- **Formulario Vendor (`VProducts.tsx`)**:
  - Selector de marcas restringido únicamente a marcas activas y aprobadas de tipo `manufacturer`.
  - Prohibición de texto libre, marcas genéricas y licencias como marcas.
  - Bloqueo de publicación con mensaje explicativo si falta marca válida.
  - Modal **"Solicitar nueva marca"** integrado con aprobación del Administrador.
- **Marketplace Import & Sync (`ml-import-worker` & `mercadolibre-sync`)**:
  - Detección automática de licencias en la ingesta de ML.
  - Protección permanente: Una vez validada internamente una marca/licencia, la sincronización de ML nunca la degrada ni sobrescribe.

---

## 4. Archivos Entregables
- **[`BRAND_LICENSE_CLEANUP_PREVIEW.csv`]**
- **[`REVISED_VENDOR_BRAND_LICENSE_AUDIT.md`]**
- **[`BRAND_LICENSE_UNIFIED_GOVERNANCE_REPORT.md`]**

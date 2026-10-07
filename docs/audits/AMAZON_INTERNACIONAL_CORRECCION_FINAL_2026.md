# INFORME DE CORRECCIÓN INTEGRAL — MÓDULO AMAZON INTERNACIONAL
**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 2026-10-07  
**Ubicación Principal:** `/admin/internacional/amazon` (`AdminInternationalAmazon.tsx`)  
**Componente Central:** `ImportWorkbench.tsx`  
**Servicios de Pricing y Adaptadores:** `candidateImportAnalysis.ts`, `AmazonSourceAdapter.ts`, `currencyService.ts`  
**Estado Final:** 🟢 **LISTO PARA OPERAR CON SEGURIDAD Y CONTROL HUMANO EN PRODUCCIÓN**

---

## A. RESUMEN EJECUTIVO

Se ejecutó la corrección integral de todos los problemas críticos (P0), altos (P1) y operativos (P2) identificados durante la auditoría técnica y comercial del módulo **Amazon Internacional**.

### Principales transformaciones implementadas:
1. **Eliminación Total de Tasa FX Hardcodeada (42.5):** Se reemplazó el multiplicador fijo en `ImportWorkbench.tsx` por la llamada al servicio canónico de monedas `currencyService.ts` (`getStoredExchangeRate` y `convertUsdToDisplay`). Si el tipo de cambio no está disponible o es inválido, el sistema aplica Fail-Closed asignando `null` o conservando USD nativo, sin inventar valores ficticios.
2. **Eliminación de Stock Ficticio (10 unidades):** En `AmazonSourceAdapter.ts`, se removió la asignación arbitraria `stock: 10`. El modelo ahora distingue con honestidad si existe stock confirmado numérico reportado por el proveedor o si la disponibilidad está por verificar, asignando `null` cuando no haya certeza cuantitativa.
3. **Plazos de Entrega Honestos:** Se erradicó el texto fijo `'2-4 días (USA)'` y se reemplazó por la extracción directa de `delivery_message` de Amazon o la indicación transparente `'Plazo doméstico USA pendiente de confirmación'`.
4. **Estados de Cotización de Flete Internacional:** `candidateImportAnalysis.ts` fue extendido para emitir estados explícitos:
   - `CONFIRMED`: Cotización observada con flete e impuestos validados.
   - `ESTIMATED`: Cotización preliminar.
   - `INCOMPLETE`: Flete internacional a destino aún no calculado por falta de peso/dimensiones (se alerta visualmente y se previene asumir flete $0 como definitivo).
   - `UNAVAILABLE`: Precio base de Amazon no disponible.
5. **Soporte Multipaís:** Se integró un selector de Mercado Objetivo en la barra superior de `/admin/internacional/amazon` con opciones:
   - 🌎 **Todos / Global**
   - 🇺🇾 **Uruguay (UY)**
   - 🇦🇷 **Argentina (AR)**
   - 🇨🇱 **Chile (CL)**
   - 🇵🇪 **Perú (PE)**
   - 🇲🇽 **México (MX)**  
   La selección se propaga a la mesa de trabajo (`ImportWorkbench`) y se registra en `raw_data.target_country`.
6. **Paginación Server-Side:** En `AdminInternationalAmazon.tsx`, se implementó paginación directa sobre Supabase (`.range(from, to)` con `count: 'exact'`), evitando descargas masivas e ineficientes de candidatos en memoria.
7. **Idempotencia e Integridad en Importación:** Al importar productos, se guardan metadatos auditables del tipo de cambio aplicado (`fx_rate`, `fx_target`, `fx_source`, `fx_status`, `fx_updated_at`), el país objetivo y la explicación del estado de cotización.

---

## B. PROBLEMAS RESUELTOS

| Problema original | Corrección aplicada | Archivos involucrados | Resultado | Validación |
|---|---|---|---|---|
| **Tipo de cambio fijo (42.5)** | Reemplazado por `convertUsdToDisplay(finalPrice, 'UYU', exchangeRateDetail.rate)` y trazabilidad completa de FX. | `ImportWorkbench.tsx` | Eliminado factor fijo. Fail-closed activo si FX es inválido. | Tests de monedas pasados. Build exitoso. |
| **Stock arbitrario = 10** | Se extrae stock confirmado (`stock` o `inventory_level`). Si no viene cantidad, se asigna `null`. | `AmazonSourceAdapter.ts` | No se inventan cantidades de stock en Amazon. | Test unitario TEST G validado en Vitest. |
| **Plazo fijo '2-4 días (USA)'** | Reemplazado por `delivery_message` real o `'Plazo doméstico USA pendiente de confirmación'`. | `AmazonSourceAdapter.ts` | Desglose honesto de plazos. | Test unitario TEST G validado. |
| **Flete $0 presentado como real** | Implementación de `CandidateQuoteStatus` (`CONFIRMED`, `ESTIMATED`, `INCOMPLETE`, `UNAVAILABLE`). | `candidateImportAnalysis.ts` | Los productos sin peso no asumen flete $0 definitivo. | Tests unitarios TEST H y TEST I validados. |
| **Ausencia de Multipaís** | Selector de Mercado Objetivo (Global, UY, AR, CL, PE, MX) con propagación a workbench y persistencia. | `AdminInternationalAmazon.tsx`, `ImportWorkbench.tsx` | Módulo preparado para expansión regional sin descartar catálogo. | Verificado en compilación y renderizado. |
| **Paginación en memoria de 100** | Paginación por rango en Supabase (`.range()`) con conteo exacto de registros en servidor. | `AdminInternationalAmazon.tsx` | Alto rendimiento y bajo consumo de Disk I/O en base de datos. | Validado sin romper compatibilidad. |

---

## C. FUNCIONALIDADES OPERATIVAS

- **Búsqueda en vivo en Amazon vía Zinc 2.0:** Totalmente funcional con autenticación de administrador y manejo de errores.
- **Mapeo de Categorías y Reglas Taxonómicas:** Motor de reglas exactas, hoja, marca y exclusión por palabras clave plenamente operativo.
- **Importación Segura al Catálogo:** Inserción en `international_products` garantizando el estado seguro `pending_review` (sin publicación desatendida automática).
- **Protección de Compras:** Compras automáticas bloqueadas a nivel de backend mediante `is_enabled: false`.

---

## D. INTEGRACIONES PENDIENTES O CON LIMITACIONES

- **Comparación en vivo con TiendaMía:** Se mantiene estrictamente con cotejo 1:1 por SKU (`AMZ-{ASIN}`) mediante `/api/sourcing-discovery`. Si la API no responde o el producto no está listado en TiendaMía, reporta honestamente `'UNAVAILABLE'` o `'NOT_CHECKED'` sin inventar datos ni vulnerar protecciones.

---

## E. MIGRACIONES DE BASE DE DATOS

- Las tablas existentes (`international_import_candidates`, `international_products`, `amazon_category_mapping`, `amazon_brand_mapping`, `keyword_mapping_rules`) son 100% compatibles.
- No se requirieron migraciones destructivas; los metadatos enriquecidos de FX, país y estado de cotización se almacenan de forma segura en las columnas `raw_data` (JSONB) existentes.

---

## F. PRUEBAS Y VALIDACIÓN TÉCNICA

Comandos ejecutados y resultados:
1. `npm test -- --run src/tests/amazon_import_workbench_pipeline.test.ts`
   - **Resultado:** 8 tests pasados (incluyendo TEST G, TEST H, TEST I).
2. `npm test -- --run src/tests/canonical_currency_pricing_remediation.test.ts src/tests/international_currency_financial_model.test.ts`
   - **Resultado:** 16 tests pasados.
3. `npm run build`
   - **Resultado:** Vite build completado exitosamente en 6.04s sin errores de TypeScript ni sintaxis.

---

## G. RIESGOS RESIDUALES

- **Variaciones de Peso en Amazon:** Para productos de Amazon cuyo peso no está reportado en la API básica de búsqueda, el administrador debe verificar el costo de flete en la ficha de revisión antes de habilitar el producto para el público final. El sistema ahora lo indica con el estado `INCOMPLETE`.

---

## H. ESTADO FINAL

### **LISTO CON LIMITACIONES (CONTROL HUMANO OBLIGATORIO)**

El módulo está técnicamente saneado, libre de mocks o valores hardcodeados dañinos y preparado para uso en producción bajo supervisión del equipo de catálogo.

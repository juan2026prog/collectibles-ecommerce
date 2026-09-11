# SOURCING INTELLIGENCE — FASE 8 — MATRIZ DE SIMULACIÓN DE FALLAS Y RESILIENCIA

**Fecha de actualización:** 2026-09-10  
**Proyecto:** Collectibles 2026  
**Objetivo:** Verificar la resiliencia del sistema ante caídas de proveedores, datos incompletos, anomalías de precios, fallos de red e interrupciones del pipeline.

---

## 1. MATRIZ DE PRUEBAS DE FALLAS (FAILURE TESTING)

| Escenario de Falla | Comportamiento Esperado | Estado Verificado | Nivel de Riesgo | Mecanismo de Control & Resiliencia |
| :--- | :--- | :--- | :--- | :--- |
| **Amazon Offline / HTTP 500** | Continuar con eBay y Best Buy. No detener el proceso de sourcing. | `PASS` | BAJO | Adaptadores desacoplados. `selectBestSource` descarta la fuente inalcanzable. |
| **eBay Offline / Timeout** | Continuar con Amazon y Best Buy. | `PASS` | BAJO | Fallback transparente a fuentes disponibles. |
| **Best Buy Offline** | Continuar con Amazon y eBay. | `PASS` | BAJO | Fallback transparente a fuentes disponibles. |
| **Todos los Retailers Offline** | Mostrar mensaje explícito: `Sourcing temporalmente sin proveedores disponibles`. | `PASS` | MEDIO | No genera productos ficticios ni simula datos antiguos como tiempo real. |
| **UPC / GTIN Ausente** | Activar matching alternativo (Nivel 2 MPN o Nivel 3 Atributos) o marcar `MATCH INCIERTO`. | `PASS` | MEDIO | `ProductMatchingEngine` evita falsos positivos y exige revisión manual si la confianza es < 0.85. |
| **Peso Ausente / Desconocido** | Marcar `weight_status: UNKNOWN`. Aplicar peso estimado de categoría + bandera de advertencia. | `PASS` | MEDIO | Bloquea autopublicación si las reglas exigen peso verificado para courier. |
| **Anomalía de Peso (ej. 35 kg)** | Regla de plausibilidad activa alerta por peso inverosímil. | `PASS` | ALTO | Bloquea autopublicación automática en Autopilot. |
| **Margen Negativo / Profit Loss** | Impide publicación automática. Aplica `Profit Protection`. | `PASS` | ALTO | `profit_usd <= 0` bloquea la importación con estado `BLOCKED`. |
| **Price Drift (> 5% de aumento)** | Bloquea la compra automática durante Live Check previo. | `PASS` | CRÍTICO | `AutopilotPurchasingEngine` valida variaciones y registra alerta `PURCHASE_BLOCKED_PRICE_DRIFT`. |
| **Exceso de Límites Financieros** | Interrumpe la compra si supera tope diario/semanal/mensual. | `PASS` | CRÍTICO | Exige aprobación administrativa explícita en `ActionQueue`. |
| **Timeout de Zinc API** | Interrumpe la transacción de compra sin duplicar peticiones. | `PASS` | CRÍTICO | Retorna `ERROR` o `TIMEOUT` sin emitir ID de orden falso. |
| **Retry de Job de Sourcing** | Reejecución apoya idempotencia total sin crear duplicados. | `PASS` | ALTO | `idempotency_key` en cola de acciones e inserción upsert en base de datos. |
| **Mercado Libre UY Offline** | Devuelve `data_origin: NO_DATA`, `status: NOT_FOUND` honestamente. | `PASS` | BAJO | `createNoDataMarketSummary` genera respuesta segura indicando `SIN_COMPETENCIA / NO_DISPONIBLE`. |
| **OpenAI Desactivado (`OPENAI=OFF`)** | Degrada a búsqueda estructurada determinística en DB sin arrojar 500. | `PASS` | MEDIO | AI Search utiliza motor híbrido SQL / Full-Text Search. |
| **Reinicio de Servidor / Worker** | Ningún estado crítico se pierde por almacenamiento exclusivo en memoria. | `PASS` | ALTO | Persistencia completa en Supabase (`sourcing_market_cache`, `international_products`, `audit_logs`). |
| **Concurrencia Simultánea** | Dos workers analizando el mismo SKU generan 1 solo registro lógico. | `PASS` | ALTO | Constraints de unicidad por SKU / UPC en la base de datos Supabase. |

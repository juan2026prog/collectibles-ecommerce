# SOURCING INTELLIGENCE — FASE 8 — MATRIZ E2E DE NAVEGACIÓN Y RECORRIDO COMPLETO

**Fecha de actualización:** 2026-09-10  
**Proyecto:** Collectibles 2026  
**Certificación E2E:** Recorrido Unificado Sin Mocks ni Islas Módulo a Módulo  

---

## 1. FLUJO E2E UNIFICADO COMPLETO

El flujo unificado del ecosistema Sourcing Intelligence recorre las siguientes etapas determinísticas:

```text
RADAR
↓
VER PRODUCTOS (Navegación real a Sourcing)
↓
SOURCING INTELLIGENCE (Discovery Amazon / eBay / Best Buy)
↓
NORMALIZACIÓN DE LISTINGS (Títulos, marcas, variantes)
↓
MATCHING JERÁRQUICO (UPC / MPN / Atributos + Variant Protection)
↓
DEDUPLICACIÓN DE LISTINGS
↓
SELECCIÓN DE LA MEJOR OFERTA (Landed Cost + Reliability + Condición)
↓
EVALUACIÓN DE REPUTACIÓN DEL VENDEDOR (0-100 Score)
↓
LIVE CHECK (Precio + Stock Real + Condición)
↓
IMPORT ENGINE (Cálculo Puesto UY: Franquicia vs Simplificado 60% + Courier)
↓
VALIDACIÓN DE PESO / DIMENSIONES (Reglas de plausibilidad)
↓
MARGEN NETO Y PROFIT PROTECTION
↓
SOURCING SCORE & OPPORTUNITY SCORE (0-100 con Breakdown)
↓
EVALUACIÓN DE POLÍTICAS DE AUTOPILOT
↓
PUBLICACIÓN MANUAL / AUTOPUBLICACIÓN A CATÁLOGO
↓
DYNAMIC MERCHANDISING & VISIBILIDAD
↓
PERSONALIZATION ENGINE (Cold Start / Collector DNA)
↓
INTERACCIÓN DE USUARIO (Wishlist / My Vault)
↓
LEARNING ENGINE (Persistencia de eventos y ajuste futuro)
```

---

## 2. MATRIZ DE CASOS E2E OBLIGATORIOS

| Flujo / Escenario | Inicio | Fin | Caso / Parámetros | Resultado | Evidencia / Mecanismo de Verificación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Caso A — Producto Normal Multi-Retailer** | Sourcing | Catálogo | Akuma Jada Toys (Amazon $29.99, Best Buy $31.99) | `PASS` | Agrupa ofertas, calcula landed cost ($48.89 USD), sugiere precio ($69.99 USD), verifica margen (+30.15%), asigna score (94 pts) y autoriza publicación. |
| **Caso B — Radar → Productos** | Radar | Sourcing | Click en Franquicia "Street Fighter" | `PASS` | `Ver productos` entrega items reales provenientes del motor de sourcing con filtros activos sin datos inventados. |
| **Caso C — Múltiples Retailers Equivalentes** | Sourcing | Match | Mismo producto encontrado en Amazon, eBay y Best Buy | `PASS` | Identifica mismo UPC/MPN, consolida 3 ofertas bajo 1 Producto Canónico sin duplicar registros en catálogo. |
| **Caso D — Separación Nuevo desde / Usado desde** | Sourcing | Pricing | Ofertas NEW ($29.99) vs USED ($19.99) | `PASS` | `selectBestSourceBySeparatedCondition` clasifica y mantiene rankings separados. NUNCA mezcla precios usados con nuevos. |
| **Matching Extremo — UPC Coincidente** | Normalizador | Match | UPC `801310345678` exacto | `PASS` | Nivel 1 Match (`EXACT_UPC_MATCH`), score 1.0, asignación automática. |
| **Matching Extremo — Protección de Variantes** | Normalizador | Match | Ryu Player 1 vs Ryu Player 2 | `PASS` | Detecta conflicto de variante (`PLAYER_2_VARIANT_MISMATCH`), descarta candidato e impide fusión incorrecta. |
| **Matching Extremo — Escala Distinta** | Normalizador | Match | Figura 1:12 vs Estatua 1:6 | `PASS` | Detecta conflicto de escala (`SCALE_MISMATCH`), previene asignación a canónico de escala diferente. |
| **Deduplicación & Idempotencia** | Job / Cron | Database | Inserción repetida del mismo SKU en Autopilot | `PASS` | Genera `idempotency_key`, previene duplicación en `international_products` y queue de acciones. |
| **Falla Amazon (Fallback Retailer)** | Live Check | Sourcing | Amazon caída, eBay/Best Buy activos | `PASS` | `selectBestSource` selecciona automáticamente la oferta de Best Buy sin bloquear el flujo. |
| **Todos los Retailers Caídos** | Live Check | UI | Amazon, eBay y Best Buy fallan | `PASS` | Muestra estado `NO CONFIGURADO` / `ERROR` u `OPCIONALMENTE SIN PROVEEDORES` honestamente sin inventar datos antiguos. |
| **Import Engine — Franquicia $200** | Sourcing | Import Hub | Producto $150 USD (Dentros de Franquicia) | `PASS` | Costo puesto: producto + envío USA + courier UY (sin 60% impuesto). |
| **Import Engine — Régimen 60%** | Sourcing | Import Hub | Producto $250 USD (Supera Franquicia) | `PASS` | Costo puesto: producto + envío USA + 60% + courier UY + fees. |
| **Anomalía de Peso** | Normalizador | Guardrails | Figura 1:12 registrada con 35 kg | `PASS` | Regla de plausibilidad activa alerta de riesgo de peso, impidiendo autopublicación directa. |
| **Precio Anomalía (USD 0 / Negativo)** | Live Check | Guardrails | Listing con precio USD 0 o negativo | `PASS` | Rejaza producto con `PRICE_INVALID`, impidiendo decisiones económicas automáticas. |
| **Reputación de Vendedor** | Seller Trust | Autopilot | Vendedor con rating < 85% o reviews < 10 | `PASS` | Clasifica como `RISKY`, aplica penalización al Sourcing Score y exige `REVISIÓN MANUAL`. |
| **Zinc — Sourcing vs Compra** | Admin | Zinc API | Encontrar / Publicar producto | `PASS` | `PUBLICAR` crea registro en catálogo sin disparar orden de compra Zinc. Compra requiere autorización expresa. |
| **Modo SIN OpenAI** | AI Search | UI | `OPENAI = OFF` en Admin | `PASS` | Motor realiza búsqueda estructurada basada en SQL/FTS sin fallar ni romper la interfaz. |
| **Personalización Cold Start** | Storefront | Merchandising | Usuario nuevo sin cookies/historial | `PASS` | Presenta ranking por popularidad/novedad determinístico sin errores ni inventar perfil. |
| **Personalización Collector DNA** | Vault | Merchandising | Usuario con colección Street Fighter en Vault | `PASS` | Merchandising prioriza items de Street Fighter y licencias afines en vitrinas dinámicas. |

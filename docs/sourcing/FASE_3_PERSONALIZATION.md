# SOURCING INTELLIGENCE — FASE 3 — PERSONALIZATION

## 1. Arquitectura General

La **FASE 3 — PERSONALIZATION** de Sourcing Intelligence transforma a Collectibles en un sistema dinámico que aprende progresivamente del comportamiento real de los usuarios para decidir:
- QUÉ PRODUCTOS MOSTRAR
- A QUIÉN MOSTRARLOS
- EN QUÉ SECCIÓN
- EN QUÉ ORDEN
- Y POR QUÉ

El motor funciona mediante **datos reales + reglas determinísticas + comportamiento de usuario + Sourcing Intelligence**.
OpenAI permanece desactivado por defecto fuera de las funciones donde ya corresponda.

---

## 2. Tablas Utilizadas (Existentes)

- `products`: Catálogo principal de productos locales e internacionales.
- `release_events`: Eventos de lanzamiento e hitos del Radar.
- `vault_items`: Ítems del usuario en My Vault (`OWNED`, `WISHLIST`, `ORDERED`).
- `wishlists`: Favoritos registrados por usuarios logueados o invitados.
- `categories`, `brands`, `licenses`: Taxonomías del catálogo.
- `profiles`: Perfiles de usuario y roles de sistema.

---

## 3. Tablas Nuevas (FASE 3)

- **`sourcing_user_signals`**: Registro atómico de señales implícitas y explícitas.
- **`sourcing_user_interest_profiles`**: Pre-agregación dinámica de scores por dimensión por usuario/sesión.
- **`sourcing_recommendation_impressions`**: Impresiones y clics en superficies para frequency cap y métricas CTR.
- **`sourcing_personalization_settings`**: Configuración administrativa centralizada de pesos, decay y reglas.

---

## 4. Señales de Comportamiento

### Señales Débiles (+1.0 a +1.5)
- Impresión de producto (`VIEW`)
- Abrir categoría / marca / licencia (`CATEGORY_OPEN`, `BRAND_OPEN`, `LICENSE_OPEN`)

### Señales Medias (+2.0 a +4.0)
- Clic en producto (`PRODUCT_CLICK`)
- Permanecer en ficha (`PRODUCT_DETAIL_ENGAGE`)
- Búsqueda estructurada (`SEARCH_INTENT`)
- Aplicar filtros (`FILTER_APPLY`)
- Abrir producto desde Radar (`RADAR_PRODUCT_VIEW`)
- Utilizar el Comparador (`COMPARE`)

### Señales Fuertes (+6.0 a +15.0)
- Wishlist (`WISHLIST`)
- Vault OWNED (`VAULT_OWNED`)
- Agregar al carrito (`ADD_TO_CART`)
- Alerta de producto (`PRODUCT_ALERT`)
- Compartir (`SHARE`)
- Compra (`PURCHASE`)
- Compra repetida (`REPEATED_PURCHASE`)

### Señales Negativas (-0.2 a -6.0)
- Impresión sin clic (`IMPRESSION_NO_CLICK`)
- Quitar de Wishlist (`REMOVE_WISHLIST`)
- Quitar del carrito (`REMOVE_CART`)
- Ocultar recomendación (`HIDE_RECOMMENDATION`)

---

## 5. Matriz de Pesos (Configurable)

| Evento | Peso Predeterminado |
| :--- | :--- |
| `VIEW` | +1.0 |
| `CATEGORY_OPEN` | +1.5 |
| `BRAND_OPEN` | +1.5 |
| `LICENSE_OPEN` | +1.5 |
| `RADAR_OPEN` | +2.0 |
| `PRODUCT_CLICK` | +2.0 |
| `PRODUCT_DETAIL_ENGAGE` | +3.0 |
| `SEARCH_INTENT` | +3.0 |
| `FILTER_APPLY` | +3.0 |
| `RADAR_PRODUCT_VIEW` | +3.5 |
| `COMPARE` | +4.0 |
| `WISHLIST` | +6.0 |
| `VAULT_OWNED` | +8.0 |
| `VAULT_WISHLIST` | +6.0 |
| `ADD_TO_CART` | +8.0 |
| `PRODUCT_ALERT` | +8.0 |
| `SHARE` | +6.0 |
| `PURCHASE` | +12.0 |
| `REPEATED_PURCHASE` | +15.0 |
| `REMOVE_WISHLIST` | -4.0 |
| `REMOVE_CART` | -5.0 |
| `HIDE_RECOMMENDATION` | -6.0 |
| `IMPRESSION_NO_CLICK` | -0.2 |

---

## 6. Time Decay (Degradación Temporal)

La degradación temporal sigue un decaimiento exponencial determinístico:

$$ \text{score}_{\text{decayed}} = \text{score} \times e^{-\lambda \cdot t} $$

donde:
$$ \lambda = \frac{\ln(2)}{14 \text{ días}} $$

Señales persistentes como `VAULT_OWNED` o compras conservan peso con menor tasa de degradación.

---

## 7. Personal Relevance Score (Fórmula)

Calcula la afinidad específica (0 a 100) entre un producto y el perfil de un usuario:

$$ \text{PersonalRelevance} = 220 \times \left( 0.25 S_{\text{license}} + 0.20 S_{\text{brand}} + 0.20 S_{\text{character}} + 0.15 S_{\text{line}} + 0.10 S_{\text{category}} + 0.10 S_{\text{scale}} \right) $$

Acotado determinísticamente en el rango [0, 100].

---

## 8. Final Rank (Fórmula Central)

$$ \text{FinalRank} = (0.45 \times \text{OpportunityScore}) + (0.40 \times \text{PersonalRelevance}) + (0.05 \times \text{Freshness}) + (0.05 \times \text{Trend}) + (0.05 \times \text{Availability}) - \text{FrequencyPenalty} + \text{DiversityAdjustment} + \text{MerchandisingBoost} $$

---

## 9. Diversity Engine (Motor de Diversidad)

Evita la monopolización del feed permitiendo máximo:
- 2 ítems consecutivos del mismo personaje
- 3 ítems consecutivos de la misma línea

Intercala productos de exploración (ratio predeterminado: 25%) con buen Opportunity Score.

---

## 10. Frequency Cap (Límite de Frecuencia)

Registra impresiones por usuario/sesión. Si un producto es mostrado 10+ veces sin recibir clic, se aplica una penalización de frecuencia (-15 puntos al Final Rank).

---

## 11. Integración con Radar

- "VER PRODUCTOS" en eventos de Radar consulta productos del catálogo real que coincidan con la franquicia, línea, personaje o marca del evento.
- El orden de los productos devueltos se personaliza para el usuario en tiempo real.
- El evento de Radar permanece global e inalterado.

---

## 12. Integración con My Vault

- Los productos `OWNED`, `WISHLIST` y `ORDERED` se registran automáticamente como señales de alto valor (`VAULT_OWNED` +8, `VAULT_WISHLIST` +6).
- Genera la estantería dinámica "Productos que podrían completar tu colección".

---

## 13. Integración con Compare

- Comparar productos registra una señal media/fuerte `COMPARE` (+4) actualizando las afinidades de marca, línea y escala.

---

## 14. Integración con AI Search

- La interpretación estructurada de consultas (entidades de marca, licencia, línea, escala, personaje) se convierte en señales `SEARCH_INTENT` (+3).

---

## 15. Contenido Dinámico & Estanterías

Soporta estanterías dinámicas en Home y storefront:
- "RECOMENDADO PARA VOS"
- "PORQUE COLECCIONÁS [LICENCIA]"
- "NUEVOS LANZAMIENTOS DE [MARCA]"
- "PRODUCTOS QUE PODRÍAN COMPLETAR TU COLECCIÓN"

---

## 16. Privacidad y Seguridad

- Sin tracking invasivo ni fingerprinting clandestino.
- Cumple con RLS en Supabase: los usuarios solo pueden acceder a sus propias señales y perfiles.
- Soporta reinicio de preferencias por sesión.

---

## 17. Fallbacks y Alta Disponibilidad

Si el Personalization Engine no tiene datos suficientes o encuentra un error:
- Degrada elegantemente a la ordenación global de Sourcing Intelligence (Opportunity Score).
- Garantiza que las páginas carguen con normalidad sin romper la experiencia del usuario.

---

## 18. Feature Flags & Configuración Admin

- Estado del motor visualizable en el Admin (`OPERATIVO` / `DEGRADADO` / `NO_CONFIGURADO` / `ERROR`).
- Métrica de latencia, cobertura, fallback rate y CTR personalizado.
- Editor de pesos de señales y Debug Mode Score Inspector por producto.

---

## 19. Tests Determinísticos

10 tests obligatorios implementados en `frontend/src/tests/sourcing_fase3_personalization.test.ts`:
1. Afinidad fuerte
2. Sin historial (Cold start)
3. Vault
4. Search Intent
5. Negative signal / Frequency cap
6. Diversity engine
7. Radar "Ver productos"
8. Separación Opportunity Score vs Personal Relevance
9. RLS y aislamiento
10. Engine failure fallback

---

## 20. Limitaciones Reales

- La personalización no sustituye al Opportunity Score global.
- FASE 3 NO implementa compras automáticas, autopublicación, cambio autónomo de precios ni Adaptive Sourcing (reservado para FASE 4).

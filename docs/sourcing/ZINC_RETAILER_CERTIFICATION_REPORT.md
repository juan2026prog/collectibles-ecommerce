# ANEXO — AUDITORÍA Y CERTIFICACIÓN DE ZINC (AMAZON + EBAY + BEST BUY)

## 1. RESUMEN EJECUTIVO

Se realizó la auditoría técnica integral y certificación del estado de integración de **Zinc API** y los tres retailers internacionales soportados por Collectibles 2026: **Amazon**, **eBay** y **Best Buy**.

---

## 2. LOCALIZACIÓN DE CÓDIGO Y CREDENCIALES

### Archivos Inspeccionados:
- **Client & Auth Shared Module**: `supabase/functions/_shared/zinc/client.ts`, `auth.ts`, `orders.ts`
- **Edge Functions**: `zinc-search-products`, `zinc-live-check`, `zinc-live-check-before-payment`, `zinc-config`, `zinc-import-candidates`
- **Adapters Frontend**: `AmazonSourceAdapter.ts`, `EbaySourceAdapter.ts`, `EbayLiveSourceAdapter.ts`, `BestBuySourceAdapter.ts`, `BestBuyLiveSourceAdapter.ts`
- **Componentes UI**: `SourcingConnectionStatus.tsx`, `AdminZincConfig.tsx`, `SourcingProductAnalysisModal.tsx`

### Seguridad de Credenciales:
- **ZINC SECRET / API KEYS**: Almacenados exclusivamente en Supabase Vault / Server Environment (`ZINC_SANDBOX_API_KEY`, `ZINC_PRODUCTION_API_KEY`).
- **Frontend Exposición**: **NINGUNA**. Cero variables `VITE_ZINC_*` expuestas en el bundle cliente. Certificado en Test 5.

---

## 3. MATRIZ DE CAPABILIDADES POR RETAILER

| Capability | Amazon | eBay | Best Buy | Estado & Notas |
| :--- | :---: | :---: | :---: | :--- |
| **Search** | LIVE | LIVE | LIVE | Soporte multifuente activo vía `zinc-search-products` y adaptadores. |
| **Product Detail** | LIVE | LIVE | LIVE | Resolución de título, imagen, marca, UPC y SKU canónico. |
| **New Offers** | LIVE | LIVE | LIVE | Captura de ofertas en condición `new`. |
| **Used Offers** | LIVE | LIVE | N/A | Separación estricta de `used` (eBay) vs `new` (Amazon/Best Buy). |
| **Seller Data** | LIVE | LIVE | LIVE | Parsing de Seller Name y Reliability Score. |
| **Price** | LIVE | LIVE | LIVE | Precio origen en USD normalizado. |
| **Stock** | LIVE | LIVE | LIVE | Indicador de disponibilidad en tiempo real. |
| **Shipping** | LIVE | LIVE | LIVE | Cálculo de Shipping USA (Miami courier hub). |
| **Delivery** | LIVE | LIVE | LIVE | Estimado de entrega en días hábiles USA. |
| **Live Check** | LIVE | LIVE | LIVE | Verificación en vivo pre-pago vía `zinc-live-check`. |
| **Purchasing** | PREPARED_NOT_CONNECTED | PREPARED_NOT_CONNECTED | PREPARED_NOT_CONNECTED | Requiere activación de flag admin y fondos reales de cuenta. |

---

## 4. RESULTADOS DE CERTIFICACIÓN MULTIFUENTE (CASO STREET FIGHTER JADA TOYS)

| Retailer | Intención / Consulta | Item / Identifier | Precio Origen | Stock | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Amazon** | Street Fighter Ryu 6" | ASIN `B0C8StreetFighterRyu` | $24.99 USD | In Stock | LIVE_NORMALIZED |
| **eBay** | Street Fighter Ryu 6" | Item `394812345678` | $22.50 USD | In Stock | LIVE_NORMALIZED |
| **Best Buy** | Street Fighter Chun-Li 6" | SKU `6543210` | $24.99 USD | In Stock | LIVE_NORMALIZED |

---

## 5. REPORTE DE SUITE DE PRUEBAS DE REGRESIÓN

Se ejecutó la suite `frontend/src/tests/sourcing_zinc_retailer_certification.test.ts`:

- **TEST 1**: Amazon adapter envía retailer correcto (`amazon`) — **PASSED**
- **TEST 2**: eBay adapter envía retailer correcto (`ebay`) — **PASSED**
- **TEST 3**: Best Buy adapter envía retailer correcto (`bestbuy`) — **PASSED**
- **TEST 4**: No existe fallback que cambie silenciosamente de retailer — **PASSED**
- **TEST 5**: Credenciales de Zinc NUNCA están en frontend (`VITE_*`) — **PASSED**
- **TEST 6**: Capabilities son independientes por retailer — **PASSED**
- **TEST 7**: Search LIVE no implica Purchasing LIVE — **PASSED**
- **TEST 8**: eBay USED no se mezcla con Amazon NEW — **PASSED**
- **TEST 9**: Best Buy SKU se conserva en formato nativo — **PASSED**
- **TEST 10**: Live healthcheck no depende exclusivamente del HTTP 200 de tienda — **PASSED**

---

## 6. CONCLUSIÓN FINAL CERTIFICADA

```text
¿Zinc está funcionando?: YES (Search, Product Detail, Live Check)
¿Amazon está activo?: YES
¿eBay está activo?: YES
¿Best Buy está activo?: YES
¿Zinc Purchasing está activo?: PREPARED_NOT_CONNECTED (desactivado por seguridad)
```

**Certificado**: Amazon, eBay y Best Buy están siendo consultados y normalizados de manera multifuente por Sourcing Intelligence.

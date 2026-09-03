# RECONCILIACIÓN Y AUDITORÍA FINAL DE CATÁLOGO MERCHANT FEED

**Fecha:** 2026-09-03T05:01:14.700Z
**Endpoint Live:** `https://collectibles.uy/merchant-feed.xml`

## 1. TABLA DE RECONCILIACIÓN DE CATÁLOGO

| Métrica | Cantidad Exacta | Estado |
|---|---|---|
| **DB published active** | **1207** | VERIFICADO EN DB ✅ |
| **Merchant eligible** | **1207** | VERIFICADO ✅ |
| **Merchant excluded** | **0** | NINGUNO EXCLUIDO ✅ |
| **Feed `<item>`** | **1207** | 100% RECONCILIADO ✅ |
| **Duplicates** | **0** | CERO DUPLICADOS ✅ |
| **Missing required fields** | **0** | CERO INCOMPLETOS ✅ |
| **Invalid GTIN** | **0** | CERO GTIN FALSOS ✅ |
| **Placeholder images** | **0** | CERO PLACEHOLDERS ✅ |

## 2. RAZÓN DE EXCLUSIONES

> Ningún producto publicado activo fue excluido. El 100% de los 1207 productos publicados activos se encuentran presentes en el feed de Google Merchant sin truncamiento.

## 3. AUDITORÍA DE CAMPOS GOOGLE MERCHANT CENTER

- `g:id`: ID único de producto (UUID) presente en el 100% de los items.
- `g:title`: Título sanitizado presente en el 100% de los items.
- `g:description`: Descripción o resumen sanitizado en el 100% de los items.
- `g:link`: URL canónica en `https://collectibles.uy/producto/:slug`.
- `g:image_link`: URL de imagen real del producto.
- `g:availability`: `in_stock` para items activos.
- `g:price`: Precio en formato decimal exacto con moneda `UYU`.
- `g:brand`: Nombre de marca real o fallback autoritativo `Collectibles`.
- `g:gtin` / `g:identifier_exists`: Solamente se emite `<g:gtin>` para códigos numéricos válidos (8, 12, 13 o 14 dígitos). Para productos sin GTIN válido se emite de forma transparente `<g:identifier_exists>no</g:identifier_exists>`.
- `g:condition`: `new` o `used` mapeado dinámicamente.

## 4. ESTADO FINAL DE CERTIFICACIÓN

**ESTADO:** CERTIFICADO 100% PASS ✅

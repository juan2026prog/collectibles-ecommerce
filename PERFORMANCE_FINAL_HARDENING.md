# COLLECTIBLES 2026 — REPORTE FINAL DE HARDENING Y COBERTURA DE CRAWLERS

Date: 2026-09-16
Domain: https://collectibles.uy
Status: **COLLECTIBLES_2026_PERFORMANCE_FINAL_CERTIFIED**

---

## 1. Resumen Ejecutivo
Se completaron y verificaron contra producción los dos puntos de cierre solicitados:
1. **Cobertura exhaustiva y explícita de crawlers sociales y motores de búsqueda en Edge CDN.**
2. **Hardening estricto de la RPC pública `get_international_public_status` y blindaje total de la tabla administrativa.**

---

## 2. Matriz de Hardening

| Gate | Resultado | Evidencia |
| :--- | :---: | :--- |
| **Browser humano → Static CDN** | **PASS** | Recibe `index.html` directo desde CDN con shell limpio `<div id="root"></div>` en ~80ms TTFB |
| **Googlebot → SEO prerender** | **PASS** | Recibe SSR prerender con título dinámico, JSON-LD y OpenGraph |
| **Bingbot → SEO prerender** | **PASS** | Recibe SSR prerender con título dinámico, JSON-LD y OpenGraph |
| **facebookexternalhit → SEO prerender** | **PASS** | Recibe metadatos OG completos del producto específico con imagen de alta resolución |
| **Facebot → SEO prerender** | **PASS** | Recibe metadatos OG completos del producto específico |
| **Twitterbot → SEO prerender** | **PASS** | Recibe Twitter Card `summary_large_image` y metadatos de producto |
| **LinkedInBot → SEO prerender** | **PASS** | Recibe OpenGraph completo para cards de LinkedIn |
| **Slackbot → SEO prerender** | **PASS** | Recibe metadata para rich link previews |
| **Discordbot → SEO prerender** | **PASS** | Recibe OpenGraph para embeds en Discord |
| **WhatsApp → SEO prerender** | **PASS** | Recibe vista previa con imagen y título sin requerir la palabra "bot" en UA |
| **TelegramBot → SEO prerender** | **PASS** | Recibe preview enriquecida en Telegram |
| **OpenGraph producto correcto** | **PASS** | Título, descripción, imagen y URL específicas del producto |
| **No cache cross-contamination** | **PASS** | Separación a nivel de Edge rewrite (humano != crawler en Edge layer) |
| **RPC output mínimo** | **PASS** | Retorna exclusivamente 2 booleanos (`international_public_enabled`, `international_purchases_enabled`) |
| **RPC grants auditados** | **PASS** | `REVOKE ALL ... FROM PUBLIC`; `GRANT EXECUTE ... TO anon, authenticated` |
| **Tabla admin sigue protegida** | **PASS** | Direct SELECT anónimo a `international_sync_settings` retorna 0 filas vía RLS |
| **RLS intacto** | **PASS** | RLS activo y restrictivo a administradores |
| **Tests** | **PASS** | 62 test files / 579 tests pasando (100% pass) |
| **Build** | **PASS** | Compilado exitoso en 5.82s |
| **Typecheck** | **PASS** | `tsc --noEmit` exitoso con 0 errores |

---

## 3. Reporte de Auditoría RPC (get_international_public_status)

```text
Function:
public.get_international_public_status()

Security:
SECURITY DEFINER

Search Path:
SET search_path = public

EXECUTE:
PUBLIC = NO (REVOKED)
anon = YES
authenticated = YES

Return fields:
- international_public_enabled (boolean)
- international_purchases_enabled (boolean)

Zero secrets leaked:
- NO API keys
- NO provider secrets
- NO margin / markup percentages
- NO tax rates
- NO financial credentials

Underlying table direct anon access:
BLOCKED (Table international_sync_settings protected by RLS; anon SELECT returns 0 rows)
```

---

## 4. Estado de Certificación Final

```text
PERFORMANCE_CERTIFIED: YES
SEO_CRAWLERS_CERTIFIED: YES
SOCIAL_PREVIEW_CERTIFIED: YES
PUBLIC_RPC_HARDENED: YES

COLLECTIBLES_2026_PERFORMANCE_FINAL_CERTIFIED
```

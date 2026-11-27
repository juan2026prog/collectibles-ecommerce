-- ============================================================================
-- COLLECTIBLES 2026 — SURGICAL & REVERSIBLE PRODUCTION SQL REMEDIATION
-- File: supabase/manual_remediation/20261126_domain_migration_com_uy.sql
-- Target Project: cobtsgkwcftvexaarwmo (Production) — DO NOT AUTO-EXECUTE
-- Purpose: Remediate stored references to untrusted third-party domain
--          collectibles.uy while preserving social handles, historical logs,
--          accepted legal contracts, and secret fields.
-- ============================================================================
-- SECURITY NOTE:
-- 1. Zero API keys, tokens, secrets, or customer PII are included in this script.
-- 2. Every UPDATE filters by BOTH exact primary key AND expected previous value.
-- 3. Safe rollback NEVER restores trust, URLs, or traffic to collectibles.uy;
--    if rollback of domain cutover is ever required, fallback uses the verified
--    first-party backup domain https://collectibles-ecommerce.vercel.app.
-- ============================================================================

-- ============================================================================
-- BLOCK A — MANDATORY DOMAIN REMEDIATION (EXECUTE DURING RELEASE WINDOW)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A.0 Home Hero Banners Pointing to Legacy Domain (AUD-007 — P0 CRITICAL)
-- Table: public.banners
-- Record IDs:
--   - 316eae0d-ee47-41fa-8489-a3a22dfc4391 ("99 Sombras en el bosque", is_active = true)
--     'https://collectibles.uy/collection/99-noches-en-el-bosque' -> '/collection/99-noches-en-el-bosque'
--   - aaae3686-fd7b-4b35-bca0-d6218cfd32d0 ("SONIC Y MINECRAFT", is_active = true)
--     'https://collectibles.uy/collection/minecraft' -> '/collection/minecraft'
--   - cab5516b-59a4-477e-b18c-c0d717182e79 ("20% DTO EN SELECCIONADOS", is_active = false)
--     'https://collectibles.uy/collection/20--dto-dia-del-nio' -> '/collection/20--dto-dia-del-nio'
-- Note: Relative internal routes work across collectibles.com.uy, www, and Vercel backup!
-- ----------------------------------------------------------------------------

-- [1] PRE-CHECK SELECT
SELECT id, title, is_active, link_url
FROM public.banners
WHERE id IN (
  '316eae0d-ee47-41fa-8489-a3a22dfc4391',
  'aaae3686-fd7b-4b35-bca0-d6218cfd32d0',
  'cab5516b-59a4-477e-b18c-c0d717182e79'
);

-- [2] SURGICAL UPDATES (Exact ID + Exact Previous link_url)
BEGIN;

UPDATE public.banners
SET link_url = '/collection/99-noches-en-el-bosque'
WHERE id = '316eae0d-ee47-41fa-8489-a3a22dfc4391'
  AND link_url = 'https://collectibles.uy/collection/99-noches-en-el-bosque';

UPDATE public.banners
SET link_url = '/collection/minecraft'
WHERE id = 'aaae3686-fd7b-4b35-bca0-d6218cfd32d0'
  AND link_url = 'https://collectibles.uy/collection/minecraft';

UPDATE public.banners
SET link_url = '/collection/20--dto-dia-del-nio'
WHERE id = 'cab5516b-59a4-477e-b18c-c0d717182e79'
  AND link_url = 'https://collectibles.uy/collection/20--dto-dia-del-nio';

-- [3] POST-VALIDATION SELECT (Expect 0 rows with collectibles.uy in public.banners)
SELECT id, title, is_active, link_url
FROM public.banners
WHERE id IN (
  '316eae0d-ee47-41fa-8489-a3a22dfc4391',
  'aaae3686-fd7b-4b35-bca0-d6218cfd32d0',
  'cab5516b-59a4-477e-b18c-c0d717182e79'
);

SELECT count(*) AS remaining_legacy_banners
FROM public.banners
WHERE link_url ILIKE '%collectibles.uy%';

COMMIT;

-- [4] SAFE ROLLBACK (Relative paths are already domain-agnostic across collectibles.com.uy
--     and https://collectibles-ecommerce.vercel.app; NEVER revert to collectibles.uy!)

-- ----------------------------------------------------------------------------
-- A.1 Handy Payment Provider Stored Site URL (AUD-025)
-- Table: public.payment_providers
-- Record ID: f247d0be-1f39-4836-9e35-fca418d8a4a1 (provider_key = 'handy')
-- Previous Value: config->>'site_url' = 'https://collectibles.uy'
-- New Value:      config->>'site_url' = 'https://collectibles.com.uy'
-- Note: Uses jsonb_set on '{site_url}' only; credentials/secrets remain untouched.
-- ----------------------------------------------------------------------------

-- [1] PRE-CHECK SELECT
SELECT
  id,
  provider_key,
  environment,
  config->>'site_url' AS current_site_url,
  config->>'callback_url' AS current_callback_url,
  config->>'default_image_url' AS current_default_image_url
FROM public.payment_providers
WHERE id = 'f247d0be-1f39-4836-9e35-fca418d8a4a1'
  AND provider_key = 'handy';

-- [2] SURGICAL UPDATE
BEGIN;

UPDATE public.payment_providers
SET
  config = jsonb_set(config, '{site_url}', '"https://collectibles.com.uy"'::jsonb, true),
  updated_at = now()
WHERE id = 'f247d0be-1f39-4836-9e35-fca418d8a4a1'
  AND provider_key = 'handy'
  AND config->>'site_url' = 'https://collectibles.uy';

-- [3] POST-VALIDATION SELECT (Expect current_site_url = 'https://collectibles.com.uy')
SELECT
  id,
  provider_key,
  config->>'site_url' AS updated_site_url,
  updated_at
FROM public.payment_providers
WHERE id = 'f247d0be-1f39-4836-9e35-fca418d8a4a1'
  AND provider_key = 'handy';

COMMIT;

-- [4] SAFE ROLLBACK (Fallback to verified Vercel backup domain — NEVER collectibles.uy)
-- UPDATE public.payment_providers
-- SET config = jsonb_set(config, '{site_url}', '"https://collectibles-ecommerce.vercel.app"'::jsonb, true),
--     updated_at = now()
-- WHERE id = 'f247d0be-1f39-4836-9e35-fca418d8a4a1'
--   AND provider_key = 'handy'
--   AND config->>'site_url' = 'https://collectibles.com.uy';


-- ----------------------------------------------------------------------------
-- A.2 Product Images Pointing to Legacy Domain (AUD-052)
-- Table: public.product_images
-- Record IDs:
--   - 9b2fc489-037d-4f60-bd4f-d4bdfc8df97d (product_id: 7f1e43d9-4f58-4a40-8768-6c56e18a0ee5)
--   - 910b95ad-2703-4936-b5f3-78961bc1c469 (product_id: 84fbb028-8987-4b9f-b34c-06d3277cbe4d)
-- Previous Value: 'https://collectibles.uy/images/collectibles-logo-official.png'
-- New Value:      'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg'
-- ----------------------------------------------------------------------------

-- [1] PRE-CHECK SELECT
SELECT id, product_id, url, is_primary
FROM public.product_images
WHERE id IN (
  '9b2fc489-037d-4f60-bd4f-d4bdfc8df97d',
  '910b95ad-2703-4936-b5f3-78961bc1c469'
);

-- [2] SURGICAL UPDATE
BEGIN;

UPDATE public.product_images
SET url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg'
WHERE id IN (
  '9b2fc489-037d-4f60-bd4f-d4bdfc8df97d',
  '910b95ad-2703-4936-b5f3-78961bc1c469'
)
  AND url = 'https://collectibles.uy/images/collectibles-logo-official.png';

-- [3] POST-VALIDATION SELECT (Expect 0 rows with collectibles.uy across public.product_images)
SELECT id, product_id, url
FROM public.product_images
WHERE id IN (
  '9b2fc489-037d-4f60-bd4f-d4bdfc8df97d',
  '910b95ad-2703-4936-b5f3-78961bc1c469'
);

SELECT count(*) AS remaining_legacy_product_images
FROM public.product_images
WHERE url ILIKE '%collectibles.uy%';

COMMIT;

-- [4] SAFE ROLLBACK (First-party Supabase Storage asset is already canonical and domain-neutral;
--     never revert to collectibles.uy)


-- ----------------------------------------------------------------------------
-- A.3 Canonical Site URL Setting in public.site_settings (AUD-046)
-- Table: public.site_settings
-- Key: 'seo_site_url'
-- Note: Preserves 'social_instagram_url' = 'collectibles.uy' untouched!
-- ----------------------------------------------------------------------------

-- [1] PRE-CHECK SELECT
SELECT key, value
FROM public.site_settings
WHERE key IN ('seo_site_url', 'social_instagram_url');

-- [2] SURGICAL UPSERT / UPDATE
BEGIN;

INSERT INTO public.site_settings (key, value)
VALUES ('seo_site_url', 'https://collectibles.com.uy')
ON CONFLICT (key) DO UPDATE
SET value = 'https://collectibles.com.uy'
WHERE public.site_settings.value IS NULL
   OR public.site_settings.value = ''
   OR public.site_settings.value ILIKE '%collectibles.uy%';

-- [3] POST-VALIDATION SELECT
SELECT key, value
FROM public.site_settings
WHERE key IN ('seo_site_url', 'social_instagram_url');

COMMIT;

-- [4] SAFE ROLLBACK
-- UPDATE public.site_settings
-- SET value = 'https://collectibles-ecommerce.vercel.app'
-- WHERE key = 'seo_site_url'
--   AND value = 'https://collectibles.com.uy';


-- ============================================================================
-- BLOCK B — SEPARATE OWNER DECISION BLOCKS (DO NOT RUN WITHOUT EXPLICIT OK)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B.1 [OPTIONAL — REQUIRES EXPLICIT OWNER APPROVAL]
-- Unpublish QA Test Product Fixture ($75 UYU) from Public Storefront (AUD-052)
-- Table: public.products
-- Record ID: 7f1e43d9-4f58-4a40-8768-6c56e18a0ee5 (slug: 'producto-prueba-collectibles')
-- Context: Used in 14 historical QA/certification order_items; currently
--          is_active = true and status = 'published'. Does NOT delete history.
-- ----------------------------------------------------------------------------

-- [1] PRE-CHECK SELECT
SELECT id, slug, title, base_price, is_active, status
FROM public.products
WHERE id = '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5';

-- [2] SURGICAL UPDATE (Uncomment ONLY after owner confirms hiding QA product)
-- BEGIN;
-- UPDATE public.products
-- SET is_active = false,
--     status = 'draft',
--     updated_at = now()
-- WHERE id = '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5'
--   AND slug = 'producto-prueba-collectibles'
--   AND is_active = true;
-- COMMIT;

-- [3] ROLLBACK (If QA test fixture needs to be re-enabled temporarily)
-- UPDATE public.products
-- SET is_active = true,
--     status = 'published',
--     updated_at = now()
-- WHERE id = '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5'
--   AND slug = 'producto-prueba-collectibles';


-- ----------------------------------------------------------------------------
-- B.2 [OPTIONAL — REQUIRES EXPLICIT OWNER APPROVAL]
-- Clean Malformed Duplicate Meta Pixel (2487606138177497) in appearance_head_code (AUD-054)
-- Tables: public.site_settings & public.public_site_config
-- Key: 'appearance_head_code'
-- Context: Official Meta Pixel 1623445247816011 is already initialized in
--          frontend/index.html. 'appearance_head_code' currently holds a
--          malformed snippet ("</head>\n---other website code---...") with a
--          secondary Pixel ID 2487606138177497.
-- ----------------------------------------------------------------------------

-- [1] PRE-CHECK SELECT
SELECT 'site_settings' AS source_table, key, value
FROM public.site_settings
WHERE key = 'appearance_head_code'
UNION ALL
SELECT 'public_site_config' AS source_table, key, value
FROM public.public_site_config
WHERE key = 'appearance_head_code';

-- [2] SURGICAL UPDATE (Uncomment ONLY if owner confirms Pixel 2487606138177497 is obsolete)
-- BEGIN;
-- UPDATE public.site_settings
-- SET value = ''
-- WHERE key = 'appearance_head_code'
--   AND value LIKE '%2487606138177497%';
--
-- UPDATE public.public_site_config
-- SET value = ''
-- WHERE key = 'appearance_head_code'
--   AND value LIKE '%2487606138177497%';
-- COMMIT;


-- ============================================================================
-- BLOCK C — PRESERVED RECORDS (INTENTIONALLY NOT MODIFIED)
-- ============================================================================
-- 1. public.site_settings / public.public_site_config ('social_instagram_url' = 'collectibles.uy')
--    -> Official Instagram account handle (https://instagram.com/collectibles.uy).
-- 2. public.legal_documents (id = '864f0228-7068-440a-a73a-44da4d5b7a98', document_type = 'vendor_terms', version = '1.0')
--    -> Historical accepted legal contract version. Never mutate accepted versions in-place;
--       publish a new version row if marketplace onboarding is enabled in the future.
-- 3. Historical executed SQL migrations under supabase/migrations/*.sql
--    -> Preserved intact per migration immutability policy.

-- ==============================================================================
-- MIGRATION: External Product Interest, Minimal Wishlist & Interest-Based Promotion
-- Applied: 2026-10-07 (Timestamp: 20271007000000)
-- Description:
--   1. Ultra-lightweight table `external_product_interest` (stores aggregate metrics only, NO catalog payloads)
--   2. Minimal relation table `user_external_wishlist` (user_id + provider + external_product_id)
--   3. Configurable promotion settings (auto_promote_external_interest, wishlist_promotion_threshold)
--   4. Atomic idempotent RPC functions:
--      - record_external_product_view() with temporal debounce
--      - toggle_external_product_wishlist()
--      - check_and_promote_external_interest()
--   5. Strict Row-Level Security (RLS)
-- ==============================================================================

-- 1. Table: external_product_interest (ultra-lightweight aggregate metrics)
CREATE TABLE IF NOT EXISTS public.external_product_interest (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    provider text NOT NULL DEFAULT 'amazon',
    external_product_id text NOT NULL,
    wishlist_count integer NOT NULL DEFAULT 0,
    view_count integer NOT NULL DEFAULT 0,
    promoted_to_catalog boolean NOT NULL DEFAULT false,
    promoted_at timestamptz,
    last_seen_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT uq_external_product_interest UNIQUE (provider, external_product_id)
);

-- Index for interest queries
CREATE INDEX IF NOT EXISTS idx_ext_prod_interest_lookup 
ON public.external_product_interest (provider, external_product_id);

CREATE INDEX IF NOT EXISTS idx_ext_prod_interest_wishlist_count 
ON public.external_product_interest (wishlist_count DESC)
WHERE promoted_to_catalog = false;

-- 2. Table: user_external_wishlist (minimal user reference)
CREATE TABLE IF NOT EXISTS public.user_external_wishlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'amazon',
    external_product_id text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT uq_user_external_wishlist UNIQUE (user_id, provider, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ext_wishlist_user 
ON public.user_external_wishlist (user_id);

CREATE INDEX IF NOT EXISTS idx_user_ext_wishlist_product 
ON public.user_external_wishlist (provider, external_product_id);

-- 3. Enable RLS
ALTER TABLE public.external_product_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_external_wishlist ENABLE ROW LEVEL SECURITY;

-- Policies for user_external_wishlist
DROP POLICY IF EXISTS "Users manage own external wishlist" ON public.user_external_wishlist;
CREATE POLICY "Users manage own external wishlist"
ON public.user_external_wishlist
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all external wishlists" ON public.user_external_wishlist;
CREATE POLICY "Admins view all external wishlists"
ON public.user_external_wishlist
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Policies for external_product_interest
DROP POLICY IF EXISTS "Anyone can read external product interest" ON public.external_product_interest;
CREATE POLICY "Anyone can read external product interest"
ON public.external_product_interest
FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Admins manage external product interest" ON public.external_product_interest;
CREATE POLICY "Admins manage external product interest"
ON public.external_product_interest
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Extend international_sync_settings with promotion threshold configuration
ALTER TABLE public.international_sync_settings
ADD COLUMN IF NOT EXISTS auto_promote_external_interest boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS wishlist_promotion_threshold integer NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS view_promotion_threshold integer DEFAULT NULL;

-- 5. Atomic RPC: record_external_product_view
-- Increment view_count with a temporal cooldown (e.g. 30s) per caller or general safe throttle
CREATE OR REPLACE FUNCTION public.record_external_product_view(
    p_provider text,
    p_external_product_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_external_product_id IS NULL OR TRIM(p_external_product_id) = '' THEN
        RETURN;
    END IF;

    INSERT INTO public.external_product_interest (
        provider,
        external_product_id,
        view_count,
        last_seen_at,
        updated_at
    )
    VALUES (
        LOWER(TRIM(p_provider)),
        UPPER(TRIM(p_external_product_id)),
        1,
        now(),
        now()
    )
    ON CONFLICT (provider, external_product_id)
    DO UPDATE SET
        view_count = external_product_interest.view_count + 1,
        last_seen_at = now(),
        updated_at = now()
    WHERE external_product_interest.last_seen_at < now() - INTERVAL '10 seconds';
END;
$$;

-- 6. Atomic RPC: toggle_external_product_wishlist
-- Toggles the wishlist entry for authenticated user and synchronizes aggregate count
CREATE OR REPLACE FUNCTION public.toggle_external_product_wishlist(
    p_provider text,
    p_external_product_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_provider text;
    v_ext_id text;
    v_is_added boolean;
    v_new_count integer;
    v_threshold integer;
    v_auto_promote boolean;
    v_should_promote boolean := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to modify wishlist';
    END IF;

    v_provider := LOWER(TRIM(COALESCE(p_provider, 'amazon')));
    v_ext_id := UPPER(TRIM(p_external_product_id));

    IF v_ext_id IS NULL OR v_ext_id = '' THEN
        RAISE EXCEPTION 'External product ID is required';
    END IF;

    -- Check if already wishlisted
    IF EXISTS (
        SELECT 1 FROM public.user_external_wishlist
        WHERE user_id = v_user_id AND provider = v_provider AND external_product_id = v_ext_id
    ) THEN
        -- Remove from wishlist
        DELETE FROM public.user_external_wishlist
        WHERE user_id = v_user_id AND provider = v_provider AND external_product_id = v_ext_id;
        v_is_added := false;
    ELSE
        -- Insert into wishlist
        INSERT INTO public.user_external_wishlist (user_id, provider, external_product_id)
        VALUES (v_user_id, v_provider, v_ext_id)
        ON CONFLICT (user_id, provider, external_product_id) DO NOTHING;
        v_is_added := true;
    END IF;

    -- Recalculate exact count for single source of truth
    SELECT COUNT(*) INTO v_new_count
    FROM public.user_external_wishlist
    WHERE provider = v_provider AND external_product_id = v_ext_id;

    -- Upsert aggregate interest row
    INSERT INTO public.external_product_interest (
        provider,
        external_product_id,
        wishlist_count,
        last_seen_at,
        updated_at
    )
    VALUES (
        v_provider,
        v_ext_id,
        v_new_count,
        now(),
        now()
    )
    ON CONFLICT (provider, external_product_id)
    DO UPDATE SET
        wishlist_count = v_new_count,
        last_seen_at = now(),
        updated_at = now();

    -- Read sync settings for promotion threshold
    SELECT 
        COALESCE(auto_promote_external_interest, false),
        COALESCE(wishlist_promotion_threshold, 10)
    INTO v_auto_promote, v_threshold
    FROM public.international_sync_settings
    WHERE id = 1;

    -- Evaluate promotion requirement
    IF v_auto_promote AND v_new_count >= v_threshold THEN
        -- Verify not already in international_products
        IF NOT EXISTS (
            SELECT 1 FROM public.international_products
            WHERE external_product_id = v_ext_id
        ) THEN
            v_should_promote := true;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'is_added', v_is_added,
        'wishlist_count', v_new_count,
        'should_promote', v_should_promote,
        'external_product_id', v_ext_id,
        'provider', v_provider
    );
END;
$$;

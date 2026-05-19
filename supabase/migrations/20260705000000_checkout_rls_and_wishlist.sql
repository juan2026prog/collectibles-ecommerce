-- Harden checkout-related access and add missing wishlist support.

DROP POLICY IF EXISTS "Public order creation" ON public.orders;
DROP POLICY IF EXISTS "Public order read" ON public.orders;
DROP POLICY IF EXISTS "Public items creation" ON public.order_items;
DROP POLICY IF EXISTS "Public items read" ON public.order_items;

CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wishlist" ON public.wishlists;
CREATE POLICY "Users can view own wishlist" ON public.wishlists
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wishlist" ON public.wishlists;
CREATE POLICY "Users can insert own wishlist" ON public.wishlists
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own wishlist" ON public.wishlists;
CREATE POLICY "Users can delete own wishlist" ON public.wishlists
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_created_at
  ON public.wishlists(user_id, created_at DESC);

INSERT INTO public.site_settings (key, value)
VALUES ('payments_dlocal_go_x_login', '')
ON CONFLICT (key) DO NOTHING;

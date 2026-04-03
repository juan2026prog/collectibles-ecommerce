-- Final fix for checkout RLS policies
-- 1. Enable insert for orders and order_items for all users (anon and authenticated)
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public order creation" ON public.orders;
CREATE POLICY "Public order creation" ON public.orders
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Public order read" ON public.orders;
CREATE POLICY "Public order read" ON public.orders
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public items creation" ON public.order_items;
CREATE POLICY "Public items creation" ON public.order_items
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Public items read" ON public.order_items;
CREATE POLICY "Public items read" ON public.order_items
FOR SELECT TO anon, authenticated
USING (true);

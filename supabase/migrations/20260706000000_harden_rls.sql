-- Harden RLS for orders and order_items
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Public order creation" ON public.orders;
DROP POLICY IF EXISTS "Public order read" ON public.orders;
DROP POLICY IF EXISTS "Public items creation" ON public.order_items;
DROP POLICY IF EXISTS "Public items read" ON public.order_items;

-- 1. Orders: Only the owner or an admin can read
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Admins can view all orders" ON public.orders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- 2. Order Items: Only the owner of the parent order or an admin can read
CREATE POLICY "Users can view own order items" ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
    OR
    vendor_id = auth.uid()
  );

CREATE POLICY "Admins can view all order items" ON public.order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- 3. Anonymous users cannot read orders directly. 
-- They must use the confirm-payment function which uses service_role to verify by email.

-- 4. Ensure site_settings has keys for dLocal signature
INSERT INTO public.site_settings (key, value)
VALUES 
  ('payments_dlocal_go_secret_key', ''),
  ('payments_dlocal_go_x_login', '')
ON CONFLICT (key) DO NOTHING;

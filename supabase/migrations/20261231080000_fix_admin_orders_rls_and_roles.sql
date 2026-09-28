-- Migration: 20261231080000_fix_admin_orders_rls_and_roles.sql
-- Description: Ensures all users with super_admin/admin/god_admin role have is_admin = true in profiles, and updates RLS policies to use is_admin()

-- 1. Sync is_admin flag in public.profiles for all admin roles
UPDATE public.profiles
SET is_admin = true
WHERE id IN (
  SELECT user_id FROM public.user_roles WHERE role IN ('god_admin', 'admin', 'super_admin')
);

-- 2. Update RLS policies on orders to use is_admin()
DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
CREATE POLICY "orders_admin_all" ON public.orders
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 3. Update RLS policies on order_suborders to use is_admin()
DROP POLICY IF EXISTS "Admins manage all suborders" ON public.order_suborders;
CREATE POLICY "Admins manage all suborders" ON public.order_suborders
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 4. Update RLS policies on order_items to use is_admin()
DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
CREATE POLICY "order_items_admin_all" ON public.order_items
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 5. Update RLS policies on shipments to use is_admin()
DROP POLICY IF EXISTS "Admins manage shipments" ON public.shipments;
CREATE POLICY "Admins manage shipments" ON public.shipments
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 6. Update RLS policies on payment_attempts and payment_events to use is_admin()
DROP POLICY IF EXISTS "Admins full access payment_attempts" ON public.payment_attempts;
CREATE POLICY "Admins full access payment_attempts" ON public.payment_attempts
FOR ALL TO authenticated
USING (is_admin() OR (current_setting('role', true) = 'service_role'))
WITH CHECK (is_admin() OR (current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "Admins full access payment_events" ON public.payment_events;
CREATE POLICY "Admins full access payment_events" ON public.payment_events
FOR ALL TO authenticated
USING (is_admin() OR (current_setting('role', true) = 'service_role'))
WITH CHECK (is_admin() OR (current_setting('role', true) = 'service_role'));

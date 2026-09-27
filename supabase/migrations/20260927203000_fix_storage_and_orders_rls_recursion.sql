-- ==============================================================================
-- MIGRATION: Fix RLS Mutual Recursion on Orders, Suborders & Storage Objects
-- Eliminates error 42P17 (infinite recursion detected in policy for relation "order_suborders")
-- ==============================================================================

-- 1. Helper security definer functions to evaluate relations without triggering recursive RLS
CREATE OR REPLACE FUNCTION public.is_order_vendor(p_order_id uuid, p_vendor_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.order_suborders
    WHERE parent_order_id = p_order_id AND vendor_id = p_vendor_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_order_customer(p_order_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND (customer_id = p_customer_id OR user_id = p_customer_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_shipping_label_as_customer(p_name text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shipments s
    JOIN public.orders o ON s.order_id = o.id
    WHERE (o.customer_id = p_user_id OR o.user_id = p_user_id)
      AND (s.label_storage_path = p_name OR s.shipping_label_url LIKE '%' || p_name || '%')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_shipping_label_as_vendor(p_name text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (storage.foldername(p_name))[1] = p_user_id::text
    OR (storage.foldername(p_name))[2] = p_user_id::text
    OR EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.order_suborders os ON s.suborder_id = os.id
      WHERE os.vendor_id = p_user_id
        AND (s.label_storage_path = p_name OR s.shipping_label_url LIKE '%' || p_name || '%')
    )
  );
$$;

-- 2. Update orders and order_suborders policies
DROP POLICY IF EXISTS "orders_select_vendor" ON public.orders;
CREATE POLICY "orders_select_vendor" ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.is_order_vendor(id, auth.uid()));

DROP POLICY IF EXISTS "Customers can view their own suborders" ON public.order_suborders;
CREATE POLICY "Customers can view their own suborders" ON public.order_suborders
  FOR SELECT
  TO authenticated
  USING (public.is_order_customer(parent_order_id, auth.uid()));

-- 3. Update storage.objects shipping labels policies
DROP POLICY IF EXISTS "shipping_labels_customer_select" ON storage.objects;
CREATE POLICY "shipping_labels_customer_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'shipping-labels'
    AND public.can_access_shipping_label_as_customer(name, auth.uid())
  );

DROP POLICY IF EXISTS "shipping_labels_vendor_access" ON storage.objects;
CREATE POLICY "shipping_labels_vendor_access" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'shipping-labels'
    AND public.can_access_shipping_label_as_vendor(name, auth.uid())
  );

-- ══════════════════════════════════════════════════════════════
-- MARKETPLACE P2: Shipments to Suborders relation
-- ══════════════════════════════════════════════════════════════

-- 1. Add suborder_id to shipments
ALTER TABLE public.shipments 
  ADD COLUMN IF NOT EXISTS suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE CASCADE;

-- 2. Update RLS policies to allow users to view shipments related to their suborders
DROP POLICY IF EXISTS "Users view own shipments" ON public.shipments;
CREATE POLICY "Users view own shipments" ON public.shipments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = shipments.order_id
      AND orders.customer_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.order_suborders
      JOIN public.orders ON orders.id = order_suborders.parent_order_id
      WHERE order_suborders.id = shipments.suborder_id
      AND orders.customer_id = auth.uid()
    )
  );

-- 3. Add policy to let Vendors view their own shipments
DROP POLICY IF EXISTS "Vendors view own shipments" ON public.shipments;
CREATE POLICY "Vendors view own shipments" ON public.shipments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_suborders
      WHERE order_suborders.id = shipments.suborder_id
      AND order_suborders.vendor_id = auth.uid()
    )
  );

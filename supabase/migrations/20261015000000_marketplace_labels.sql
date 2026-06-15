-- Migration: Marketplace Professional Labels System
-- Date: 2026-06-15

-- 1. Extend public.shipments table with required columns
ALTER TABLE public.shipments 
  ADD COLUMN IF NOT EXISTS label_type TEXT,
  ADD COLUMN IF NOT EXISTS internal_label_url TEXT,
  ADD COLUMN IF NOT EXISTS packing_slip_url TEXT,
  ADD COLUMN IF NOT EXISTS label_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS label_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS barcode_value TEXT,
  ADD COLUMN IF NOT EXISTS qr_value TEXT;

-- 2. Update RLS policies to let Vendors view, insert, and update their own shipments (linked to their suborders)
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

DROP POLICY IF EXISTS "Vendors manage own shipments" ON public.shipments;
CREATE POLICY "Vendors manage own shipments" ON public.shipments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_suborders
      WHERE order_suborders.id = shipments.suborder_id
      AND order_suborders.vendor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_suborders
      WHERE order_suborders.id = shipments.suborder_id
      AND order_suborders.vendor_id = auth.uid()
    )
  );

-- 3. Add RLS policy for authenticated users (like edge functions/checkout) to insert shipments
DROP POLICY IF EXISTS "Authenticated users create shipments" ON public.shipments;
CREATE POLICY "Authenticated users create shipments" ON public.shipments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

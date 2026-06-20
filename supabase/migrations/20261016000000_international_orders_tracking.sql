-- Migration: International Orders and Tracking
-- Date: 2026-06-15

CREATE TABLE IF NOT EXISTS public.international_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE UNIQUE,
    zinc_order_id text,
    zinc_request_payload jsonb,
    zinc_response_payload jsonb,
    purchase_status text DEFAULT 'pending_purchase', -- pending_purchase, zinc_order_created, zinc_processing, purchased, shipped_to_courier, delivered_to_courier, manual_review, zinc_failed, cancelled
    tracking_number text,
    tracking_url text,
    carrier text,
    estimated_delivery_to_courier timestamptz,
    delivered_to_courier_at timestamptz,
    last_zinc_status_check_at timestamptz,
    zinc_error_message text,
    expected_profit_usd numeric(10,2),
    final_price_usd numeric(10,2),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.international_order_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Admins manage international_order_items" ON public.international_order_items;
CREATE POLICY "Admins manage international_order_items" ON public.international_order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Customers view own international_order_items" ON public.international_order_items;
CREATE POLICY "Customers view own international_order_items" ON public.international_order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items
      JOIN public.orders ON orders.id = order_items.order_id
      WHERE order_items.id = international_order_items.order_item_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Setup pg_cron for the background order tracking sync
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zinc-sync-order-tracking-job') THEN
        PERFORM cron.unschedule('zinc-sync-order-tracking-job');
    END IF;
END $$;

SELECT cron.schedule(
    'zinc-sync-order-tracking-job',
    '*/30 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-sync-order-tracking',
        headers := '{"Content-Type": "application/json", "x-zinc-sync-bypass": "collectibles-zinc-sync-secret"}'::jsonb
    );
    $$
);

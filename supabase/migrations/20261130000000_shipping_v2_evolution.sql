-- Migration: Shipping V2 - Logistics Engine Evolution
-- Date: 2026-06-29

-- 1. Create shipping_queue table
CREATE TABLE IF NOT EXISTS public.shipping_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL,
  provider_code text NOT NULL,
  action text NOT NULL DEFAULT 'create_shipment',
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'retrying', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Enable RLS on shipping_queue
ALTER TABLE public.shipping_queue ENABLE ROW LEVEL SECURITY;

-- Admins can do everything on shipping_queue
DROP POLICY IF EXISTS "Admins manage shipping_queue" ON public.shipping_queue;
CREATE POLICY "Admins manage shipping_queue" ON public.shipping_queue
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- 2. Create shipment_events table
CREATE TABLE IF NOT EXISTS public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL,
  event_type text NOT NULL,
  description text,
  provider_status text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text DEFAULT 'system'
);

-- Enable RLS on shipment_events
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view events (so vendors and clients can track packages)
DROP POLICY IF EXISTS "Anyone authenticated can view shipment_events" ON public.shipment_events;
CREATE POLICY "Anyone authenticated can view shipment_events" ON public.shipment_events
  FOR SELECT TO authenticated USING (true);

-- Admins / system can manage
DROP POLICY IF EXISTS "Admins manage shipment_events" ON public.shipment_events;
CREATE POLICY "Admins manage shipment_events" ON public.shipment_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- 3. Create logistics_rules table (Generic logistics rules engine)
CREATE TABLE IF NOT EXISTS public.logistics_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL CHECK (trigger_event IN ('checkout_rate', 'shipment_routing')),
  priority integer NOT NULL DEFAULT 0,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on logistics_rules
ALTER TABLE public.logistics_rules ENABLE ROW LEVEL SECURITY;

-- Admins manage logistics_rules
DROP POLICY IF EXISTS "Admins manage logistics_rules" ON public.logistics_rules;
CREATE POLICY "Admins manage logistics_rules" ON public.logistics_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Anyone can view rules
DROP POLICY IF EXISTS "Anyone can view rules" ON public.logistics_rules;
CREATE POLICY "Anyone can view rules" ON public.logistics_rules
  FOR SELECT TO authenticated USING (true);

-- 4. Create shipping_monitor table
CREATE TABLE IF NOT EXISTS public.shipping_monitor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL UNIQUE,
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  latency_ms integer NOT NULL DEFAULT 0,
  request_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'offline')),
  rate_limit_hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on shipping_monitor
ALTER TABLE public.shipping_monitor ENABLE ROW LEVEL SECURITY;

-- Admins manage shipping_monitor
DROP POLICY IF EXISTS "Admins manage shipping_monitor" ON public.shipping_monitor;
CREATE POLICY "Admins manage shipping_monitor" ON public.shipping_monitor
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Anyone can view monitor
DROP POLICY IF EXISTS "Anyone can view monitor" ON public.shipping_monitor;
CREATE POLICY "Anyone can view monitor" ON public.shipping_monitor
  FOR SELECT TO authenticated USING (true);

-- Seed initial monitors
INSERT INTO public.shipping_monitor (provider_code, status) VALUES
('dac', 'active'),
('soydelivery', 'active'),
('ues', 'offline'),
('correo_uruguayo', 'offline')
ON CONFLICT (provider_code) DO NOTHING;

-- 5. Extend shipping_providers with capability flags
ALTER TABLE public.shipping_providers 
  ADD COLUMN IF NOT EXISTS supports_webhooks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_returns boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_cancel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_manifest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_multi_package boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_insurance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_cod boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_signature boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_pickup_points boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_saturday_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_international boolean NOT NULL DEFAULT false;

-- Update capability flags for seeded providers
UPDATE public.shipping_providers SET
  supports_multi_package = true,
  supports_cancel = true,
  supports_pickup_points = true
WHERE code = 'dac';

UPDATE public.shipping_providers SET
  supports_cancel = true
WHERE code = 'soydelivery';

UPDATE public.shipping_providers SET
  supports_pickup_points = true
WHERE code = 'pickup';

-- 6. Extend shipments table with multi-package and SLA metrics
ALTER TABLE public.shipments 
  ADD COLUMN IF NOT EXISTS package_volume numeric,
  ADD COLUMN IF NOT EXISTS package_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_packages integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS guide_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 7. Seed initial shipping rules
INSERT INTO public.logistics_rules (name, description, trigger_event, priority, conditions, actions) VALUES
('Peso límite SoyDelivery', 'Evita SoyDelivery si el peso total supera 20 kg', 'checkout_rate', 10, 
  '[{"field": "total_weight", "operator": ">", "value": 20}]'::jsonb,
  '[{"type": "exclude_provider", "value": "soydelivery"}]'::jsonb),
('Flex solo Montevideo', 'Evita Flex/SoyDelivery si el destino es del interior', 'checkout_rate', 20,
  '[{"field": "destination_department", "operator": "!=", "value": "Montevideo"}]'::jsonb,
  '[{"type": "exclude_provider", "value": "soydelivery"}]'::jsonb)
ON CONFLICT DO NOTHING;

-- 8. Create queue locker RPC function
CREATE OR REPLACE FUNCTION public.lock_shipping_queue_items(limit_count integer)
RETURNS SETOF public.shipping_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.shipping_queue
  SET status = 'processing', processed_at = now()
  WHERE id IN (
    SELECT id 
    FROM public.shipping_queue
    WHERE (status = 'queued' OR status = 'retrying') AND next_attempt_at <= now()
    ORDER BY priority DESC, created_at ASC
    LIMIT limit_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

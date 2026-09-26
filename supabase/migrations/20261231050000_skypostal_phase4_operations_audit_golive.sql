-- Migration: SkyPostal Phase 4 Super Admin, Operations, Audit Logs, Financial Control & Go-Live Readiness
-- Purpose: Support full operational lifecycle, audit trail of admin actions, financial margin/variance analytics,
--          and explicit Go-Live readiness checklist for international markets.

-- 1. Create skypostal_audit_logs table
CREATE TABLE IF NOT EXISTS public.skypostal_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  actor_email text,
  action text NOT NULL, -- e.g., 'MARKET_ACTIVATION', 'MARKUP_CHANGE', 'RATE_OVERRIDE', 'FUEL_OVERRIDE', 'MANUAL_REVIEW_RESOLVED', 'KILL_SWITCH_TOGGLED'
  entity_type text NOT NULL, -- 'MARKET', 'PRICING', 'RATE_CARD', 'FUEL_RULE', 'SHIPMENT', 'EXCEPTION'
  entity_id text NOT NULL,
  country_code text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.skypostal_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON public.skypostal_audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert audit logs" ON public.skypostal_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 2. Create skypostal_financial_snapshots table
CREATE TABLE IF NOT EXISTS public.skypostal_financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  suborder_id text,
  country_code text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  customer_shipping_charged numeric(10,2) NOT NULL,
  provider_cost_estimated numeric(10,2) NOT NULL,
  provider_cost_real numeric(10,2) NOT NULL,
  gross_profit_estimated numeric(10,2) NOT NULL,
  gross_profit_real numeric(10,2) NOT NULL,
  effective_markup_percent numeric(5,2) NOT NULL,
  effective_margin_percent numeric(5,2) NOT NULL,
  cost_variance_usd numeric(10,2) NOT NULL DEFAULT 0.00,
  is_negative_profit boolean NOT NULL DEFAULT false,
  negative_profit_reason text,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on financial snapshots
ALTER TABLE public.skypostal_financial_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view financial snapshots" ON public.skypostal_financial_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 3. Extend international_markets table to allow READY_FOR_LIVE
ALTER TABLE public.international_markets
  DROP CONSTRAINT IF EXISTS international_markets_market_status_check;

ALTER TABLE public.international_markets
  ADD CONSTRAINT international_markets_market_status_check
  CHECK (market_status IN ('DISABLED', 'PREVIEW', 'SANDBOX', 'READY_FOR_LIVE', 'LIVE'));

-- 4. Update Chile market to READY_FOR_LIVE with certified readiness checklist in metadata
UPDATE public.international_markets
SET
  market_status = 'READY_FOR_LIVE',
  provider_environment = 'test',
  metadata = jsonb_build_object(
    'flag', '🇨🇱',
    'target_tier', 'tier_1',
    'lead_market', true,
    'certification_phase', 'PHASE_4_CERTIFIED',
    'readiness_checklist', jsonb_build_object(
      'compliance_ready', true,
      'rates_ready', true,
      'fuel_ready', true,
      'pricing_ready', true,
      'checkout_ready', true,
      'api_ready', true,
      'tracking_ready', true,
      'security_ready', true,
      'financial_ready', true,
      'e2e_certified', true,
      'kill_switch_available', true
    )
  ),
  updated_at = now()
WHERE country_code = 'CL';

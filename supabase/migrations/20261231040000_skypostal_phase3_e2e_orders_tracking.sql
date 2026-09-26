-- Migration: SkyPostal Phase 3 E2E Orders, Two-Leg Logistics, Manifests & Tracking
-- Purpose: Support end-to-end sandbox operations, two-leg tracking (LEG 1 US Inbound vs LEG 2 SkyPostal),
--          weight updates with cost variance, final fuel recording, and actionable manual review.

-- 1. Extend orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS international_quote_id text,
  ADD COLUMN IF NOT EXISTS logistics_mode text DEFAULT 'IMPORT_HUB',
  ADD COLUMN IF NOT EXISTS destination_country_code text DEFAULT 'UY',
  ADD COLUMN IF NOT EXISTS recipient_tax_id text;

-- 2. Extend order_suborders table
ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS international_quote_id text,
  ADD COLUMN IF NOT EXISTS logistics_mode text DEFAULT 'IMPORT_HUB',
  ADD COLUMN IF NOT EXISTS destination_country_code text DEFAULT 'UY',
  -- Two-Leg Logistics separation
  ADD COLUMN IF NOT EXISTS leg1_retailer_carrier text,
  ADD COLUMN IF NOT EXISTS leg1_retailer_tracking text,
  ADD COLUMN IF NOT EXISTS leg1_status text DEFAULT 'AWAITING_RETAILER'
    CHECK (leg1_status IN ('AWAITING_RETAILER', 'INBOUND_TO_US_HUB', 'RECEIVED_US_HUB')),
  ADD COLUMN IF NOT EXISTS leg2_skypostal_guide text,
  ADD COLUMN IF NOT EXISTS leg2_skypostal_tracking text,
  ADD COLUMN IF NOT EXISTS leg2_status text DEFAULT 'PENDING'
    CHECK (leg2_status IN ('PENDING', 'READY_FOR_SHIPMENT', 'SHIPMENT_CREATED', 'LABEL_CREATED', 'MANIFESTED', 'IN_TRANSIT', 'CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION')),
  -- Measured package details at US hub
  ADD COLUMN IF NOT EXISTS measured_weight_kg numeric(8,3),
  ADD COLUMN IF NOT EXISTS measured_dimensions jsonb,
  ADD COLUMN IF NOT EXISTS weight_source text DEFAULT 'ESTIMATED'
    CHECK (weight_source IN ('CATALOG', 'ESTIMATED', 'MEASURED', 'PROVIDER')),
  -- Cost variance & Fuel tracking
  ADD COLUMN IF NOT EXISTS fuel_estimated_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS fuel_estimated_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS fuel_final_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS fuel_final_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS fuel_final_status text DEFAULT 'ESTIMATED'
    CHECK (fuel_final_status IN ('ESTIMATED', 'FINAL')),
  ADD COLUMN IF NOT EXISTS manifest_id text,
  ADD COLUMN IF NOT EXISTS manifest_date timestamptz,
  -- Action Required / Manual Review
  ADD COLUMN IF NOT EXISTS action_required text DEFAULT 'NONE'
    CHECK (action_required IN ('NONE', 'DOCUMENT_REQUIRED', 'CUSTOMS_INFORMATION_REQUIRED', 'PAYMENT_REQUIRED', 'ADDRESS_CORRECTION_REQUIRED', 'MANUAL_REVIEW')),
  ADD COLUMN IF NOT EXISTS action_required_reason text,
  ADD COLUMN IF NOT EXISTS manual_review_status text DEFAULT 'NONE'
    CHECK (manual_review_status IN ('NONE', 'PENDING', 'RESOLVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS manual_review_reason text,
  ADD COLUMN IF NOT EXISTS manual_review_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_review_resolved_by text;

-- 3. Extend shipments table
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS international_quote_id text,
  ADD COLUMN IF NOT EXISTS leg1_retailer_carrier text,
  ADD COLUMN IF NOT EXISTS leg1_retailer_tracking text,
  ADD COLUMN IF NOT EXISTS leg2_skypostal_guide text,
  ADD COLUMN IF NOT EXISTS leg2_skypostal_tracking text,
  ADD COLUMN IF NOT EXISTS measured_weight_kg numeric(8,3),
  ADD COLUMN IF NOT EXISTS measured_dimensions jsonb,
  ADD COLUMN IF NOT EXISTS weight_source text DEFAULT 'ESTIMATED',
  ADD COLUMN IF NOT EXISTS fuel_estimated_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS fuel_estimated_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS fuel_final_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS fuel_final_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS fuel_final_status text DEFAULT 'ESTIMATED',
  ADD COLUMN IF NOT EXISTS manifest_id text,
  ADD COLUMN IF NOT EXISTS manifest_date timestamptz,
  ADD COLUMN IF NOT EXISTS action_required text DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS action_required_reason text;

-- 4. Manifests Tracking Table
CREATE TABLE IF NOT EXISTS public.skypostal_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id text NOT NULL UNIQUE,
  country_code text NOT NULL,
  provider text NOT NULL DEFAULT 'skypostal',
  provider_environment text NOT NULL DEFAULT 'test',
  shipment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_packages integer NOT NULL DEFAULT 0,
  manifest_url text,
  fuel_index_value numeric(8,4) NOT NULL DEFAULT 2.4500,
  fuel_percentage numeric(5,2) NOT NULL DEFAULT 0.00,
  manifest_date timestamptz NOT NULL DEFAULT now(),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on manifests
ALTER TABLE public.skypostal_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view skypostal_manifests" ON public.skypostal_manifests
  FOR SELECT USING (true);

CREATE POLICY "Admins manage skypostal_manifests" ON public.skypostal_manifests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 5. Update Chile to SANDBOX in international_markets for Phase 3 E2E testing
UPDATE public.international_markets
SET
  market_status = 'SANDBOX',
  provider_environment = 'test',
  checkout_enabled = true,
  public_enabled = true,
  updated_at = now()
WHERE country_code = 'CL';

-- Migration: 20261231030000_customs_franchise_core.sql
-- Module 06: Mi Franquicia (Uruguay Customs Franchise & Courier Engine)

-- 1. Rules Table: Uruguay 2026 Franchise and Simplified Regime
CREATE TABLE IF NOT EXISTS public.customs_rules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    country_code text NOT NULL DEFAULT 'UY',
    year integer NOT NULL DEFAULT 2026,
    annual_quota_usd numeric(10, 2) NOT NULL DEFAULT 800.00,
    max_shipments integer NOT NULL DEFAULT 3,
    max_weight_kg numeric(6, 2) NOT NULL DEFAULT 20.00,
    simplified_tax_rate numeric(4, 2) NOT NULL DEFAULT 0.60, -- 60%
    min_tax_usd numeric(10, 2) NOT NULL DEFAULT 20.00,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(country_code, year)
);

-- Seed UY 2026 Rules
INSERT INTO public.customs_rules 
(country_code, year, annual_quota_usd, max_shipments, max_weight_kg, simplified_tax_rate, min_tax_usd, is_active)
VALUES ('UY', 2026, 800.00, 3, 20.00, 0.60, 20.00, true)
ON CONFLICT (country_code, year) DO UPDATE 
SET annual_quota_usd = EXCLUDED.annual_quota_usd,
    max_shipments = EXCLUDED.max_shipments,
    max_weight_kg = EXCLUDED.max_weight_kg,
    simplified_tax_rate = EXCLUDED.simplified_tax_rate,
    min_tax_usd = EXCLUDED.min_tax_usd,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- 2. User Customs Usage Tracking Table
CREATE TABLE IF NOT EXISTS public.user_customs_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    year integer NOT NULL DEFAULT 2026,
    used_shipments integer NOT NULL DEFAULT 0 CHECK (used_shipments >= 0),
    used_amount_usd numeric(10, 2) NOT NULL DEFAULT 0.00 CHECK (used_amount_usd >= 0),
    preferred_courier_code text DEFAULT 'puntomio',
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, year)
);

-- RLS for user_customs_usage
ALTER TABLE public.user_customs_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own customs usage" ON public.user_customs_usage;
CREATE POLICY "Users can view own customs usage"
ON public.user_customs_usage
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert/update own customs usage" ON public.user_customs_usage;
CREATE POLICY "Users can insert/update own customs usage"
ON public.user_customs_usage
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all customs usage" ON public.user_customs_usage;
CREATE POLICY "Admins can view all customs usage"
ON public.user_customs_usage
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- 3. Courier Rates Table
CREATE TABLE IF NOT EXISTS public.courier_rates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    courier_code text NOT NULL, -- 'puntomio', 'urubox', 'usx_cargo'
    min_weight_kg numeric(6, 3) NOT NULL,
    max_weight_kg numeric(6, 3) NOT NULL,
    fixed_price_usd numeric(10, 2),
    rate_per_kg_usd numeric(10, 2),
    handling_fee_usd numeric(10, 2) NOT NULL DEFAULT 0.00,
    ursec_fee_percent numeric(5, 2) NOT NULL DEFAULT 0.00,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Seed PuntoMio rates
INSERT INTO public.courier_rates 
(courier_code, min_weight_kg, max_weight_kg, fixed_price_usd, rate_per_kg_usd, handling_fee_usd, ursec_fee_percent)
VALUES
('puntomio', 0.000, 0.500, 11.50, NULL, 0.00, 0.00),
('puntomio', 0.501, 1.000, 16.50, NULL, 0.00, 0.00),
('puntomio', 1.001, 2.000, 24.50, NULL, 0.00, 0.00),
('puntomio', 2.001, 5.000, NULL, 12.00, 0.00, 0.00),
('puntomio', 5.001, 20.000, NULL, 10.50, 0.00, 0.00)
ON CONFLICT DO NOTHING;

-- Seed Urubox rates
INSERT INTO public.courier_rates 
(courier_code, min_weight_kg, max_weight_kg, fixed_price_usd, rate_per_kg_usd, handling_fee_usd, ursec_fee_percent)
VALUES
('urubox', 0.000, 0.199, 10.90, NULL, 5.00, 10.00),
('urubox', 0.200, 0.499, 15.90, NULL, 5.00, 10.00),
('urubox', 0.500, 0.699, 18.90, NULL, 5.00, 10.00),
('urubox', 0.700, 0.999, 20.90, NULL, 5.00, 10.00),
('urubox', 1.000, 4.999, NULL, 19.90, 5.00, 10.00),
('urubox', 5.000, 9.999, NULL, 17.90, 5.00, 10.00),
('urubox', 10.000, 20.000, NULL, 16.50, 5.00, 10.00)
ON CONFLICT DO NOTHING;

-- Public read for courier_rates and customs_rules
ALTER TABLE public.courier_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customs_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read for courier_rates" ON public.courier_rates;
CREATE POLICY "Public read for courier_rates" ON public.courier_rates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read for customs_rules" ON public.customs_rules;
CREATE POLICY "Public read for customs_rules" ON public.customs_rules FOR SELECT USING (true);

-- RPC for secure user customs summary
CREATE OR REPLACE FUNCTION public.get_user_customs_summary(p_year integer DEFAULT 2026)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rules RECORD;
  v_usage RECORD;
  v_remaining_shipments integer;
  v_remaining_quota numeric(10, 2);
BEGIN
  v_user_id := auth.uid();
  
  -- Get active rule
  SELECT * INTO v_rules 
  FROM customs_rules 
  WHERE country_code = 'UY' AND year = p_year AND is_active = true 
  LIMIT 1;

  IF NOT FOUND THEN
    v_rules.annual_quota_usd := 800.00;
    v_rules.max_shipments := 3;
    v_rules.max_weight_kg := 20.00;
    v_rules.simplified_tax_rate := 0.60;
    v_rules.min_tax_usd := 20.00;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_usage 
    FROM user_customs_usage 
    WHERE user_id = v_user_id AND year = p_year;
  END IF;

  v_remaining_shipments := COALESCE(v_rules.max_shipments, 3) - COALESCE(v_usage.used_shipments, 0);
  IF v_remaining_shipments < 0 THEN v_remaining_shipments := 0; END IF;

  v_remaining_quota := COALESCE(v_rules.annual_quota_usd, 800.00) - COALESCE(v_usage.used_amount_usd, 0.00);
  IF v_remaining_quota < 0 THEN v_remaining_quota := 0.00; END IF;

  RETURN json_build_object(
    'year', p_year,
    'annual_quota_usd', v_rules.annual_quota_usd,
    'max_shipments', v_rules.max_shipments,
    'max_weight_kg', v_rules.max_weight_kg,
    'simplified_tax_rate', v_rules.simplified_tax_rate,
    'min_tax_usd', v_rules.min_tax_usd,
    'used_shipments', COALESCE(v_usage.used_shipments, 0),
    'used_amount_usd', COALESCE(v_usage.used_amount_usd, 0.00),
    'remaining_shipments', v_remaining_shipments,
    'remaining_quota_usd', v_remaining_quota,
    'preferred_courier', COALESCE(v_usage.preferred_courier_code, 'puntomio'),
    'has_available_franchise', (v_remaining_shipments > 0 AND v_remaining_quota > 0)
  );
END;
$$;

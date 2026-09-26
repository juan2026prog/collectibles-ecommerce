-- Migration: SkyPostal Phase 2 Pricing, Rates, Fuel, Compliance & Quote Snapshots
-- Purpose: Store versioned rate cards, country rules, fuel index rules, commercial markup settings, and quote snapshots.

-- 1. Country Rules Table
CREATE TABLE IF NOT EXISTS public.skypostal_country_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  currency text NOT NULL,
  service_name text NOT NULL,
  service_code integer NOT NULL,
  gateway text NOT NULL,
  clearance_type text NOT NULL,
  delivery_type text NOT NULL,
  max_weight_kg numeric(8,2) NOT NULL DEFAULT 30.00,
  max_value_usd numeric(10,2) NOT NULL DEFAULT 1000.00,
  de_minimis_usd numeric(10,2) NOT NULL DEFAULT 0.00,
  recipient_document_required boolean NOT NULL DEFAULT true,
  recipient_document_type text NOT NULL DEFAULT 'NATIONAL_ID',
  dim_divisor integer NOT NULL DEFAULT 5000,
  special_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  version text NOT NULL DEFAULT '2026.1',
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Rate Cards Table (Versioned)
CREATE TABLE IF NOT EXISTS public.skypostal_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  rate_card_code text NOT NULL, -- e.g., 'CL-340', 'PE-340', 'BR-340', 'CO-340', 'EC-340', 'MX-340', 'MX-340-R'
  service_name text NOT NULL,
  service_code integer NOT NULL,
  gateway text NOT NULL,
  clearance_type text NOT NULL,
  delivery_type text NOT NULL,
  weight_brackets jsonb NOT NULL, -- Array of { weight_kg: number, price_usd: number }
  additional_500g_price numeric(8,2) NOT NULL DEFAULT 0.00,
  version text NOT NULL DEFAULT '2026.1',
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_skypostal_rate_cards UNIQUE (country_code, rate_card_code, version)
);

-- 3. Fuel Rules Table (Band-based spot price adjustment)
CREATE TABLE IF NOT EXISTS public.skypostal_fuel_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version text NOT NULL DEFAULT '2026.1',
  index_name text NOT NULL DEFAULT 'US Gulf Coast Kerosene Spot Price',
  bands jsonb NOT NULL, -- Array of { min_price: number, max_price: number, adjustment_percent: number }
  current_index_value numeric(8,4) NOT NULL DEFAULT 2.4500, -- Default baseline spot price
  current_adjustment_percent numeric(5,2) NOT NULL DEFAULT 0.00,
  last_index_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Pricing Settings Table (Commercial Markup on Cost)
CREATE TABLE IF NOT EXISTS public.skypostal_pricing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  default_markup_percent numeric(5,2) NOT NULL DEFAULT 35.00,
  quote_ttl_seconds integer NOT NULL DEFAULT 86400, -- 24 hours default TTL
  country_markup_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_pricing_settings_row CHECK (id = 1)
);

-- 5. Compliance Rules Table
CREATE TABLE IF NOT EXISTS public.skypostal_compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  commodity_type text NOT NULL, -- e.g., 'toys', 'collectibles', 'electronics', 'cosmetics', 'weapons', etc.
  status text NOT NULL CHECK (status IN ('ALLOWED', 'RESTRICTED', 'REGULATED', 'PROHIBITED', 'MANUAL_REVIEW')),
  max_quantity_per_shipment integer,
  max_fob_value_usd numeric(10,2),
  requires_document text,
  reason text NOT NULL,
  source_reference text NOT NULL DEFAULT 'CR SkyPostal Restrictions by Country 2026',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Immutable Quote Snapshots Table
CREATE TABLE IF NOT EXISTS public.skypostal_quote_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id text NOT NULL UNIQUE,
  order_id text,
  suborder_id text,
  country_code text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  provider text NOT NULL DEFAULT 'skypostal',
  service_name text NOT NULL,
  service_code integer NOT NULL,
  rate_card_code text NOT NULL,
  rate_version text NOT NULL,
  actual_weight_kg numeric(8,3) NOT NULL,
  dimensional_weight_kg numeric(8,3) NOT NULL,
  billable_weight_kg numeric(8,3) NOT NULL,
  weight_source text NOT NULL DEFAULT 'ESTIMATED',
  transportation_charge numeric(10,2) NOT NULL,
  fuel_index_value numeric(8,4) NOT NULL,
  fuel_percentage numeric(5,2) NOT NULL,
  fuel_amount numeric(10,2) NOT NULL,
  fuel_status text NOT NULL DEFAULT 'ESTIMATED' CHECK (fuel_status IN ('ESTIMATED', 'FINAL')),
  provider_estimated_cost numeric(10,2) NOT NULL,
  markup_percentage numeric(5,2) NOT NULL,
  markup_amount numeric(10,2) NOT NULL,
  customer_shipping_price numeric(10,2) NOT NULL,
  compliance_status text NOT NULL,
  compliance_reason text,
  expires_at timestamptz NOT NULL,
  market_environment text NOT NULL DEFAULT 'test',
  raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all Phase 2 tables
ALTER TABLE public.skypostal_country_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skypostal_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skypostal_fuel_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skypostal_pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skypostal_compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skypostal_quote_snapshots ENABLE ROW LEVEL SECURITY;

-- Public/Authenticated SELECT policies
CREATE POLICY "Public can view skypostal_country_rules" ON public.skypostal_country_rules FOR SELECT USING (true);
CREATE POLICY "Public can view skypostal_rate_cards" ON public.skypostal_rate_cards FOR SELECT USING (true);
CREATE POLICY "Public can view skypostal_fuel_rules" ON public.skypostal_fuel_rules FOR SELECT USING (true);
CREATE POLICY "Public can view skypostal_pricing_settings" ON public.skypostal_pricing_settings FOR SELECT USING (true);
CREATE POLICY "Public can view skypostal_compliance_rules" ON public.skypostal_compliance_rules FOR SELECT USING (true);

-- Admin ALL policies
CREATE POLICY "Admins manage skypostal_country_rules" ON public.skypostal_country_rules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage skypostal_rate_cards" ON public.skypostal_rate_cards FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage skypostal_fuel_rules" ON public.skypostal_fuel_rules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage skypostal_pricing_settings" ON public.skypostal_pricing_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage skypostal_compliance_rules" ON public.skypostal_compliance_rules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage skypostal_quote_snapshots" ON public.skypostal_quote_snapshots FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 7. SEED DATA

-- A. Country Rules
INSERT INTO public.skypostal_country_rules (
  country_code, country_name, currency, service_name, service_code, gateway, clearance_type, delivery_type,
  max_weight_kg, max_value_usd, de_minimis_usd, recipient_document_required, recipient_document_type, dim_divisor, special_conditions
) VALUES
  ('CL', 'Chile', 'CLP', 'Courier Standard', 1, 'SCL', 'COURIER', 'STANDARD', 30.00, 3000.00, 41.00, true, 'RUT', 5000, '{"duty_rate": 0.06, "vat_rate": 0.19, "service_guide_ref": "Chile Tab"}'::jsonb),
  ('PE', 'Perú', 'PEN', 'Courier Standard', 1, 'LIM', 'COURIER', 'STANDARD', 30.00, 2000.00, 200.00, true, 'DNI_OR_RUC', 5000, '{"duty_rate": 0.04, "igv_rate": 0.16, "ipm_rate": 0.02, "insurance_coeff": 0.0075, "max_toys_per_shipment": 10}'::jsonb),
  ('BR', 'Brasil', 'BRL', 'Courier Standard', 1, 'GRU', 'COURIER', 'STANDARD', 30.00, 3000.00, 0.00, true, 'CPF_OR_CNPJ', 5000, '{"icms_applies": true, "max_value": 3000.00}'::jsonb),
  ('CO', 'Colombia', 'COP', 'Courier Standard', 1, 'BOG', 'COURIER', 'STANDARD', 50.00, 2000.00, 200.00, true, 'CEDULA', 5000, '{"duty_free_under_200": true}'::jsonb),
  ('EC', 'Ecuador', 'USD', 'Postal Standard', 4, 'UIO', 'POSTAL', 'STANDARD', 30.00, 2000.00, 400.00, true, 'CEDULA_OR_RUC', 5000, '{"cat_b_max_weight_kg": 4.0, "cat_b_max_fob_usd": 400.0, "cat_b_fixed_fee_usd": 20.0, "cat_c_duty_rate": 0.30, "fodinfa_rate": 0.005, "iva_rate": 0.15, "reference_freight_per_kg": 1.446}'::jsonb),
  ('MX', 'México', 'MXN', 'Courier Standard', 1, 'GDL', 'COURIER', 'STANDARD', 30.00, 1000.00, 50.00, true, 'RFC_OR_CURP', 5000, '{"service_code_standard": 1, "service_code_regulated": 502, "regulated_tax_rate": 0.20, "disabled_in_storefront": true}'::jsonb)
ON CONFLICT (country_code) DO UPDATE SET
  service_name = EXCLUDED.service_name,
  service_code = EXCLUDED.service_code,
  gateway = EXCLUDED.gateway,
  clearance_type = EXCLUDED.clearance_type,
  delivery_type = EXCLUDED.delivery_type,
  special_conditions = EXCLUDED.special_conditions,
  updated_at = now();

-- B. Rate Cards Seed (CL-340, PE-340, BR-340, CO-340, EC-340, MX-340, MX-340-R)
INSERT INTO public.skypostal_rate_cards (
  country_code, rate_card_code, service_name, service_code, gateway, clearance_type, delivery_type, weight_brackets, additional_500g_price, version
) VALUES
  ('CL', 'CL-340', 'SkyPostal Chile Custom Courier', 1, 'SCL', 'COURIER', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":8.59},{"weight_kg":0.2,"price_usd":9.08},{"weight_kg":0.3,"price_usd":9.56},{"weight_kg":0.4,"price_usd":10.05},{"weight_kg":0.5,"price_usd":10.53},{"weight_kg":0.6,"price_usd":12.79},{"weight_kg":0.7,"price_usd":13.28},{"weight_kg":0.8,"price_usd":13.76},{"weight_kg":0.9,"price_usd":14.25},{"weight_kg":1.0,"price_usd":14.73},{"weight_kg":1.5,"price_usd":17.25},{"weight_kg":2.0,"price_usd":19.67},{"weight_kg":2.5,"price_usd":22.10},{"weight_kg":3.0,"price_usd":24.52},{"weight_kg":3.5,"price_usd":28.85},{"weight_kg":4.0,"price_usd":31.27},{"weight_kg":4.5,"price_usd":33.70},{"weight_kg":5.0,"price_usd":36.12},{"weight_kg":5.5,"price_usd":40.45},{"weight_kg":6.0,"price_usd":42.87},{"weight_kg":6.5,"price_usd":45.30},{"weight_kg":7.0,"price_usd":47.72},{"weight_kg":7.5,"price_usd":52.05},{"weight_kg":8.0,"price_usd":54.47},{"weight_kg":8.5,"price_usd":56.90},{"weight_kg":9.0,"price_usd":59.32},{"weight_kg":9.5,"price_usd":63.65},{"weight_kg":10.0,"price_usd":66.07}]'::jsonb,
   2.42, '2026.1'),

  ('PE', 'PE-340', 'SkyPostal Peru Custom Courier', 1, 'LIM', 'COURIER', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":11.11},{"weight_kg":0.2,"price_usd":11.41},{"weight_kg":0.3,"price_usd":11.71},{"weight_kg":0.4,"price_usd":12.01},{"weight_kg":0.5,"price_usd":12.31},{"weight_kg":0.6,"price_usd":12.61},{"weight_kg":0.7,"price_usd":12.91},{"weight_kg":0.8,"price_usd":13.21},{"weight_kg":0.9,"price_usd":13.51},{"weight_kg":1.0,"price_usd":13.81},{"weight_kg":1.5,"price_usd":15.32},{"weight_kg":2.0,"price_usd":16.82},{"weight_kg":2.5,"price_usd":19.11},{"weight_kg":3.0,"price_usd":20.61},{"weight_kg":3.5,"price_usd":22.89},{"weight_kg":4.0,"price_usd":24.40},{"weight_kg":4.5,"price_usd":26.68},{"weight_kg":5.0,"price_usd":28.18},{"weight_kg":5.5,"price_usd":30.47},{"weight_kg":6.0,"price_usd":31.97},{"weight_kg":6.5,"price_usd":34.26},{"weight_kg":7.0,"price_usd":35.76},{"weight_kg":7.5,"price_usd":38.04},{"weight_kg":8.0,"price_usd":39.55},{"weight_kg":8.5,"price_usd":41.83},{"weight_kg":9.0,"price_usd":43.34},{"weight_kg":9.5,"price_usd":45.62},{"weight_kg":10.0,"price_usd":47.13}]'::jsonb,
   2.13, '2026.1'),

  ('BR', 'BR-340', 'SkyPostal Brazil Custom Courier', 1, 'GRU', 'COURIER', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":7.97},{"weight_kg":0.2,"price_usd":8.63},{"weight_kg":0.3,"price_usd":9.33},{"weight_kg":0.4,"price_usd":9.93},{"weight_kg":0.5,"price_usd":10.53},{"weight_kg":0.6,"price_usd":11.35},{"weight_kg":0.7,"price_usd":11.95},{"weight_kg":0.8,"price_usd":12.72},{"weight_kg":0.9,"price_usd":13.32},{"weight_kg":1.0,"price_usd":13.92},{"weight_kg":1.5,"price_usd":17.28},{"weight_kg":2.0,"price_usd":20.40},{"weight_kg":2.5,"price_usd":23.83},{"weight_kg":3.0,"price_usd":26.84},{"weight_kg":3.5,"price_usd":30.27},{"weight_kg":4.0,"price_usd":33.28},{"weight_kg":4.5,"price_usd":36.71},{"weight_kg":5.0,"price_usd":39.72},{"weight_kg":5.5,"price_usd":43.15},{"weight_kg":6.0,"price_usd":46.16},{"weight_kg":6.5,"price_usd":49.59},{"weight_kg":7.0,"price_usd":52.60},{"weight_kg":7.5,"price_usd":56.03},{"weight_kg":8.0,"price_usd":59.04},{"weight_kg":8.5,"price_usd":62.47},{"weight_kg":9.0,"price_usd":65.48},{"weight_kg":9.5,"price_usd":68.91},{"weight_kg":10.0,"price_usd":71.92}]'::jsonb,
   3.43, '2026.1'),

  ('CO', 'CO-340', 'SkyPostal Colombia Custom Courier', 1, 'BOG', 'COURIER', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":8.21},{"weight_kg":0.2,"price_usd":8.42},{"weight_kg":0.3,"price_usd":8.64},{"weight_kg":0.4,"price_usd":8.85},{"weight_kg":0.5,"price_usd":9.07},{"weight_kg":0.6,"price_usd":9.88},{"weight_kg":0.7,"price_usd":10.09},{"weight_kg":0.8,"price_usd":10.31},{"weight_kg":0.9,"price_usd":10.52},{"weight_kg":1.0,"price_usd":10.74},{"weight_kg":1.5,"price_usd":13.36},{"weight_kg":2.0,"price_usd":14.83},{"weight_kg":2.5,"price_usd":17.76},{"weight_kg":3.0,"price_usd":18.83},{"weight_kg":3.5,"price_usd":21.76},{"weight_kg":4.0,"price_usd":22.84},{"weight_kg":4.5,"price_usd":25.77},{"weight_kg":5.0,"price_usd":26.85},{"weight_kg":5.5,"price_usd":29.78},{"weight_kg":6.0,"price_usd":30.86},{"weight_kg":6.5,"price_usd":33.79},{"weight_kg":7.0,"price_usd":34.87},{"weight_kg":7.5,"price_usd":37.80},{"weight_kg":8.0,"price_usd":38.87},{"weight_kg":8.5,"price_usd":41.80},{"weight_kg":9.0,"price_usd":42.88},{"weight_kg":9.5,"price_usd":45.81},{"weight_kg":10.0,"price_usd":46.89}]'::jsonb,
   2.93, '2026.1'),

  ('EC', 'EC-340', 'SkyPostal Ecuador Custom Postal', 4, 'UIO', 'POSTAL', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":9.54},{"weight_kg":0.2,"price_usd":9.93},{"weight_kg":0.3,"price_usd":10.32},{"weight_kg":0.4,"price_usd":10.72},{"weight_kg":0.5,"price_usd":11.11},{"weight_kg":0.6,"price_usd":11.50},{"weight_kg":0.7,"price_usd":11.89},{"weight_kg":0.8,"price_usd":12.28},{"weight_kg":0.9,"price_usd":12.67},{"weight_kg":1.0,"price_usd":13.07},{"weight_kg":1.5,"price_usd":15.02},{"weight_kg":2.0,"price_usd":16.98},{"weight_kg":2.5,"price_usd":19.64},{"weight_kg":3.0,"price_usd":21.60},{"weight_kg":3.5,"price_usd":24.25},{"weight_kg":4.0,"price_usd":26.21},{"weight_kg":4.5,"price_usd":28.86},{"weight_kg":5.0,"price_usd":30.82},{"weight_kg":5.5,"price_usd":33.47},{"weight_kg":6.0,"price_usd":35.43},{"weight_kg":6.5,"price_usd":38.09},{"weight_kg":7.0,"price_usd":40.05},{"weight_kg":7.5,"price_usd":42.70},{"weight_kg":8.0,"price_usd":44.66},{"weight_kg":8.5,"price_usd":47.31},{"weight_kg":9.0,"price_usd":49.27},{"weight_kg":9.5,"price_usd":51.92},{"weight_kg":10.0,"price_usd":53.88}]'::jsonb,
   2.66, '2026.1'),

  ('MX', 'MX-340', 'SkyPostal Mexico Custom Courier', 1, 'GDL', 'COURIER', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":7.84},{"weight_kg":0.2,"price_usd":8.20},{"weight_kg":0.3,"price_usd":8.56},{"weight_kg":0.4,"price_usd":8.92},{"weight_kg":0.5,"price_usd":9.28},{"weight_kg":0.6,"price_usd":9.65},{"weight_kg":0.7,"price_usd":10.01},{"weight_kg":0.8,"price_usd":10.37},{"weight_kg":0.9,"price_usd":10.73},{"weight_kg":1.0,"price_usd":11.09},{"weight_kg":1.5,"price_usd":13.09},{"weight_kg":2.0,"price_usd":14.90},{"weight_kg":2.5,"price_usd":16.98},{"weight_kg":3.0,"price_usd":18.79},{"weight_kg":3.5,"price_usd":20.97},{"weight_kg":4.0,"price_usd":22.78},{"weight_kg":4.5,"price_usd":24.97},{"weight_kg":5.0,"price_usd":26.78},{"weight_kg":5.5,"price_usd":29.02},{"weight_kg":6.0,"price_usd":30.83},{"weight_kg":6.5,"price_usd":33.08},{"weight_kg":7.0,"price_usd":34.89},{"weight_kg":7.5,"price_usd":37.14},{"weight_kg":8.0,"price_usd":38.95},{"weight_kg":8.5,"price_usd":41.20},{"weight_kg":9.0,"price_usd":43.01},{"weight_kg":9.5,"price_usd":45.25},{"weight_kg":10.0,"price_usd":47.06}]'::jsonb,
   2.25, '2026.1'),

  ('MX', 'MX-340-R', 'SkyPostal Mexico Regulated Custom Courier', 502, 'LRD', 'COURIER', 'STANDARD',
   '[{"weight_kg":0.1,"price_usd":10.51},{"weight_kg":0.2,"price_usd":10.87},{"weight_kg":0.3,"price_usd":11.24},{"weight_kg":0.4,"price_usd":11.60},{"weight_kg":0.5,"price_usd":11.97},{"weight_kg":0.6,"price_usd":13.49},{"weight_kg":0.7,"price_usd":13.85},{"weight_kg":0.8,"price_usd":14.22},{"weight_kg":0.9,"price_usd":14.58},{"weight_kg":1.0,"price_usd":14.95},{"weight_kg":1.5,"price_usd":18.56},{"weight_kg":2.0,"price_usd":20.39},{"weight_kg":2.5,"price_usd":23.91},{"weight_kg":3.0,"price_usd":25.74},{"weight_kg":3.5,"price_usd":28.06},{"weight_kg":4.0,"price_usd":29.89},{"weight_kg":4.5,"price_usd":32.47},{"weight_kg":5.0,"price_usd":34.30},{"weight_kg":5.5,"price_usd":38.38},{"weight_kg":6.0,"price_usd":40.20},{"weight_kg":6.5,"price_usd":44.28},{"weight_kg":7.0,"price_usd":46.11},{"weight_kg":7.5,"price_usd":50.19},{"weight_kg":8.0,"price_usd":52.02},{"weight_kg":8.5,"price_usd":56.10},{"weight_kg":9.0,"price_usd":57.92},{"weight_kg":9.5,"price_usd":62.00},{"weight_kg":10.0,"price_usd":63.83}]'::jsonb,
   1.83, '2026.1')
ON CONFLICT (country_code, rate_card_code, version) DO UPDATE SET
  weight_brackets = EXCLUDED.weight_brackets,
  additional_500g_price = EXCLUDED.additional_500g_price,
  updated_at = now();

-- C. Fuel Rules Seed (10 contractual EIA Spot Price Bands)
INSERT INTO public.skypostal_fuel_rules (
  rule_version, index_name, bands, current_index_value, current_adjustment_percent, is_active
) VALUES (
  '2026.1',
  'US Gulf Coast Kerosene Spot Price',
  '[
    {"min_price": 3.55, "max_price": 3.90, "adjustment_percent": 4.0},
    {"min_price": 3.20, "max_price": 3.55, "adjustment_percent": 3.0},
    {"min_price": 2.85, "max_price": 3.20, "adjustment_percent": 2.0},
    {"min_price": 2.50, "max_price": 2.85, "adjustment_percent": 1.0},
    {"min_price": 2.15, "max_price": 2.50, "adjustment_percent": 0.0},
    {"min_price": 1.80, "max_price": 2.15, "adjustment_percent": 0.0},
    {"min_price": 1.45, "max_price": 1.80, "adjustment_percent": -1.0},
    {"min_price": 1.10, "max_price": 1.45, "adjustment_percent": -2.0},
    {"min_price": 0.75, "max_price": 1.10, "adjustment_percent": -3.0},
    {"min_price": 0.40, "max_price": 0.75, "adjustment_percent": -4.0}
  ]'::jsonb,
  2.4500,
  0.0,
  true
);

-- D. Pricing Settings Seed (Default Markup 35% on Cost)
INSERT INTO public.skypostal_pricing_settings (
  id, default_markup_percent, quote_ttl_seconds, is_enabled
) VALUES (
  1, 35.00, 86400, true
) ON CONFLICT (id) DO NOTHING;

-- E. Compliance Rules Seed (Common Collectibles / Prohibitions)
INSERT INTO public.skypostal_compliance_rules (
  country_code, commodity_type, status, max_quantity_per_shipment, max_fob_value_usd, reason
) VALUES
  ('CL', 'action_figures', 'ALLOWED', 10, 3000.00, 'Figuras de acción y coleccionables permitidos para uso personal.'),
  ('CL', 'trading_cards', 'ALLOWED', 100, 3000.00, 'Cartas coleccionables permitidas sin restricción aduanera.'),
  ('CL', 'counterfeit_items', 'PROHIBITED', 0, 0.00, 'Mercancía falsificada o réplica está terminantemente prohibida por Aduana Chile.'),
  ('CL', 'weapons', 'PROHIBITED', 0, 0.00, 'Armas de fuego y réplicas bélicas prohibidas.'),
  ('CL', 'perfumes_cosmetics', 'PROHIBITED', 0, 0.00, 'Perfumes y cosméticos prohibidos por courier en Chile.'),

  ('PE', 'action_figures', 'ALLOWED', 10, 2000.00, 'Juguetes y figuras coleccionables permitidas hasta 10 unidades para uso personal con DNI/RUC.'),
  ('PE', 'trading_cards', 'ALLOWED', 50, 2000.00, 'Cartas y cómics permitidos hasta US$ 200 de minimis sin aranceles.'),
  ('PE', 'drones', 'RESTRICTED', 1, 2000.00, 'Drones requieren homologación MTC para más de 1 unidad.'),
  ('PE', 'medicines_supplements', 'PROHIBITED', 0, 0.00, 'Suplementos y medicamentos prohibidos para personas naturales.'),

  ('EC', 'action_figures', 'ALLOWED', 5, 2000.00, 'Coleccionables permitidos. Aplica Categoría B si peso <= 4kg y FOB <= $400 USD.'),
  ('EC', 'fine_jewelry', 'PROHIBITED', 0, 0.00, 'Joyería fina en oro/plata/platino prohibida en Ecuador.'),

  ('MX', 'action_figures', 'ALLOWED', 10, 1000.00, 'Figuras y juguetes permitidos bajo servicio estándar MX-340.'),
  ('MX', 'supplements_cosmetics', 'REGULATED', 5, 1000.00, 'Cosméticos y suplementos requieren servicio regulado MX-340-R y 20% tax.')
ON CONFLICT DO NOTHING;

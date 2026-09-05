-- MÓDULO 6: COLLECTIBLES IMPORT HUB - SUPABASE SCHEMA MIGRATION
CREATE TABLE IF NOT EXISTS public.customs_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(10) NOT NULL DEFAULT 'UY',
    country_name VARCHAR(100) NOT NULL DEFAULT 'Uruguay',
    year INTEGER NOT NULL DEFAULT 2026,
    annual_quota_usd NUMERIC(10,2) NOT NULL DEFAULT 800.00,
    max_shipments_per_year INTEGER NOT NULL DEFAULT 3,
    max_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 20.00,
    simplified_tax_rate NUMERIC(4,2) NOT NULL DEFAULT 0.60,
    min_simplified_tax_usd NUMERIC(10,2) NOT NULL DEFAULT 20.00,
    official_source_url TEXT DEFAULT 'https://www.aduanas.gub.uy',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    effective_from DATE NOT NULL DEFAULT '2026-01-01',
    effective_to DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.import_couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    logo_url TEXT,
    website_url TEXT,
    handling_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ursec_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    insurance_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    local_delivery_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    min_charge_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    has_volumetric_weight BOOLEAN NOT NULL DEFAULT false,
    required_fields JSONB DEFAULT '["suite_number", "usa_address"]'::jsonb,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.import_courier_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL REFERENCES public.import_couriers(id) ON DELETE CASCADE,
    min_weight_kg NUMERIC(6,3) NOT NULL,
    max_weight_kg NUMERIC(6,3) NOT NULL,
    rate_type VARCHAR(20) NOT NULL DEFAULT 'PER_KG',
    rate_usd NUMERIC(10,2) NOT NULL,
    label VARCHAR(100) NOT NULL,
    category_restriction VARCHAR(50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_import_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_courier_id UUID REFERENCES public.import_couriers(id) ON DELETE SET NULL,
    suite_number VARCHAR(100),
    account_name VARCHAR(150),
    usa_address_line1 TEXT,
    usa_address_line2 TEXT,
    usa_city VARCHAR(100) DEFAULT 'Miami',
    usa_state VARCHAR(50) DEFAULT 'FL',
    usa_zip VARCHAR(20) DEFAULT '33166',
    phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_import_profiles_user_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.user_import_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    year INTEGER NOT NULL DEFAULT 2026,
    origin_type VARCHAR(30) NOT NULL DEFAULT 'USER_DECLARED',
    description TEXT NOT NULL,
    product_price_usd NUMERIC(10,2) NOT NULL,
    weight_kg NUMERIC(6,2),
    courier_name VARCHAR(100),
    tracking_number VARCHAR(100),
    invoice_url TEXT,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_saved_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_title VARCHAR(255) NOT NULL,
    product_image TEXT,
    product_price_usd NUMERIC(10,2) NOT NULL,
    product_weight_kg NUMERIC(6,3) NOT NULL,
    is_weight_estimated BOOLEAN NOT NULL DEFAULT true,
    courier_code VARCHAR(50) NOT NULL,
    courier_name VARCHAR(100) NOT NULL,
    base_freight_usd NUMERIC(10,2) NOT NULL,
    handling_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    other_fees_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_courier_usd NUMERIC(10,2) NOT NULL,
    effective_cost_per_kg_usd NUMERIC(10,2) NOT NULL,
    applied_regime VARCHAR(50) NOT NULL DEFAULT 'FRANQUICIA',
    customs_tax_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_landed_cost_usd NUMERIC(10,2) NOT NULL,
    total_landed_cost_uyu NUMERIC(12,2) NOT NULL,
    exchange_rate NUMERIC(8,2) NOT NULL DEFAULT 42.50,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_import_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    courier_name VARCHAR(100) NOT NULL,
    tracking_code VARCHAR(100),
    current_status VARCHAR(50) NOT NULL DEFAULT 'ORDER_CONFIRMED',
    estimated_delivery DATE,
    origin_city VARCHAR(100) DEFAULT 'Miami, FL, USA',
    destination_city VARCHAR(100) DEFAULT 'Montevideo, Uruguay',
    last_checkpoint_detail TEXT,
    last_checkpoint_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- MIGRATION: SOURCING INTELLIGENCE FASE 5 — AUTOPILOT
-- Adds schema for Autopilot Settings, Rules Engine, Action Queue, Audit Log,
-- Circuit Breaker Alerts & Financial Limits.
-- ==============================================================================

-- 1. Table: sourcing_autopilot_settings
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    mode text NOT NULL DEFAULT 'OFF', -- OFF, RECOMMENDATION, SEMIAUTOMATIC, AUTOPILOT
    visual_status text NOT NULL DEFAULT 'OFF', -- OFF, ACTIVE, SUSPENDED
    discover_products boolean NOT NULL DEFAULT true,
    evaluate_opportunities boolean NOT NULL DEFAULT true,
    prepare_publications boolean NOT NULL DEFAULT true,
    auto_publish boolean NOT NULL DEFAULT false,
    auto_update_prices boolean NOT NULL DEFAULT true,
    auto_update_stock boolean NOT NULL DEFAULT true,
    auto_pause_publications boolean NOT NULL DEFAULT true,
    auto_reactivate_publications boolean NOT NULL DEFAULT true,
    auto_purchase boolean NOT NULL DEFAULT false,
    send_to_import_hub boolean NOT NULL DEFAULT true,
    is_kill_switch_active boolean NOT NULL DEFAULT false,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Seed default settings row if missing
INSERT INTO public.sourcing_autopilot_settings (
    mode, visual_status, discover_products, evaluate_opportunities, prepare_publications,
    auto_publish, auto_update_prices, auto_update_stock, auto_pause_publications,
    auto_reactivate_publications, auto_purchase, send_to_import_hub, is_kill_switch_active
) 
SELECT 'OFF', 'OFF', true, true, true, false, true, true, true, true, false, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.sourcing_autopilot_settings);


-- 2. Table: sourcing_autopilot_rules
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_rules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    scope text NOT NULL DEFAULT 'GLOBAL', -- GLOBAL, RETAILER, CATEGORY, BRAND, CONDITION
    identifier text NOT NULL DEFAULT 'all', -- amazon, ebay, figures, McFarlane, NEW, etc.
    is_active boolean NOT NULL DEFAULT true,
    min_margin_percent numeric(5,2) NOT NULL DEFAULT 15.00,
    min_profit_usd numeric(10,2) NOT NULL DEFAULT 2.00,
    max_purchase_cost_usd numeric(10,2) NOT NULL DEFAULT 1000.00,
    max_origin_price_usd numeric(10,2) NOT NULL DEFAULT 800.00,
    min_stock int NOT NULL DEFAULT 2,
    min_seller_score numeric(5,2) NOT NULL DEFAULT 95.00,
    min_confidence_score numeric(5,2) NOT NULL DEFAULT 80.00,
    min_opportunity_score int NOT NULL DEFAULT 80,
    max_active_publications int NOT NULL DEFAULT 500,
    max_price_drift_percent numeric(5,2) NOT NULL DEFAULT 5.00,
    auto_purchase_enabled boolean NOT NULL DEFAULT false,
    requires_manual_review boolean NOT NULL DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Seed default global & retailer rules
INSERT INTO public.sourcing_autopilot_rules (scope, identifier, min_margin_percent, min_profit_usd, min_seller_score, min_opportunity_score)
SELECT 'GLOBAL', 'all', 15.00, 2.00, 90.00, 80
WHERE NOT EXISTS (SELECT 1 FROM public.sourcing_autopilot_rules WHERE scope = 'GLOBAL');

INSERT INTO public.sourcing_autopilot_rules (scope, identifier, min_margin_percent, min_seller_score, min_stock, min_opportunity_score, auto_purchase_enabled)
SELECT 'RETAILER', 'amazon', 15.00, 95.00, 2, 82, false
WHERE NOT EXISTS (SELECT 1 FROM public.sourcing_autopilot_rules WHERE scope = 'RETAILER' AND identifier = 'amazon');

INSERT INTO public.sourcing_autopilot_rules (scope, identifier, min_margin_percent, min_seller_score, min_stock, min_opportunity_score, auto_purchase_enabled)
SELECT 'RETAILER', 'ebay', 18.00, 98.00, 1, 85, false
WHERE NOT EXISTS (SELECT 1 FROM public.sourcing_autopilot_rules WHERE scope = 'RETAILER' AND identifier = 'ebay');


-- 3. Table: sourcing_autopilot_queue
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type text NOT NULL, -- PUBLISH_PRODUCT, UPDATE_PRICE, PAUSE_PRODUCT, REACTIVATE_PRODUCT, SWITCH_SOURCE, PURCHASE_PRODUCT, REVIEW_PRODUCT
    status text NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED, BLOCKED, CANCELLED, REQUIRES_APPROVAL
    canonical_sku text,
    product_id uuid,
    publication_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key text UNIQUE NOT NULL,
    locked_at timestamptz,
    locked_by text,
    attempts int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 3,
    error_message text,
    result jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_queue_status ON public.sourcing_autopilot_queue(status);
CREATE INDEX IF NOT EXISTS idx_autopilot_queue_sku ON public.sourcing_autopilot_queue(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_autopilot_queue_action ON public.sourcing_autopilot_queue(action_type);


-- 4. Table: sourcing_autopilot_audit
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_audit (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp timestamptz NOT NULL DEFAULT now(),
    product_id text,
    opportunity_id text,
    publication_id text,
    order_id text,
    action text NOT NULL,
    previous_state text,
    new_state text,
    reason text NOT NULL,
    rule_applied text,
    source_name text,
    source_price numeric(10,2),
    landed_cost numeric(10,2),
    selling_price numeric(10,2),
    margin numeric(5,2),
    confidence numeric(5,2),
    actor text NOT NULL DEFAULT 'AUTOPILOT', -- USER, ADMIN, AUTOPILOT, SYSTEM
    mode text NOT NULL DEFAULT 'AUTOPILOT',
    result text NOT NULL DEFAULT 'SUCCESS',
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_autopilot_audit_time ON public.sourcing_autopilot_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_autopilot_audit_action ON public.sourcing_autopilot_audit(action);
CREATE INDEX IF NOT EXISTS idx_autopilot_audit_product ON public.sourcing_autopilot_audit(product_id);


-- 5. Table: sourcing_autopilot_alerts
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_alerts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    priority text NOT NULL DEFAULT 'INFO', -- INFO, WARNING, CRITICAL
    title text NOT NULL,
    message text NOT NULL,
    code text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    is_read boolean NOT NULL DEFAULT false,
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_alerts_priority ON public.sourcing_autopilot_alerts(priority);
CREATE INDEX IF NOT EXISTS idx_autopilot_alerts_read ON public.sourcing_autopilot_alerts(is_read);


-- 6. Table: sourcing_autopilot_financial_limits
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_financial_limits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    max_single_purchase_usd numeric(10,2) NOT NULL DEFAULT 150.00,
    max_daily_expenditure_usd numeric(10,2) NOT NULL DEFAULT 500.00,
    max_weekly_expenditure_usd numeric(10,2) NOT NULL DEFAULT 2000.00,
    max_monthly_expenditure_usd numeric(10,2) NOT NULL DEFAULT 5000.00,
    current_daily_expenditure_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    current_weekly_expenditure_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    current_monthly_expenditure_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    max_concurrent_orders int NOT NULL DEFAULT 5,
    max_units_per_product int NOT NULL DEFAULT 3,
    last_reset_date date DEFAULT CURRENT_DATE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Seed default financial limits row
INSERT INTO public.sourcing_autopilot_financial_limits (
    max_single_purchase_usd, max_daily_expenditure_usd, max_weekly_expenditure_usd,
    max_monthly_expenditure_usd, max_concurrent_orders, max_units_per_product
)
SELECT 150.00, 500.00, 2000.00, 5000.00, 5, 3
WHERE NOT EXISTS (SELECT 1 FROM public.sourcing_autopilot_financial_limits);


-- RLS Policies (Strict Admin Only)
ALTER TABLE public.sourcing_autopilot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_autopilot_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_autopilot_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_autopilot_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_autopilot_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_autopilot_financial_limits ENABLE ROW LEVEL SECURITY;

-- Allow admins full access to all autopilot tables
CREATE POLICY "Admins full access sourcing_autopilot_settings"
ON public.sourcing_autopilot_settings FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_autopilot_rules"
ON public.sourcing_autopilot_rules FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_autopilot_queue"
ON public.sourcing_autopilot_queue FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_autopilot_audit"
ON public.sourcing_autopilot_audit FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_autopilot_alerts"
ON public.sourcing_autopilot_alerts FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_autopilot_financial_limits"
ON public.sourcing_autopilot_financial_limits FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

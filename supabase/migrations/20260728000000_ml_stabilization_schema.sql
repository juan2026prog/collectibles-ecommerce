-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Stabilization Alerts Schema
-- Applied: 2026-07-28
-- ══════════════════════════════════════════════════════════════

-- 1. Create ml_alerts table
CREATE TABLE IF NOT EXISTS public.ml_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    grouped_count INTEGER DEFAULT 1,
    seller_id TEXT,
    last_triggered_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.ml_alerts ENABLE ROW LEVEL SECURITY;

-- 3. Define Security Policies for ml_alerts
DROP POLICY IF EXISTS "Admins manage all alerts" ON public.ml_alerts;
CREATE POLICY "Admins manage all alerts" ON public.ml_alerts
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors view own alerts" ON public.ml_alerts;
CREATE POLICY "Vendors view own alerts" ON public.ml_alerts
    FOR SELECT USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );

-- 4. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ml_alerts_type_date ON public.ml_alerts(alert_type, last_triggered_at);
CREATE INDEX IF NOT EXISTS idx_ml_alerts_seller ON public.ml_alerts(seller_id);

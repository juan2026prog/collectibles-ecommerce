-- Migration: SkyPostal Final Multi-Country Audit & Remediation
-- Purpose: Complete immutable audit policies, generic country readiness flags, and database persistence.

-- 1. Ensure skypostal_audit_logs is strictly immutable (SELECT and INSERT for admins, NO UPDATE, NO DELETE)
ALTER TABLE public.skypostal_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.skypostal_audit_logs;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.skypostal_audit_logs;

CREATE POLICY "Admins can view audit logs" ON public.skypostal_audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert audit logs" ON public.skypostal_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 2. Update default market status of Chile to PREVIEW for audited baseline safety
UPDATE public.international_markets
SET
  market_status = 'PREVIEW',
  public_enabled = false,
  checkout_enabled = false,
  metadata = jsonb_build_object(
    'flag', '🇨🇱',
    'target_tier', 'tier_1',
    'lead_market', true,
    'certification_phase', 'AUDITED_READY_FOR_EVALUATION',
    'notes', 'SkyPostal Lead Market — Contractual Rates & Compliance Audited',
    'readiness_checklist', jsonb_build_object(
      'compliance_ready', true,
      'rates_ready', true,
      'fuel_ready', true,
      'pricing_ready', true,
      'checkout_ready', true,
      'api_ready', false, -- Awaiting live production API credentials
      'tracking_ready', true,
      'security_ready', true,
      'financial_ready', true,
      'kill_switch_available', true
    )
  ),
  updated_at = now()
WHERE country_code = 'CL';

-- 3. Ensure México is completely modeled and initialized as DISABLED
INSERT INTO public.international_markets (
  country_code, country_name, currency, logistics_mode, market_status,
  public_enabled, checkout_enabled, preview_enabled, provider, provider_environment,
  sort_order, metadata, updated_at
) VALUES (
  'MX', 'México', 'MXN', 'SKYPOSTAL', 'DISABLED',
  false, false, false, 'skypostal', 'test',
  8, '{"flag":"🇲🇽","target_tier":"tier_3","notes":"Standard MX-340 & Regulated MX-340-R"}', now()
)
ON CONFLICT (country_code) DO UPDATE SET
  logistics_mode = 'SKYPOSTAL',
  provider = 'skypostal',
  provider_environment = 'test',
  updated_at = now();

-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: Vendor Settings Real Schema
-- Applied: 2026-08-03
-- ══════════════════════════════════════════════════════════════

-- 1. Add functional columns to vendors table
ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS banner_url text,
ADD COLUMN IF NOT EXISTS contact_email text,
ADD COLUMN IF NOT EXISTS contact_phone text,
ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb,

ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS tax_id text,
ADD COLUMN IF NOT EXISTS kyc_documents jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'pending',

ADD COLUMN IF NOT EXISTS vendor_payment_settings jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS shipping_settings jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS pickup_address jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS vendor_settings jsonb DEFAULT '{}'::jsonb;

-- 2. Security Trigger: Prevent vendors from changing their own kyc_status
CREATE OR REPLACE FUNCTION check_vendor_kyc_status_update()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- Only do something if kyc_status actually changed
    IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
        -- Check if the current user is an admin
        SELECT is_admin INTO v_is_admin 
        FROM public.profiles 
        WHERE id = auth.uid();

        -- If not an admin, deny the update (revert to OLD kyc_status)
        IF v_is_admin IS NOT TRUE THEN
            NEW.kyc_status := OLD.kyc_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_vendor_kyc_status_update ON public.vendors;
CREATE TRIGGER trg_prevent_vendor_kyc_status_update
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW
    EXECUTE FUNCTION check_vendor_kyc_status_update();

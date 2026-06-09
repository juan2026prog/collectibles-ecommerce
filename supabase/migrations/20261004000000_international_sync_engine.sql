-- Migration to add Amazon delivery info sync logic

-- 1. Create Settings Table
CREATE TABLE IF NOT EXISTS public.international_sync_settings (
    id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    auto_sync_enabled boolean DEFAULT true,
    sync_interval_minutes int DEFAULT 5,
    safety_margin_percent numeric DEFAULT 8,
    auto_purchase_enabled boolean DEFAULT false,
    block_payment_on_price_change boolean DEFAULT true,
    allow_price_update_before_payment boolean DEFAULT true,
    only_prime boolean DEFAULT false,
    include_non_prime boolean DEFAULT true,
    updated_at timestamptz DEFAULT now()
);

-- Insert default row if not exists
INSERT INTO public.international_sync_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Alter international_products
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS sync_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending', -- pending, synced, failed, stale, unavailable
ADD COLUMN IF NOT EXISTS amazon_prime boolean,
ADD COLUMN IF NOT EXISTS price_last_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS availability_last_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS price_valid_until timestamptz,
ADD COLUMN IF NOT EXISTS last_price_usd numeric,
ADD COLUMN IF NOT EXISTS price_change_percent numeric,
ADD COLUMN IF NOT EXISTS safety_margin_percent numeric DEFAULT 8,
ADD COLUMN IF NOT EXISTS max_allowed_price_usd numeric,
ADD COLUMN IF NOT EXISTS auto_purchase_enabled boolean DEFAULT false;

-- Update existing records to have last_price_usd = base_price_usd
UPDATE public.international_products SET last_price_usd = base_price_usd WHERE last_price_usd IS NULL;

-- 3. Create Logs Table
CREATE TABLE IF NOT EXISTS public.international_product_sync_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES public.international_products(id) ON DELETE CASCADE,
    old_price_usd numeric,
    new_price_usd numeric,
    old_availability text,
    new_availability text,
    old_prime boolean,
    new_prime boolean,
    sync_status text,
    error_message text,
    raw_response jsonb,
    created_at timestamptz DEFAULT now()
);

-- 4. Setup pg_cron for the background sync
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zinc-sync-published-products-job') THEN
        PERFORM cron.unschedule('zinc-sync-published-products-job');
    END IF;
END $$;

SELECT cron.schedule(
    'zinc-sync-published-products-job',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-sync-published-products',
        headers := '{"Content-Type": "application/json", "x-zinc-sync-bypass": "collectibles-zinc-sync-secret"}'::jsonb
    );
    $$
);

-- Helper function to unschedule and reschedule
CREATE OR REPLACE FUNCTION public.update_international_sync_cron()
RETURNS trigger AS $function$
DECLARE
    cron_expr text;
BEGIN
    -- Only do this if settings changed or on insert
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.auto_sync_enabled IS DISTINCT FROM OLD.auto_sync_enabled OR NEW.sync_interval_minutes IS DISTINCT FROM OLD.sync_interval_minutes)) THEN
        -- Remove existing cron job if exists
        PERFORM cron.unschedule('zinc-sync-published-products-job');
        
        IF NEW.auto_sync_enabled AND NEW.sync_interval_minutes > 0 THEN
            cron_expr := '*/' || NEW.sync_interval_minutes::text || ' * * * *';
            PERFORM cron.schedule(
                'zinc-sync-published-products-job',
                cron_expr,
                $$
                SELECT net.http_post(
                    url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-sync-published-products',
                    headers := '{"Content-Type": "application/json", "x-zinc-sync-bypass": "collectibles-zinc-sync-secret"}'::jsonb
                );
                $$
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_international_sync_cron_trigger
AFTER INSERT OR UPDATE ON public.international_sync_settings
FOR EACH ROW EXECUTE FUNCTION public.update_international_sync_cron();

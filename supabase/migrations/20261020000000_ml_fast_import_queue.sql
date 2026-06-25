-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Fast Import Queue & Worker Schema
-- Applied: 2026-10-20
-- ══════════════════════════════════════════════════════════════

-- 1. Create Import Jobs table
CREATE TABLE IF NOT EXISTS public.ml_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
    seller_id TEXT REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled', 'paused')) DEFAULT 'pending',
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    imported_items INTEGER DEFAULT 0,
    skipped_items INTEGER DEFAULT 0,
    error_items INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Job Items table
CREATE TABLE IF NOT EXISTS public.ml_import_job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.ml_import_jobs(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
    ml_item_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for Optimization
CREATE INDEX IF NOT EXISTS idx_ml_import_jobs_vendor ON public.ml_import_jobs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ml_import_jobs_status ON public.ml_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ml_import_job_items_job ON public.ml_import_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_ml_import_job_items_status ON public.ml_import_job_items(status);
CREATE INDEX IF NOT EXISTS idx_ml_import_job_items_ml_item ON public.ml_import_job_items(ml_item_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.ml_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_import_job_items ENABLE ROW LEVEL SECURITY;

-- 5. Define Access Policies
-- ml_import_jobs Policies
DROP POLICY IF EXISTS "Admins manage all import jobs" ON public.ml_import_jobs;
CREATE POLICY "Admins manage all import jobs" ON public.ml_import_jobs
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own import jobs" ON public.ml_import_jobs;
CREATE POLICY "Vendors manage own import jobs" ON public.ml_import_jobs
    FOR ALL USING (
        vendor_id = auth.uid()
    );

-- ml_import_job_items Policies
DROP POLICY IF EXISTS "Admins manage all job items" ON public.ml_import_job_items;
CREATE POLICY "Admins manage all job items" ON public.ml_import_job_items
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own job items" ON public.ml_import_job_items;
CREATE POLICY "Vendors manage own job items" ON public.ml_import_job_items
    FOR ALL USING (
        vendor_id = auth.uid()
    );

-- 6. Schedule cron job using pg_net http_post
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ml-import-queue-process') THEN
        PERFORM cron.unschedule('ml-import-queue-process');
    END IF;
END $$;

SELECT cron.schedule(
    'ml-import-queue-process',
    '* * * * *', -- Run every minute
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/ml-import-worker',
        headers := '{"Content-Type": "application/json", "x-test-bypass": "collectibles-ml-test-secret"}'::jsonb,
        body := '{"action": "process_queue"}'::jsonb
    );
    $$
);

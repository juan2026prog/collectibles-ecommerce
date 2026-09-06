-- Migration: 20261231000000_zinc_international_returns.sql
-- Description: Table and policies for Miami International Returns (RMA) via Zinc API V2.

-- 1. Create table public.international_return_requests
CREATE TABLE IF NOT EXISTS public.international_return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE,
    international_order_item_id UUID REFERENCES public.international_order_items(id) ON DELETE CASCADE,
    zinc_order_id TEXT NOT NULL,
    zinc_return_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'denied', 'credited', 'cancelled')),
    reason TEXT NOT NULL CHECK (reason IN (
        'damaged', 
        'not_delivered', 
        'empty_box', 
        'wrong_item', 
        'defective', 
        'not_as_described', 
        'wrong_size', 
        'no_longer_needed', 
        'forced_cancellation', 
        'other'
    )),
    notes TEXT,
    resolution_notes TEXT,
    label_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    merchant_return_id TEXT,
    zinc_response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_intl_return_requests_order_id 
    ON public.international_return_requests (order_id);

CREATE INDEX IF NOT EXISTS idx_intl_return_requests_zinc_order_id 
    ON public.international_return_requests (zinc_order_id);

CREATE INDEX IF NOT EXISTS idx_intl_return_requests_zinc_return_id 
    ON public.international_return_requests (zinc_return_id);

CREATE INDEX IF NOT EXISTS idx_intl_return_requests_status 
    ON public.international_return_requests (status);

-- 3. Enable RLS
ALTER TABLE public.international_return_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Admin users full access on international_return_requests" ON public.international_return_requests;
CREATE POLICY "Admin users full access on international_return_requests" 
    ON public.international_return_requests
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role full access on international_return_requests" ON public.international_return_requests;
CREATE POLICY "Service role full access on international_return_requests" 
    ON public.international_return_requests
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view their own international_return_requests" ON public.international_return_requests;
CREATE POLICY "Customers can view their own international_return_requests" 
    ON public.international_return_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = international_return_requests.order_id 
            AND orders.user_id = auth.uid()
        )
    );

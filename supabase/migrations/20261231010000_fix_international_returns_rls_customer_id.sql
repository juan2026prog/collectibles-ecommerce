-- Migration: 20261231010000_fix_international_returns_rls_customer_id.sql
-- Description: Fix RLS policy on international_return_requests to check customer_id or user_id on orders.

DROP POLICY IF EXISTS "Customers can view their own international_return_requests" ON public.international_return_requests;

CREATE POLICY "Customers can view their own international_return_requests" 
    ON public.international_return_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = international_return_requests.order_id 
            AND COALESCE(orders.customer_id, orders.user_id) = auth.uid()
        )
    );

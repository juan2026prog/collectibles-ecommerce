-- Migration: Allow customers to view their own payment attempts and records
-- Date: 2027-11-04

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payments' AND policyname = 'Customers can view own payments'
    ) THEN
        CREATE POLICY "Customers can view own payments" ON public.payments
        FOR SELECT
        USING (
            is_order_customer(order_id, (SELECT auth.uid()))
        );
    END IF;
END $$;

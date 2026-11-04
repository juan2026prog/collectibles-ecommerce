-- Migration: Allow customers to view product variants associated with their own orders
-- Date: 2027-11-04

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'product_variants' AND policyname = 'Customers can view variants of ordered products'
    ) THEN
        CREATE POLICY "Customers can view variants of ordered products" ON public.product_variants
        FOR SELECT
        USING (
            is_active = true OR
            EXISTS (
                SELECT 1 FROM public.order_items oi
                JOIN public.orders o ON o.id = oi.order_id
                WHERE oi.variant_id = product_variants.id
                  AND (o.customer_id = (SELECT auth.uid()) OR o.user_id = (SELECT auth.uid()))
            )
        );
    END IF;
END $$;

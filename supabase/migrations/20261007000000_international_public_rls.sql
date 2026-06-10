-- Migration to allow public to see basic international product info
-- This is necessary to show the "Tiendamia style" list price and discounts

CREATE POLICY "Public can select published international_products" 
ON public.international_products FOR SELECT
USING (status = 'published');

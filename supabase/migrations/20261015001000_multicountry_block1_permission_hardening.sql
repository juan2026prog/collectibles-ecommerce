-- Block 1: explicit privileges after market and wishlist setup.
-- Supabase can grant functions/table privileges directly to anon.
REVOKE EXECUTE ON FUNCTION public.toggle_external_product_wishlist(text, text) FROM anon;
REVOKE ALL ON TABLE public.user_external_wishlist FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.external_product_interest, public.international_markets FROM anon;
GRANT SELECT ON TABLE public.external_product_interest, public.international_markets TO anon;

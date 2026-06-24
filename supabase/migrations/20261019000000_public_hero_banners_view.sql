-- Create a view in public schema pointing to beyblade.hero_banners
CREATE OR REPLACE VIEW public.hero_banners WITH (security_invoker = true) AS
  SELECT * FROM beyblade.hero_banners;

-- Grant permissions to public view and underlying table to allow selects and modifications
GRANT SELECT, INSERT, UPDATE, DELETE ON beyblade.hero_banners TO authenticated;
GRANT SELECT ON beyblade.hero_banners TO anon;

GRANT SELECT ON public.hero_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hero_banners TO authenticated;
GRANT ALL ON public.hero_banners TO service_role;

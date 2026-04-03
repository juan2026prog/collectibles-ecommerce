-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Phase 3: Complete RLS coverage, missing policies, 
-- inventory RPC, auth helpers, and schema gaps
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. MISSING COLUMNS ON ORDERS (referenced by checkout flow)
-- ────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text DEFAULT 'UYU';

-- Rename customer_id → user_id compatibility (core_schema uses customer_id)
-- We add a product_id alias on order_items too (checkout references it)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price numeric(10,2);

-- ────────────────────────────────────────────────────────────
-- 2. ENABLE RLS ON ALL ADVANCED TABLES MISSING IT
-- ────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_messages ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3. RLS POLICIES FOR ADVANCED MODULE TABLES
-- ────────────────────────────────────────────────────────────

-- 3a. Invoices
CREATE POLICY "Admins manage all invoices" ON invoices FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users view own invoices" ON invoices FOR SELECT 
  USING (user_id = auth.uid());

-- 3b. Order Disputes
CREATE POLICY "Admins manage all disputes" ON order_disputes FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Customers view own disputes" ON order_disputes FOR SELECT 
  USING (customer_id = auth.uid());
CREATE POLICY "Customers can open disputes" ON order_disputes FOR INSERT 
  WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Vendors view disputes on their orders" ON order_disputes FOR SELECT 
  USING (vendor_id = auth.uid());

-- 3c. Warehouses (admin only)
CREATE POLICY "Admins manage warehouses" ON warehouses FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Vendors can view active warehouses" ON warehouses FOR SELECT 
  USING (is_active = true AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_vendor = true));

-- 3d. Vendor KYC (vendor sees own, admin sees all)
CREATE POLICY "Admins manage all KYC" ON vendor_kyc FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Vendors view own KYC" ON vendor_kyc FOR SELECT 
  USING (vendor_id = auth.uid());
CREATE POLICY "Vendors submit own KYC" ON vendor_kyc FOR INSERT 
  WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Vendors update own KYC" ON vendor_kyc FOR UPDATE 
  USING (vendor_id = auth.uid());

-- 3e. Loyalty Points
CREATE POLICY "Admins manage loyalty" ON loyalty_points FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users view own points" ON loyalty_points FOR SELECT 
  USING (user_id = auth.uid());

-- 3f. ML Messages
CREATE POLICY "Admins manage ML messages" ON ml_messages FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users view own ML messages" ON ml_messages FOR SELECT 
  USING (user_id = auth.uid());

-- 3g. Admin-level policies for Star2Fan tables (creators already have own-row policies)
CREATE POLICY "Admins manage star2fan creators" ON star2fan_creators FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Public can view available creators" ON star2fan_creators FOR SELECT 
  USING (availability_status IN ('available', 'busy'));

CREATE POLICY "Admins manage star2fan requests" ON star2fan_requests FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins manage star2fan earnings" ON star2fan_earnings FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins manage star2fan withdrawals" ON star2fan_withdrawals FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Public can view star2fan reviews" ON star2fan_reviews FOR SELECT 
  USING (true);
CREATE POLICY "Admins manage star2fan reviews" ON star2fan_reviews FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins manage star2fan notifications" ON star2fan_notifications FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- 3h. Admin-level policies for Artist tables
CREATE POLICY "Admins manage artist services" ON artist_services FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Public view active artist services" ON artist_services FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Admins manage commission requests" ON commission_requests FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins manage artist payouts" ON artist_payouts FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Public view artist reviews" ON artist_reviews FOR SELECT 
  USING (true);
CREATE POLICY "Admins manage artist reviews" ON artist_reviews FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- 3i. Admin policies for affiliate advanced tables
CREATE POLICY "Admins manage affiliate clicks" ON affiliate_clicks FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins manage affiliate payouts" ON affiliate_payout_requests FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins manage promo materials" ON promo_materials FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));


-- ────────────────────────────────────────────────────────────
-- 4. PREVENT CUSTOMERS FROM SELF-PROMOTING TO ADMIN
-- Block any UPDATE that tries to set is_admin = true
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_self_admin_promotion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only the service_role (backend) can set is_admin = true
  -- Regular users through the API use the anon/authenticated key
  IF NEW.is_admin = true AND OLD.is_admin = false THEN
    -- Check if the caller is already an admin
    IF NOT (SELECT is_admin FROM profiles WHERE id = auth.uid()) THEN
      RAISE EXCEPTION 'No tiene permisos para auto-promover a administrador.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_prevent_self_admin
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_admin_promotion();


-- ────────────────────────────────────────────────────────────
-- 5. INVENTORY DECREMENT RPC (Atomic stock reduction)
-- Called by webhooks after payment confirmation
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_inventory(p_variant_id uuid, p_quantity integer)
RETURNS void AS $$
BEGIN
  UPDATE product_variants
  SET inventory_count = GREATEST(inventory_count - p_quantity, 0)
  WHERE id = p_variant_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante % no encontrada', p_variant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a check-stock function for pre-checkout validation
CREATE OR REPLACE FUNCTION check_stock(p_variant_id uuid, p_quantity integer)
RETURNS boolean AS $$
DECLARE
  current_stock integer;
BEGIN
  SELECT inventory_count INTO current_stock 
  FROM product_variants WHERE id = p_variant_id;
  
  IF current_stock IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN current_stock >= p_quantity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 6. AUTO-POPULATE PROFILE ON AUTH SIGNUP
-- Creates a profile row whenever a new user signs up
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ────────────────────────────────────────────────────────────
-- 7. SITE SETTINGS TABLE (for admin config, social links, etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can READ settings (needed for storefront footer, locale, etc.)
CREATE POLICY "Anyone can read site settings" ON site_settings FOR SELECT USING (true);
-- Only admins can write
CREATE POLICY "Admins manage site settings" ON site_settings FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Seed default settings
INSERT INTO site_settings (key, value) VALUES
  ('store_name', 'Collectibles'),
  ('store_tagline', 'Tu destino para los mejores coleccionables, figuras, juguetes y más.'),
  ('default_currency', 'UYU'),
  ('default_language', 'es'),
  ('social_instagram_enabled', 'false'),
  ('social_instagram_url', ''),
  ('social_facebook_enabled', 'false'),
  ('social_facebook_url', ''),
  ('social_tiktok_enabled', 'false'),
  ('social_tiktok_url', ''),
  ('social_whatsapp_enabled', 'false'),
  ('social_whatsapp_url', ''),
  ('social_youtube_enabled', 'false'),
  ('social_youtube_url', ''),
  ('social_x_enabled', 'false'),
  ('social_x_url', ''),
  ('payments_dlocal_go_enabled', 'false'),
  ('payments_dlocal_go_api_key', ''),
  ('payments_dlocal_go_sandbox', 'false'),
  ('payments_paypal_enabled', 'false'),
  ('payments_paypal_client_id', ''),
  ('payments_paypal_secret_key', ''),
  ('payments_paypal_sandbox', 'false')
ON CONFLICT (key) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 8. FEATURE TOGGLES TABLE (for admin module on/off)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_enabled boolean DEFAULT false,
  module text, -- 'core', 'marketplace', 'star2fan', 'affiliate', 'artist'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read toggles" ON feature_toggles FOR SELECT USING (true);
CREATE POLICY "Admins manage toggles" ON feature_toggles FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Seed modules
INSERT INTO feature_toggles (name, label, description, is_enabled, module) VALUES
  ('marketplace', 'Marketplace de Vendedores', 'Permite que vendedores externos publiquen productos', true, 'marketplace'),
  ('affiliate', 'Sistema de Afiliados', 'Links de referido y comisiones automáticas', true, 'affiliate'),
  ('artist', 'Marketplace de Artistas', 'Comisiones de arte y Print on Demand', true, 'artist'),
  ('star2fan', 'Star2Fan (Video Saludos)', 'Saludos personalizados estilo Cameo', true, 'star2fan'),
  ('loyalty', 'Programa de Lealtad', 'Puntos por compra canjeables por descuentos', false, 'core'),
  ('mercadolibre', 'Sincronización Mercado Libre', 'Publicar y sincronizar stock con MeLi', false, 'marketplace'),
  ('ai_catalog', 'Generador AI de Catálogo', 'Usar IA para generar títulos y descripciones SEO', false, 'core')
ON CONFLICT (name) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 9. SHIPPING ZONES TABLE (referenced by admin settings)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate numeric(10,2) DEFAULT 0,
  free_above numeric(10,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shipping_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read shipping zones" ON shipping_zones FOR SELECT USING (true);
CREATE POLICY "Admins manage shipping zones" ON shipping_zones FOR ALL 
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

INSERT INTO shipping_zones (name, rate, free_above, is_active) VALUES
  ('Montevideo', 250, 4000, true),
  ('Interior', 450, 6000, true),
  ('Internacional', 1500, null, false)
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 10. ADDITIONAL INDEXES FOR SECURITY & PERFORMANCE
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);
CREATE INDEX IF NOT EXISTS idx_feature_toggles_name ON feature_toggles(name);
CREATE INDEX IF NOT EXISTS idx_vendor_kyc_vendor ON vendor_kyc(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_order ON order_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_user ON loyalty_points(user_id);


-- ────────────────────────────────────────────────────────────
-- 11. UPDATED_AT AUTO-TRIGGER (applies to all tables with updated_at)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all major tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'profiles', 'orders', 'order_disputes', 'vendor_kyc',
      'commission_requests', 'star2fan_creators', 'star2fan_requests'
    ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', tbl, tbl);
  END LOOP;
END;
$$;

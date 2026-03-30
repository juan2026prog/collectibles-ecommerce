-- 1. BASE PROFILE
CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  avatar_url text,
  
  -- Modular Feature Toggles per User
  is_vendor boolean DEFAULT false,
  is_artist boolean DEFAULT false,
  is_affiliate boolean DEFAULT false,
  is_admin boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. VENDOR MODULE PROFILE
CREATE TABLE vendors (
  id uuid REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  store_name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  base_commission_rate numeric(5,2) DEFAULT 10.00, -- Platform fee %
  status text DEFAULT 'pending', -- pending, active, suspended
  created_at timestamptz DEFAULT now()
);

-- 3. ARTIST MODULE PROFILE (Cameo/Commissions)
CREATE TABLE artists (
  id uuid REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  display_name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  bio text,
  video_request_price numeric(10,2),
  is_accepting_requests boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4. AFFILIATE MODULE PROFILE
CREATE TABLE affiliates (
  id uuid REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  code text UNIQUE NOT NULL,
  base_commission_rate numeric(5,2) DEFAULT 5.00,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- 3. Ecommerce & Marketplace Catalog
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE, -- Null implies platform-owned
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  base_price numeric(10,2) NOT NULL,
  status text DEFAULT 'draft', -- draft, published, archived
  search_vector tsvector,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  name text NOT NULL, -- e.g. "Red / Large"
  price_adjustment numeric(10,2) DEFAULT 0,
  inventory_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4. Orders, Transactions, & Denormalized Payouts
CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text, -- 'percentage', 'fixed'
  discount_value numeric(10,2) NOT NULL,
  affiliate_id uuid REFERENCES affiliates(id), -- Optional: Tie coupon code to an affiliate
  expires_at timestamptz,
  is_active boolean DEFAULT true
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  total_amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, paid, processing, shipped, delivered, cancelled
  
  -- Growth & Attribution Tracking (Stored per order to freeze history)
  utm_source text,
  utm_medium text,
  utm_campaign text,
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL, -- Denormalized for rapid payout aggregation
  
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL, -- Price frozen at checkout
  
  -- Historical calculation freezing
  vendor_payout numeric(10,2) DEFAULT 0, 
  platform_fee numeric(10,2) DEFAULT 0, 
  
  created_at timestamptz DEFAULT now()
);

-- 5. Artist Video Platform (Cameo-Style)
CREATE TABLE video_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE, -- Ties to payment/refund systems
  
  instructions text NOT NULL,
  recipient_name text,
  price numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, accepted, completed, rejected, cancelled
  
  response_video_url text,
  due_date timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Financial Payouts & Commissions
CREATE TABLE affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, available, paid
  created_at timestamptz DEFAULT now()
);

CREATE TABLE vendor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, processing, paid
  created_at timestamptz DEFAULT now()
);

-- 7. Index Strategy
-- Security & Profile Queries
CREATE INDEX idx_profiles_roles ON profiles(is_vendor, is_artist, is_affiliate);

-- Catalog Lookup High Traffic
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_search ON products USING GIN (search_vector);
CREATE INDEX idx_variants_product ON product_variants(product_id);

-- Analytics & Dashboards
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_affiliate ON orders(affiliate_id);
CREATE INDEX idx_orders_utm ON orders(utm_source, utm_medium, utm_campaign);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_id);

-- Operational (Video & Influencers)
CREATE INDEX idx_video_requests_artist_status ON video_requests(artist_id, status);
CREATE INDEX idx_video_requests_customer ON video_requests(customer_id);

-- 1. Extend Affiliates Table
ALTER TABLE affiliates 
ADD COLUMN payment_method text,
ADD COLUMN payment_details jsonb;

-- 2. Affiliate Clicks Table
CREATE TABLE affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE CASCADE,
  source text,
  ip_address text,
  session_id text,
  clicked_at timestamptz DEFAULT now()
);

-- 3. Promotional Materials Table
CREATE TABLE promo_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  product_url text,
  suggested_copy text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_materials ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Affiliates can view and update their own profile
CREATE POLICY "Affiliates can view own profile" 
ON affiliates FOR SELECT USING (id = auth.uid());

CREATE POLICY "Affiliates can update own profile" 
ON affiliates FOR UPDATE USING (id = auth.uid());

-- Affiliates can view their own clicks
CREATE POLICY "Affiliates can view own clicks" 
ON affiliate_clicks FOR SELECT USING (affiliate_id = auth.uid());

-- Anyone can insert a click (visitor tracking)
CREATE POLICY "Anyone can insert clicks" 
ON affiliate_clicks FOR INSERT WITH CHECK (true);

-- Affiliates can view their own commissions
CREATE POLICY "Affiliates can view own commissions" 
ON affiliate_commissions FOR SELECT USING (affiliate_id = auth.uid());

-- Affiliates can view their own payout requests
CREATE POLICY "Affiliates can view own payouts" 
ON affiliate_payout_requests FOR SELECT USING (affiliate_id = auth.uid());

-- Affiliates can insert payout requests
CREATE POLICY "Affiliates can insert payouts" 
ON affiliate_payout_requests FOR INSERT WITH CHECK (affiliate_id = auth.uid());

-- Promo materials are viewable by all active affiliates
CREATE POLICY "Affiliates can view promo materials" 
ON promo_materials FOR SELECT USING (
  EXISTS (SELECT 1 FROM affiliates WHERE id = auth.uid() AND status = 'active')
);

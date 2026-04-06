-- CRM & Segments
CREATE TABLE customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"min_orders": 3, "min_spent": 100}
  created_at timestamptz DEFAULT now()
);

-- Add CRM metrics to profiles for fast querying
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS crm_tags text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ltv numeric(10,2) DEFAULT 0; -- Lifetime value
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS order_count integer DEFAULT 0;

-- Abandoned Checkout tracking
CREATE TABLE abandoned_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email text,
  cart_data jsonb NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  status text DEFAULT 'abandoned', -- abandoned, recovered
  recovery_email_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Analytics Alerts (BI)
CREATE TABLE admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text DEFAULT 'info', -- info, warning, critical, success
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS Policies
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access customer_segments" ON customer_segments FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
CREATE POLICY "Admin full access abandoned_checkouts" ON abandoned_checkouts FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
CREATE POLICY "Admin full access admin_alerts" ON admin_alerts FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- Customers can insert their own abandoned checkout via anonymous connection or their own session
CREATE POLICY "Anyone can insert abandoned checkouts" ON abandoned_checkouts FOR INSERT WITH CHECK (true);

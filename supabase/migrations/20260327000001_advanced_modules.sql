-- 1. Payments, Invoices, Refunds/Disputes
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  invoice_number text UNIQUE NOT NULL,
  status text DEFAULT 'issued', -- issued, paid, voided
  url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE order_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text DEFAULT 'open', -- open, resolved, refunded, closed
  resolution text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Logistics & Warehouses
CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products 
  ADD COLUMN warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN weight_kg numeric(8,3),
  ADD COLUMN dimensions jsonb, -- e.g. {"width": 10, "height": 20, "length": 5}
  ADD COLUMN is_digital boolean DEFAULT false;

-- 3. Vendor Logistics & Payouts (Marketplace)
ALTER TABLE vendor_payouts
  ADD COLUMN receipt_url text,
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN paid_at timestamptz;

CREATE TABLE vendor_kyc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE UNIQUE,
  document_front_url text,
  document_back_url text,
  tax_id text,
  bank_details jsonb,
  status text DEFAULT 'pending', -- pending, verified, rejected
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vendors 
  ADD COLUMN shipping_mode text DEFAULT 'platform'; -- platform, self_fulfillment

-- 4. Artist Marketplace & Print-on-Demand
ALTER TABLE products 
  ADD COLUMN print_file_url text,
  ADD COLUMN mockup_file_url text;

ALTER TABLE orders 
  ADD COLUMN is_print_on_demand boolean DEFAULT false;

-- 5. Cameo Greetings (Video Restrictions & Watermarks)
ALTER TABLE video_requests 
  ADD COLUMN watermark_required boolean DEFAULT true,
  ADD COLUMN video_duration_sec integer;

-- 6. Affiliate Payouts & CRM Loyalty
CREATE TABLE affiliate_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, approved, paid, rejected
  receipt_url text,
  requested_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE loyalty_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles 
  ADD COLUMN total_loyalty_points integer DEFAULT 0;

-- 7. Mercado Libre Messaging
CREATE TABLE ml_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_order_id text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  sender_type text NOT NULL, -- buyer, seller
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

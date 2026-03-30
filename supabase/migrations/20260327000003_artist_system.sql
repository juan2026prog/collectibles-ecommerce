-- 1. Extend Artists Table
ALTER TABLE artists 
ADD COLUMN legal_name text,
ADD COLUMN phone text,
ADD COLUMN banner_url text,
ADD COLUMN specialties jsonb DEFAULT '[]'::jsonb,
ADD COLUMN art_styles jsonb DEFAULT '[]'::jsonb,
ADD COLUMN country text,
ADD COLUMN city text,
ADD COLUMN languages jsonb DEFAULT '[]'::jsonb,
ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb,
ADD COLUMN commission_status text DEFAULT 'open', -- open, busy, waitlist, closed
ADD COLUMN payment_method text,
ADD COLUMN payment_details jsonb,
ADD COLUMN estimated_delivery_time text,
ADD COLUMN terms_of_service text;

-- 2. Artist Services
CREATE TABLE artist_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  base_price numeric(10,2) NOT NULL,
  estimated_days integer,
  revisions_included integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Commission Requests
CREATE TABLE commission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_email text,
  service_id uuid REFERENCES artist_services(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  agreed_price numeric(10,2) NOT NULL,
  deposit_amount numeric(10,2) DEFAULT 0,
  revisions_included integer DEFAULT 0,
  revisions_used integer DEFAULT 0,
  status text DEFAULT 'new', -- new, pending_acceptance, approved, waiting_payment, in_progress, sketch_sent, in_review, revision_requested, finalizing, completed, delivered, cancelled
  due_date timestamptz,
  requested_delivery_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- 4. Commission Files & Messaging
CREATE TABLE commission_reference_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid REFERENCES commission_requests(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  uploaded_by text, -- 'artist' or 'client'
  created_at timestamptz DEFAULT now()
);

CREATE TABLE commission_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid REFERENCES commission_requests(id) ON DELETE CASCADE,
  sender_role text NOT NULL, -- 'artist' or 'client'
  message text NOT NULL,
  attachment_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE commission_delivery_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid REFERENCES commission_requests(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  version_label text, -- pre-sketch, sketch, final
  is_final boolean DEFAULT false,
  payment_required_to_download boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE commission_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid REFERENCES commission_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_label text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 5. Artist Payouts
CREATE TABLE artist_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, processed, paid, rejected
  payment_method text,
  notes text,
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- 6. Artist Reviews
CREATE TABLE artist_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  reviewer_name text,
  created_at timestamptz DEFAULT now()
);

-- 7. RLS
ALTER TABLE artist_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_reference_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_delivery_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_reviews ENABLE ROW LEVEL SECURITY;

-- 8. Policies
CREATE POLICY "Artists view own profile" ON artists FOR SELECT USING (id = auth.uid());
CREATE POLICY "Artists update own profile" ON artists FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Artists access own services" ON artist_services FOR ALL USING (artist_id = auth.uid());
CREATE POLICY "Artists access own commissions" ON commission_requests FOR ALL USING (artist_id = auth.uid());
CREATE POLICY "Artists access own ref files" ON commission_reference_files FOR ALL USING (commission_id IN (SELECT id FROM commission_requests WHERE artist_id = auth.uid()));
CREATE POLICY "Artists access own msgs" ON commission_messages FOR ALL USING (commission_id IN (SELECT id FROM commission_requests WHERE artist_id = auth.uid()));
CREATE POLICY "Artists access own deliveries" ON commission_delivery_files FOR ALL USING (commission_id IN (SELECT id FROM commission_requests WHERE artist_id = auth.uid()));
CREATE POLICY "Artists access own logs" ON commission_activity_log FOR ALL USING (commission_id IN (SELECT id FROM commission_requests WHERE artist_id = auth.uid()));
CREATE POLICY "Artists access own payouts" ON artist_payouts FOR ALL USING (artist_id = auth.uid());
CREATE POLICY "Artists access own reviews" ON artist_reviews FOR SELECT USING (artist_id = auth.uid());

-- Star2Fan Schema Update
-- Creating the Cameo-like personalized video greeting module

-- 1. star2fan_creators
CREATE TABLE IF NOT EXISTS star2fan_creators (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text,
  stage_name text,
  real_name text,
  profile_photo_url text,
  cover_banner_url text,
  category text,
  short_bio text,
  standard_price numeric(10,2) DEFAULT 0,
  premium_price numeric(10,2) DEFAULT 0,
  rush_delivery_price numeric(10,2) DEFAULT 0,
  estimated_delivery_time int DEFAULT 3, -- in days
  languages jsonb DEFAULT '["es"]',
  country text,
  availability_status text DEFAULT 'available', -- available, busy, paused, out_of_service
  social_links jsonb,
  content_rules text,
  accepted_request_types jsonb,
  rejected_request_types jsonb,
  blocked_keywords text,
  approximate_video_duration int DEFAULT 60, -- in seconds
  daily_request_limit int DEFAULT 10,
  weekly_request_limit int DEFAULT 50,
  auto_pause_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators can view their own profile" ON star2fan_creators FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Creators can update their own profile" ON star2fan_creators FOR UPDATE USING (auth.uid() = id);

-- 2. star2fan_video_samples
CREATE TABLE IF NOT EXISTS star2fan_video_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  title text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_video_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage their own samples" ON star2fan_video_samples FOR ALL USING (auth.uid() = creator_id);

-- 3. star2fan_requests
CREATE TABLE IF NOT EXISTS star2fan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  fan_buyer_name text NOT NULL,
  fan_buyer_email text,
  recipient_name text NOT NULL,
  occasion text,
  instructions text,
  name_pronunciation text,
  requested_language text DEFAULT 'es',
  purchase_date timestamptz DEFAULT now(),
  delivery_deadline timestamptz,
  price numeric(10,2) NOT NULL,
  priority text DEFAULT 'normal', -- normal, urgent
  status text DEFAULT 'new', -- new, pending_acceptance, accepted, recording, internal_review, delivered, completed, rejected, cancelled, overdue
  payment_status text DEFAULT 'pending', -- pending, authorized, captured, refunded
  internal_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  delivered_at timestamptz
);

ALTER TABLE star2fan_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage their own requests" ON star2fan_requests FOR ALL USING (auth.uid() = creator_id);

-- 4. star2fan_request_videos
CREATE TABLE IF NOT EXISTS star2fan_request_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES star2fan_requests(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  file_name text,
  file_size bigint,
  duration_seconds int,
  format text,
  is_final boolean DEFAULT false,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_request_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage their own videos" ON star2fan_request_videos FOR ALL USING (auth.uid() = creator_id);

-- 5. star2fan_deliveries
CREATE TABLE IF NOT EXISTS star2fan_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES star2fan_requests(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  final_video_url text NOT NULL,
  delivery_date timestamptz DEFAULT now(),
  delivery_status text DEFAULT 'delivered',
  opened_by_fan boolean DEFAULT false,
  played_by_fan boolean DEFAULT false,
  ready_for_download boolean DEFAULT true,
  ready_for_streaming boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage their own deliveries" ON star2fan_deliveries FOR ALL USING (auth.uid() = creator_id);

-- 6. star2fan_earnings
CREATE TABLE IF NOT EXISTS star2fan_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  request_id uuid REFERENCES star2fan_requests(id) ON DELETE SET NULL,
  gross_amount numeric(10,2) NOT NULL,
  platform_fee numeric(10,2) NOT NULL,
  net_amount numeric(10,2) NOT NULL,
  payment_status text DEFAULT 'held', -- held, pending, available, paid, refunded
  available_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view their own earnings" ON star2fan_earnings FOR SELECT USING (auth.uid() = creator_id);

-- 7. star2fan_withdrawals
CREATE TABLE IF NOT EXISTS star2fan_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending', -- pending, processed, rejected
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  payment_method text,
  notes text
);

ALTER TABLE star2fan_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage their withdrawals" ON star2fan_withdrawals FOR ALL USING (auth.uid() = creator_id);

-- 8. star2fan_reviews
CREATE TABLE IF NOT EXISTS star2fan_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  request_id uuid REFERENCES star2fan_requests(id) ON DELETE SET NULL,
  rating int CHECK (rating >= 1 AND rating <= 5),
  comment text,
  reviewer_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view their own reviews" ON star2fan_reviews FOR SELECT USING (auth.uid() = creator_id);

-- 9. star2fan_notifications
CREATE TABLE IF NOT EXISTS star2fan_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES star2fan_creators(id) ON DELETE CASCADE,
  type text NOT NULL, -- new_request, urgent_request, payout_released, new_review
  title text,
  message text,
  is_read boolean DEFAULT false,
  related_request_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage their notifications" ON star2fan_notifications FOR ALL USING (auth.uid() = creator_id);

-- 10. star2fan_support_resources
CREATE TABLE IF NOT EXISTS star2fan_support_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  content text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_support_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read support" ON star2fan_support_resources FOR SELECT USING (is_active = true);

-- 11. star2fan_request_history
CREATE TABLE IF NOT EXISTS star2fan_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES star2fan_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_label text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star2fan_request_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators view their request history" ON star2fan_request_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM star2fan_requests WHERE star2fan_requests.id = star2fan_request_history.request_id AND star2fan_requests.creator_id = auth.uid())
);

---------------------------------------
-- SEED DATA FUNCTION GENERATOR
---------------------------------------
-- We create dummy data by associating it with a known auth user if they exist, or via a trigger on user signup.
-- Since we are migrating an existing system where we don't know the exact auth id, we create a function 
-- that the frontend can call to "seed" the creator profile if it doesn't exist.

CREATE OR REPLACE FUNCTION seed_star2fan_demo()
RETURNS void AS $$
DECLARE
  first_user_id uuid;
  req1_id uuid;
  req2_id uuid;
  req3_id uuid;
BEGIN
  -- Get the first user to use as demo creator
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;
  
  IF first_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Create Creator Profile if not exists
  INSERT INTO star2fan_creators (id, email, stage_name, category, short_bio, standard_price, premium_price, rush_delivery_price)
  VALUES (first_user_id, 'demo@star2fan.com', 'Lionel Actor', 'Actor', 'Actor y cantante, disponible para tus saludos!', 50.00, 100.00, 20.00)
  ON CONFLICT (id) DO NOTHING;

  -- Check if requests exist
  IF NOT EXISTS (SELECT 1 FROM star2fan_requests WHERE creator_id = first_user_id) THEN
    -- Request 1: New
    INSERT INTO star2fan_requests (id, creator_id, fan_buyer_name, recipient_name, occasion, instructions, price, priority, status, delivery_deadline)
    VALUES (gen_random_uuid(), first_user_id, 'Martin', 'Sofia', 'birthday', 'Dile feliz cumpleaños a mi novia Sofía, que le encanta tu papel en la novela.', 50.00, 'normal', 'new', now() + interval '3 days')
    RETURNING id INTO req1_id;

    -- Request 2: Urgent
    INSERT INTO star2fan_requests (id, creator_id, fan_buyer_name, recipient_name, occasion, instructions, price, priority, status, delivery_deadline)
    VALUES (gen_random_uuid(), first_user_id, 'Laura', 'Pedro', 'anniversary', 'Es nuestro aniversario, por favor enviale un saludo a Pedro.', 70.00, 'urgent', 'pending_acceptance', now() + interval '12 hours')
    RETURNING id INTO req2_id;

    -- Request 3: Delivered
    INSERT INTO star2fan_requests (id, creator_id, fan_buyer_name, recipient_name, occasion, instructions, price, priority, status, delivery_deadline, delivered_at)
    VALUES (gen_random_uuid(), first_user_id, 'Carlos', 'Carlos', 'motivation', 'Un saludo para mí mismo.', 50.00, 'normal', 'delivered', now() - interval '2 days', now() - interval '1 day')
    RETURNING id INTO req3_id;

    -- Insert Earnings
    INSERT INTO star2fan_earnings (creator_id, request_id, gross_amount, platform_fee, net_amount, payment_status, available_at)
    VALUES (first_user_id, req3_id, 50.00, 10.00, 40.00, 'available', now());

    -- Insert Reviews
    INSERT INTO star2fan_reviews (creator_id, request_id, rating, comment, reviewer_name)
    VALUES (first_user_id, req3_id, 5, 'Increíble saludo, super rápido y amable.', 'Carlos');

    -- Insert Notifications
    INSERT INTO star2fan_notifications (creator_id, type, title, message, related_request_id)
    VALUES (first_user_id, 'new_request', 'Nueva Solicitud', 'Llegó una nueva solicitud de Martin.', req1_id);
  END IF;

  -- Insert Support
  INSERT INTO star2fan_support_resources (title, category, content)
  VALUES ('Guía de iluminación', 'tips', 'Asegúrate de tener la luz de frente, no a tus espaldas.')
  ON CONFLICT DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- Execute the seed function immediately
SELECT seed_star2fan_demo();

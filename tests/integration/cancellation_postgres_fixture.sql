-- Minimal isolated PostgreSQL fixture for cancel/refund migrations.
-- No production database, merchant credentials or actual customer data involved.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $ SELECT jsonb_build_object('role',coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')) $;
CREATE TABLE public.order_items(id uuid PRIMARY KEY,order_id uuid,suborder_id uuid);
CREATE TABLE public.profiles(id uuid PRIMARY KEY, is_admin boolean);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY, total_amount numeric NOT NULL,
  payment_method text, payment_status text, reconciliation_status text,
  status text, order_source text, ml_order_id text,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.order_suborders (
  id uuid PRIMARY KEY, parent_order_id uuid REFERENCES public.orders(id),
  suborder_number text, status text, shipping_status text, product_subtotal numeric,
  discount_total numeric DEFAULT 0, shipping_charged_to_customer numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id),
  status text, refund_amount numeric, refund_date timestamptz,
  provider_refund_id text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  suborder_id uuid, payment_id uuid,
  provider text, provider_refund_id text,
  amount numeric NOT NULL, status text NOT NULL,
  processed_at timestamptz, updated_at timestamptz DEFAULT now(),
  api_response jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE public.manual_refund_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id),
  payment_provider text, payment_id text, amount numeric,
  status text, completed_at timestamptz,
  completed_by uuid, external_reference text, proof_url text
);
CREATE TABLE public.unified_order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id),
  suborder_id uuid, status text,
  request_type text, resolved_at timestamptz, resolved_by uuid,
  admin_notes text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, action text,
  order_id uuid, suborder_id uuid, payment_id uuid,
  refund_id uuid, provider text, amount numeric, api_response jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id), normalized_status text,
  checkout_session_id text, cancelled_at timestamptz
);
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id), suborder_id uuid,
  shipping_status text, shipping_label_url text, external_guide text,
  dispatched_at timestamptz
);
CREATE TABLE storage.objects(bucket_id text, name text);

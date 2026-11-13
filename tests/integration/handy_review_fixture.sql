CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $auth$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $auth$;

CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_admin boolean,role text);
CREATE TABLE public.orders(
 id uuid PRIMARY KEY,
 customer_id uuid,user_id uuid,payment_method text,ml_order_id text,order_source text,
 reconciliation_status text,payment_status text,total_amount numeric,currency text
);
CREATE TABLE public.payment_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid, normalized_status text);
CREATE TABLE public.unified_order_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL,customer_id uuid,
 business_model text NOT NULL,request_type text NOT NULL,status text NOT NULL,
 amount_requested numeric NOT NULL,currency text NOT NULL,reason text NOT NULL,
 customer_notes text,admin_notes text,updated_at timestamptz DEFAULT now(),
 resolved_by uuid,resolved_at timestamptz,idempotency_key text UNIQUE
);
ALTER TABLE public.unified_order_requests ADD CONSTRAINT
 unified_order_requests_request_type_check
 CHECK(request_type IN ('full_refund','partial_refund'));

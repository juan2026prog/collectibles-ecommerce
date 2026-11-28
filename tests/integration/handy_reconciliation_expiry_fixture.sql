-- Standalone PostgreSQL fixture for testing the existing release function and
-- the new manual-reconciliation hold without touching production data.
CREATE TABLE public.orders(
  id uuid PRIMARY KEY, status text NOT NULL, payment_status text,
  reconciliation_status text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.stock_reservations(
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id),
  status text, reserved_until timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.payments(
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id), status text
);
CREATE TABLE public.payment_attempts(
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id),
  normalized_status text
);
CREATE TABLE public.order_suborders(
  id uuid PRIMARY KEY, parent_order_id uuid REFERENCES public.orders(id),
  status text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.order_items(
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id)
);
CREATE TABLE public.preorder_items(
  id uuid PRIMARY KEY, order_item_id uuid REFERENCES public.order_items(id),
  status text, updated_at timestamptz DEFAULT now()
);

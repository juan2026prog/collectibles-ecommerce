-- Add new columns for Logistics, Order statuses, and Assisted Purchase
ALTER TABLE orders
  ADD COLUMN tracking_number text,
  ADD COLUMN tracking_provider text DEFAULT 'Correo Uruguayo',
  ADD COLUMN delivery_notes text,
  ADD COLUMN is_assisted_purchase boolean DEFAULT false,
  ADD COLUMN assisted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN shipping_address jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN customer_email text,
  ADD COLUMN customer_phone text;

-- Add tracking updates log table
CREATE TABLE order_tracking_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  status_text text NOT NULL,
  location text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_order_tracking_updates_order ON order_tracking_updates(order_id);

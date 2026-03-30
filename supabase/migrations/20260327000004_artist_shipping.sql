-- Add shipping and physical commission support
ALTER TABLE commission_requests
ADD COLUMN is_physical boolean DEFAULT false,
ADD COLUMN shipping_address jsonb,
ADD COLUMN tracking_number text,
ADD COLUMN shipping_courier text,
ADD COLUMN shipping_status text DEFAULT 'pending'; -- pending, shipped, delivered, returned

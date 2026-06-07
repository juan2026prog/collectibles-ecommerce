-- Add paid_at to vendor_payouts
ALTER TABLE vendor_payouts
ADD COLUMN IF NOT EXISTS paid_at timestamptz;

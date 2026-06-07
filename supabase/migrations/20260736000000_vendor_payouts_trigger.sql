-- Add order tracking to vendor_payouts
ALTER TABLE vendor_payouts
ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS fee_percentage numeric(5,2) DEFAULT 15.00;

-- Create the trigger function
CREATE OR REPLACE FUNCTION handle_vendor_payout()
RETURNS TRIGGER AS $$
DECLARE
  v_fee_percentage numeric;
  v_vendor_amount numeric;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    -- Basic flat 15% platform fee.
    v_fee_percentage := 15.00;
    
    -- Vendor gets 85% of the total price of the item
    v_vendor_amount := NEW.total_price * (1 - (v_fee_percentage / 100.0));

    INSERT INTO vendor_payouts (
      vendor_id,
      order_id,
      order_item_id,
      amount,
      fee_percentage,
      status
    ) VALUES (
      NEW.vendor_id,
      NEW.order_id,
      NEW.id,
      v_vendor_amount,
      v_fee_percentage,
      'pending'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger
DROP TRIGGER IF EXISTS on_order_item_created ON order_items;
CREATE TRIGGER on_order_item_created
AFTER INSERT ON order_items
FOR EACH ROW
EXECUTE FUNCTION handle_vendor_payout();

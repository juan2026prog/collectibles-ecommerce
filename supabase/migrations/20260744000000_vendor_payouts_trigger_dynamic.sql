-- Replace the trigger function to use dynamic vendor commission rates
CREATE OR REPLACE FUNCTION handle_vendor_payout()
RETURNS TRIGGER AS $$
DECLARE
  v_fee_percentage numeric;
  v_vendor_amount numeric;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    
    -- Query the specific base_commission_rate from the vendor
    SELECT COALESCE(base_commission_rate, 10.00)
    INTO v_fee_percentage
    FROM vendors
    WHERE id = NEW.vendor_id;

    -- Fallback safety measure if record is not found or null
    IF v_fee_percentage IS NULL THEN
       v_fee_percentage := 10.00;
    END IF;

    -- Vendor gets 100% minus the fee percentage
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

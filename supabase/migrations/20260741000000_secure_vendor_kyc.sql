-- Secure vendor kyc_status updates
CREATE OR REPLACE FUNCTION secure_kyc_status_update()
RETURNS trigger AS $$
BEGIN
  -- Si el usuario es service_role, permitir libremente
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Si el kyc_status cambió
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    -- Check if it's an admin doing it
    IF EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        RETURN NEW;
    END IF;

    -- Si no es admin, el vendor NO PUEDE aprobarse ni rechazarse a sí mismo
    IF NEW.kyc_status IN ('approved', 'rejected') THEN
      NEW.kyc_status := OLD.kyc_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_secure_kyc_status_update ON vendors;
CREATE TRIGGER tr_secure_kyc_status_update
  BEFORE UPDATE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION secure_kyc_status_update();

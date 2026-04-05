-- PayPal settings initialization
INSERT INTO site_settings (key, value) VALUES 
  ('payments_paypal_client_id', ''),
  ('payments_paypal_client_secret', ''),
  ('payments_paypal_sandbox', 'true'),
  ('payments_paypal_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Shipping Rules Table (para AdminSettings.tsx)
-- Table already exists, just need to insert seed data if empty
INSERT INTO shipping_rules (zone, rate, free_above, is_active) VALUES
  ('Montevideo', 250, 4000, true),
  ('Interior', 450, 6000, true),
  ('Internacional', 1500, null, false)
ON CONFLICT DO NOTHING;

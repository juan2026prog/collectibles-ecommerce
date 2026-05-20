-- Shipping Rules Table (para AdminSettings.tsx)
-- Table already exists, just need to insert seed data if empty
INSERT INTO shipping_rules (name, zone, rate, free_above, is_active)
SELECT 'Montevideo Standard', 'Montevideo', 250, 4000, true
WHERE NOT EXISTS (SELECT 1 FROM shipping_rules WHERE name = 'Montevideo Standard');

INSERT INTO shipping_rules (name, zone, rate, free_above, is_active)
SELECT 'Interior Standard', 'Interior', 450, 6000, true
WHERE NOT EXISTS (SELECT 1 FROM shipping_rules WHERE name = 'Interior Standard');

INSERT INTO shipping_rules (name, zone, rate, free_above, is_active)
SELECT 'Internacional Standard', 'Internacional', 1500, null, false
WHERE NOT EXISTS (SELECT 1 FROM shipping_rules WHERE name = 'Internacional Standard');

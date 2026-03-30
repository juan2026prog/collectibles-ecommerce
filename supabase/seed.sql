-- Seed Script for Local Development
-- 1. Truncate required tables in reverse order of dependencies
TRUNCATE TABLE product_images, product_variants, products, categories, brands RESTART IDENTITY CASCADE;

-- 2. Insert Base Categories
INSERT INTO categories (id, name, slug, is_active) VALUES
  ('d0b98f21-8f5b-4394-bb9b-bf7858c35b80', 'Estatuas Premium', 'estatuas-premium', true),
  ('1cb8c9d2-3c22-45e0-8192-ded7cd45e3f4', 'Figuras de Acción', 'figuras-accion', true),
  ('445a2789-9a2e-4b77-8d26-b9a35e76d91a', 'Funko Pop', 'funko-pop', true),
  ('fc4e38fb-517b-48ce-8809-7a312ca677c7', 'Réplicas (Props)', 'replicas', true);

-- 3. Insert Brands
INSERT INTO brands (id, name, slug) VALUES
  ('6be0a4d3-7d9a-4c2f-bbd7-18f1970bcfda', 'Hot Toys', 'hot-toys'),
  ('cb252a12-8736-4179-883f-d3090ed4b2f1', 'Sideshow Collectibles', 'sideshow-collectibles'),
  ('a7da8ce0-5c6e-4cc5-9ac5-c48eb84a86f9', 'Funko', 'funko'),
  ('f7c352ed-c46c-4b68-80f4-5f532efcfcdd', 'Bandai Tamashii', 'bandai-tamashii');

-- 4. Insert Products (Dummies)
INSERT INTO products (id, category_id, brand_id, title, slug, short_description, base_price, status, is_featured) VALUES
  ('f261edbf-28ee-44a6-9bf3-7db914eb12c2', 'd0b98f21-8f5b-4394-bb9b-bf7858c35b80', 'cb252a12-8736-4179-883f-d3090ed4b2f1', 'Darth Vader Mythos Statue', 'darth-vader-mythos', 'Estatua espectacular de Darth Vader en escala 1/5 con acabados hiper-realistas', 650.00, 'published', true),
  ('a4f02758-1f19-4820-9bf7-5f72cf0171a5', '1cb8c9d2-3c22-45e0-8192-ded7cd45e3f4', '6be0a4d3-7d9a-4c2f-bbd7-18f1970bcfda', 'Spider-Man Advanced Suit 1/6', 'spiderman-1-6', 'Figura articulada de Spider-Man del juego de PS4 con accesorios', 285.00, 'published', true),
  ('fc6b8a21-9d22-43ce-b1ef-53cfd1eb92d5', '445a2789-9a2e-4b77-8d26-b9a35e76d91a', 'a7da8ce0-5c6e-4cc5-9ac5-c48eb84a86f9', 'Funko Pop! The Mandalorian', 'funko-mandalorian', 'El mandaloriano con baby yoda en brazo', 19.99, 'published', false),
  ('c342f1aa-7d5a-4b96-b6b8-2e8cf34f8101', 'fc4e38fb-517b-48ce-8809-7a312ca677c7', 'cb252a12-8736-4179-883f-d3090ed4b2f1', 'Infinity Gauntlet Life-Size Replica', 'infinity-gauntlet-prop', 'Guantelete del infinito 1:1, ilumina y suena', 1200.00, 'published', true),
  ('b1f8c14e-7b79-4592-8db5-1c390efcf5a2', '1cb8c9d2-3c22-45e0-8192-ded7cd45e3f4', 'f7c352ed-c46c-4b68-80f4-5f532efcfcdd', 'Goku Super Saiyan S.H. Figuarts', 'goku-sh-figuarts', 'Figura altamente articulada fiel al anime', 65.00, 'published', false);

-- 5. Insert Product Variants (Stock and SKU)
INSERT INTO product_variants (product_id, sku, name, inventory_count) VALUES
  ('f261edbf-28ee-44a6-9bf3-7db914eb12c2', 'SW-DV-001', 'Standard Edition', 3),
  ('a4f02758-1f19-4820-9bf7-5f72cf0171a5', 'HT-SP-002', 'Exclusive Edition', 15),
  ('fc6b8a21-9d22-43ce-b1ef-53cfd1eb92d5', 'FK-MD-003', 'Standard', 50),
  ('c342f1aa-7d5a-4b96-b6b8-2e8cf34f8101', 'PR-IG-004', '1:1 Scale replica', 1),
  ('b1f8c14e-7b79-4592-8db5-1c390efcf5a2', 'BD-GK-005', 'Standard', 0); -- Sold out example

-- 6. Insert Product Images
INSERT INTO product_images (product_id, url, is_primary) VALUES
  ('f261edbf-28ee-44a6-9bf3-7db914eb12c2', 'https://images.unsplash.com/photo-1608248593842-83e9b1607e15?q=80&w=600&auto=format&fit=crop', true), 
  ('a4f02758-1f19-4820-9bf7-5f72cf0171a5', 'https://images.unsplash.com/photo-1608889175123-8ee362201f81?q=80&w=600&auto=format&fit=crop', true),
  ('fc6b8a21-9d22-43ce-b1ef-53cfd1eb92d5', 'https://images.unsplash.com/photo-1596484552467-f27ee8ab8af5?q=80&w=600&auto=format&fit=crop', true),
  ('c342f1aa-7d5a-4b96-b6b8-2e8cf34f8101', 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846f1?q=80&w=600&auto=format&fit=crop', true),
  ('b1f8c14e-7b79-4592-8db5-1c390efcf5a2', 'https://images.unsplash.com/photo-1606663889134-b1dedb5ed8b7?q=80&w=600&auto=format&fit=crop', true);

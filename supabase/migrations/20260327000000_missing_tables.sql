-- 1. Create Brands Table
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. Add brand_id to existing products table
ALTER TABLE products ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;

-- 3. Create Product Images Table
CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_primary boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS and setup basic policies for these new tables
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands viewable by all" ON brands FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage brands" ON brands FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Product images viewable by all" ON product_images FOR SELECT USING (true);
CREATE POLICY "Admins can manage product images" ON product_images FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Vendors can manage own product images" ON product_images FOR ALL USING (
  product_id IN (SELECT id FROM products WHERE vendor_id = auth.uid())
);

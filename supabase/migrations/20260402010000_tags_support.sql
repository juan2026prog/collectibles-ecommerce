-- 1. Create Tags Table
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Create Product Tags Junction Table
CREATE TABLE IF NOT EXISTS product_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, tag_id)
);

-- 3. Create Product Categories Junction Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, category_id)
);

-- 4. Enable RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- 5. Setup policies
CREATE POLICY "Tags viewable by all" ON tags FOR SELECT USING (true);
CREATE POLICY "Admins can manage tags" ON tags FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Product tags viewable by all" ON product_tags FOR SELECT USING (true);
CREATE POLICY "Admins can manage product tags" ON product_tags FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Product categories viewable by all" ON product_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage product categories" ON product_categories FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

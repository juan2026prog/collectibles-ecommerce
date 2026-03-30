-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payouts ENABLE ROW LEVEL SECURITY;

-- 1. Profiles
-- Users can view and update their own profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
-- Admins can view and manage all profiles
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage all profiles" ON profiles FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- 2. Vendors, Artists, Affiliates
-- Admins can view and manage all
CREATE POLICY "Admins can manage vendors" ON vendors FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage artists" ON artists FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage affiliates" ON affiliates FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Users can view active roles publicly
CREATE POLICY "Vendors viewable by all" ON vendors FOR SELECT USING (status = 'active');
CREATE POLICY "Artists viewable by all" ON artists FOR SELECT USING (true);
CREATE POLICY "Affiliates viewable by all" ON affiliates FOR SELECT USING (status = 'active');

-- Users can update their own role entities
CREATE POLICY "Vendors can update own entity" ON vendors FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Artists can update own entity" ON artists FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Affiliates can update own entity" ON affiliates FOR UPDATE USING (id = auth.uid());

-- 3. Catalog (Categories, Products, Variants)
CREATE POLICY "Categories viewable by all" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Products viewable by all" ON products FOR SELECT USING (status = 'published');
CREATE POLICY "Variants viewable by all" ON product_variants FOR SELECT USING (is_active = true);

-- Admins can manage catalog
CREATE POLICY "Admins can manage categories" ON categories FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage products" ON products FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage variants" ON product_variants FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Vendors can manage own products
CREATE POLICY "Vendors can insert own products" ON products FOR INSERT WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Vendors can update own products" ON products FOR UPDATE USING (vendor_id = auth.uid());
CREATE POLICY "Vendors can delete own products" ON products FOR DELETE USING (vendor_id = auth.uid());
CREATE POLICY "Vendors can manage own variants" ON product_variants FOR ALL USING (product_id IN (SELECT id FROM products WHERE vendor_id = auth.uid()));

-- 4. Orders and Transactions
-- Admins can view/manage all orders
CREATE POLICY "Admins can manage orders" ON orders FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage order items" ON order_items FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage coupons" ON coupons FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Customers can view/insert their own orders
CREATE POLICY "Customers can view own orders" ON orders FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "Customers can insert own orders" ON orders FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Customers can view own order items" ON order_items FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()));

-- Vendors can view their order items
CREATE POLICY "Vendors can view own order items" ON order_items FOR SELECT USING (vendor_id = auth.uid());

-- 5. Video Requests
CREATE POLICY "Admins can manage video requests" ON video_requests FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Customers can view own requests" ON video_requests FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "Customers can insert requests" ON video_requests FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Artists can view and update own requests" ON video_requests FOR SELECT USING (artist_id = auth.uid());
CREATE POLICY "Artists can update own requests" ON video_requests FOR UPDATE USING (artist_id = auth.uid());

-- 6. Payouts and Commissions
CREATE POLICY "Admins can manage commissions" ON affiliate_commissions FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage payouts" ON vendor_payouts FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Affiliates can view own commissions" ON affiliate_commissions FOR SELECT USING (affiliate_id = auth.uid());
CREATE POLICY "Vendors can view own payouts" ON vendor_payouts FOR SELECT USING (vendor_id = auth.uid());

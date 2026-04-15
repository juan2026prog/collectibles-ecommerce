-- Allow customers to also view orders by their email (fallback for orders without customer_id)
CREATE POLICY "Customers can view orders by email" ON orders 
  FOR SELECT 
  USING (
    customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Migración para Analytics de Promociones (Fase 4C)
CREATE TABLE IF NOT EXISTS promotion_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id uuid, -- Opcional, referencia a order_items si está disponible
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
    discount_amount numeric NOT NULL,
    quantity integer DEFAULT 1,
    original_unit_price numeric,
    final_unit_price numeric,
    created_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE promotion_usage ENABLE ROW LEVEL SECURITY;

-- Políticas (Solo backend inserta via service role o admin read, no read public)
CREATE POLICY "Admin read promotion_usage" ON promotion_usage FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- No public insert needed because create-order edge function uses service_role key to bypass RLS.

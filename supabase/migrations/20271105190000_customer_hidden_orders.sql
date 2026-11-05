-- 20271105190000_customer_hidden_orders.sql
-- Tabla para registrar la visibilidad de pedidos ocultos por usuario comprador
-- Esta preferencia es estrictamente visual y por usuario:
-- NO elimina ni altera registros en orders, order_items, order_suborders, payments, refunds ni envíos.

CREATE TABLE IF NOT EXISTS public.customer_hidden_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_hidden_orders_user_order UNIQUE (user_id, order_id)
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_customer_hidden_orders_user_id ON public.customer_hidden_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_hidden_orders_order_id ON public.customer_hidden_orders(order_id);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.customer_hidden_orders ENABLE ROW LEVEL SECURITY;

-- 1. Política SELECT:
-- Un comprador solo puede ver los registros de pedidos ocultos que le pertenecen.
-- Los administradores (public.is_admin()) pueden consultar para auditoría.
DROP POLICY IF EXISTS "Users can view own hidden orders" ON public.customer_hidden_orders;
CREATE POLICY "Users can view own hidden orders" ON public.customer_hidden_orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.is_admin()
  );

-- 2. Política INSERT:
-- Un usuario autenticado solo puede ocultar pedidos donde sea el comprador legítimo (customer_id = auth.uid() OR user_id = auth.uid()).
DROP POLICY IF EXISTS "Users can hide own orders" ON public.customer_hidden_orders;
CREATE POLICY "Users can hide own orders" ON public.customer_hidden_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = customer_hidden_orders.order_id
        AND (o.customer_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

-- 3. Política DELETE:
-- Un usuario puede restaurar (eliminar de hidden_orders) únicamente sus propios registros.
DROP POLICY IF EXISTS "Users can unhide own orders" ON public.customer_hidden_orders;
CREATE POLICY "Users can unhide own orders" ON public.customer_hidden_orders
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    public.is_admin()
  );

-- Conceder permisos necesarios a los roles de Supabase
GRANT SELECT, INSERT, DELETE ON public.customer_hidden_orders TO authenticated;
GRANT ALL ON public.customer_hidden_orders TO service_role;

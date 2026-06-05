-- B1 - Base de Datos Segura para Plantillas y Segmentos

-- 1. Tabla de Plantillas
CREATE TABLE IF NOT EXISTS communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL, -- 'email', 'whatsapp', 'both'
  subject text, -- Solo para email
  content text NOT NULL, -- HTML o texto
  variables jsonb DEFAULT '[]'::jsonb, -- ej: ["nombre", "total"]
  is_active boolean DEFAULT true,
  is_system_default boolean DEFAULT false,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Tabla de Segmentos
CREATE TABLE IF NOT EXISTS customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  query_rules jsonb DEFAULT '{"operator": "AND", "conditions": []}'::jsonb,
  is_active boolean DEFAULT true,
  last_calculated_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Tabla de Logs
CREATE TABLE IF NOT EXISTS communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  channel text NOT NULL,
  template_id uuid REFERENCES communication_templates(id) ON DELETE SET NULL,
  segment_id uuid REFERENCES customer_segments(id) ON DELETE SET NULL,
  status text DEFAULT 'sent', -- sent, failed, skipped
  error_details text,
  origin text, -- 'manual', 'automation', 'cron'
  created_at timestamptz DEFAULT now()
);

-- 4. RLS Policies
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden gestionar plantillas y segmentos
CREATE POLICY "Admin full access communication_templates" ON communication_templates FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
CREATE POLICY "Admin full access customer_segments" ON customer_segments FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
CREATE POLICY "Admin full access communication_logs" ON communication_logs FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- Usuarios no pueden ver logs (solo admin por ahora o el propio usuario si se expone)
CREATE POLICY "Users can view own communication_logs" ON communication_logs FOR SELECT USING (customer_id = auth.uid());

-- Service Role (bypass RLS by default, so it can run automations)

-- 5. Función RPC segura para calcular el estimado de clientes de un segmento
CREATE OR REPLACE FUNCTION calculate_segment_estimate(rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Ejecuta con permisos del creador (admin) para saltar RLS en tablas base si es necesario
AS $$
DECLARE
  base_query text := 'SELECT count(*) as total, count(*) filter (where c.email_marketing_opt_in = true) as emails, count(*) filter (where c.whatsapp_opt_in = true) as whatsapp FROM profiles p LEFT JOIN customer_consents c ON p.email = c.email ';
  where_clause text := '';
  cond record;
  op text;
  val text;
  result record;
BEGIN
  -- Validar que operator es AND u OR
  IF NOT (rules->>'operator' IN ('AND', 'OR')) THEN
    RAISE EXCEPTION 'Operator must be AND or OR';
  END IF;

  FOR cond IN SELECT * FROM jsonb_array_elements(rules->'conditions')
  LOOP
    -- Parsear field, operator, value de forma segura
    -- Aqui implementamos lógica dura para evitar inyección:
    
    -- Ejemplos mapeados (se expandirá según necesidad)
    IF cond.value->>'field' = 'total_spent' THEN
      IF cond.value->>'operator' = 'greater_than' THEN
        val := quote_literal(cond.value->>'value');
        where_clause := where_clause || ' (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.customer_id = p.id AND o.status = ''paid'') > ' || val || ' ' || (rules->>'operator') || ' ';
      END IF;
    ELSIF cond.value->>'field' = 'order_count' THEN
      IF cond.value->>'operator' = 'greater_than' THEN
        val := quote_literal(cond.value->>'value');
        where_clause := where_clause || ' (SELECT COUNT(*) FROM orders o WHERE o.customer_id = p.id AND o.status = ''paid'') > ' || val || ' ' || (rules->>'operator') || ' ';
      END IF;
    ELSIF cond.value->>'field' = 'email_opt_in' THEN
      val := quote_literal(cond.value->>'value');
      where_clause := where_clause || ' (SELECT email_marketing_opt_in FROM customer_consents c WHERE c.email = p.email LIMIT 1) = ' || val || ' ' || (rules->>'operator') || ' ';
    END IF;
    -- Agrega más traducciones seguras aquí
  END LOOP;

  -- Limpiar el último AND / OR
  IF length(where_clause) > 0 THEN
    where_clause := substring(where_clause from 1 for length(where_clause) - length(rules->>'operator') - 2);
    base_query := base_query || ' WHERE ' || where_clause;
  END IF;

  EXECUTE base_query INTO result;
  RETURN jsonb_build_object('total', result.total, 'emails', result.emails, 'whatsapp', result.whatsapp);
END;
$$;

-- 6. Semillas (Plantillas de B2 y Segmentos de B3)
INSERT INTO communication_templates (name, type, subject, content, variables, is_system_default) VALUES
('Compra Recibida', 'email', 'Recibimos tu compra', '<p>Hola {{nombre}}, hemos recibido tu pedido {{order_id}}.</p>', '["nombre", "order_id"]', true),
('Pago Aprobado', 'email', 'Pago Aprobado', '<p>Hola {{nombre}}, el pago de {{total}} por el pedido {{order_id}} ha sido aprobado.</p>', '["nombre", "total", "order_id"]', true),
('Pago Pendiente', 'email', 'Pago Pendiente', '<p>Hola {{nombre}}, tu pedido {{order_id}} está a la espera de pago.</p>', '["nombre", "order_id"]', true),
('Pedido Enviado', 'email', 'Pedido Enviado', '<p>Tu pedido va en camino. Sigue el tracking: {{tracking_url}}</p>', '["tracking_url"]', true),
('Pedido Entregado', 'email', 'Pedido Entregado', '<p>¡Tu pedido ha sido entregado!</p>', '[]', true),
('Carrito Abandonado', 'email', '¿Olvidaste algo?', '<p>Hola {{nombre}}, tienes artículos esperando en el carrito.</p>', '["nombre"]', true),
('Wishlist Stock', 'email', '¡Volvió a ingresar!', '<p>El producto {{producto}} de tu wishlist ya tiene stock.</p>', '["producto"]', true),
('Wishlist Precio', 'email', '¡Bajó de precio!', '<p>El producto {{producto}} ahora cuesta {{precio}}.</p>', '["producto", "precio"]', true),
('Preventa', 'email', 'Actualización de Preventa', '<p>Hay novedades sobre tu preventa del producto {{producto}}.</p>', '["producto"]', true),
('Newsletter', 'email', 'Novedades', '<p>Novedades del mes...</p>', '[]', true)
ON CONFLICT DO NOTHING;

INSERT INTO customer_segments (name, description, query_rules) VALUES
('Nunca compró', 'Clientes registrados que aún no tienen órdenes', '{"operator": "AND", "conditions": [{"field": "order_count", "operator": "equals", "value": "0"}]}'),
('Primera compra', 'Clientes con exactamente 1 compra', '{"operator": "AND", "conditions": [{"field": "order_count", "operator": "equals", "value": "1"}]}'),
('Cliente recurrente', 'Clientes con más de 1 compra', '{"operator": "AND", "conditions": [{"field": "order_count", "operator": "greater_than", "value": "1"}]}'),
('Cliente VIP', 'Clientes que han gastado más de 5000', '{"operator": "AND", "conditions": [{"field": "total_spent", "operator": "greater_than", "value": "5000"}]}'),
('Inactivo 30 días', 'Sin compras en el último mes', '{"operator": "AND", "conditions": [{"field": "older_than_days", "operator": "greater_than", "value": "30"}]}'),
('Compró Funko', 'Clientes que compraron en la categoría Funko', '{"operator": "AND", "conditions": [{"field": "category_purchased", "operator": "equals", "value": "Funko POP"}]}'),
('Wishlist activa', 'Clientes con items en wishlist', '{"operator": "AND", "conditions": [{"field": "wishlist_category", "operator": "not_equals", "value": ""}]}'),
('Carrito abandonado', 'Clientes con carritos sin finalizar', '{"operator": "AND", "conditions": [{"field": "abandoned_cart_count", "operator": "greater_than", "value": "0"}]}')
ON CONFLICT DO NOTHING;

-- 7. FASE B5: Campaign Manager
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  segment_id uuid REFERENCES customer_segments(id) ON DELETE SET NULL,
  template_id uuid REFERENCES communication_templates(id) ON DELETE RESTRICT,
  channel text NOT NULL, -- 'email', 'whatsapp', 'both'
  scheduled_at timestamptz,
  status text DEFAULT 'draft', -- 'draft', 'scheduled', 'processing', 'completed', 'failed'
  stats jsonb DEFAULT '{"sent": 0, "opened": 0, "clicked": 0, "bounced": 0, "converted": 0}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- B5 Modificaciones: Add campaigns FK to logs
ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;

-- 8. FASE B6: Preventas
CREATE TABLE IF NOT EXISTS preorder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'reserved', -- 'reserved', 'confirmed', 'in_production', 'in_transit', 'arrived', 'ready_for_pickup', 'delivered', 'cancelled'
  estimated_arrival timestamptz,
  tracking_info text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS para B5 y B6
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access campaigns" ON campaigns FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
CREATE POLICY "Admin full access preorder_items" ON preorder_items FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

CREATE POLICY "Users can view own preorders" ON preorder_items FOR SELECT USING (customer_id = auth.uid());

-- 9. Índices de Rendimiento (Fase B Auditoría)
CREATE INDEX IF NOT EXISTS idx_communication_logs_customer_id ON communication_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_channel ON communication_logs(channel);
CREATE INDEX IF NOT EXISTS idx_communication_logs_campaign_id ON communication_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_created_at ON communication_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_preorder_items_customer_id ON preorder_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_preorder_items_order_item_id ON preorder_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_preorder_items_status ON preorder_items(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at ON campaigns(scheduled_at);

-- 10. RPC Optimizada para Dashboard (Últimos 30 días)
CREATE OR REPLACE FUNCTION get_automation_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ventas_totales numeric := 0;
  v_ticket_promedio numeric := 0;
  v_clientes_unicos_30d integer := 0;
  v_clientes_recurrentes_30d integer := 0;
  
  v_carritos_abandonados integer := 0;
  v_carritos_recuperados integer := 0;
  v_tasa_recuperacion numeric := 0;
  v_ventas_recuperadas numeric := 0;
  
  v_wishlist_activas integer := 0;
  v_alertas_wishlist_enviadas integer := 0;
  
  v_emails_enviados integer := 0;
  v_whatsapp_enviados integer := 0;
  
  v_preventas_activas integer := 0;
  v_preventas_entregadas integer := 0;
  v_preventas_canceladas integer := 0;
BEGIN
  -- Ventas (últimos 30 días)
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(DISTINCT customer_id),
    COALESCE(SUM(total_amount) / NULLIF(COUNT(*), 0), 0)
  INTO v_ventas_totales, v_clientes_unicos_30d, v_ticket_promedio
  FROM orders 
  WHERE status = 'paid' AND created_at >= (now() - interval '30 days');

  -- Clientes recurrentes en los últimos 30 días (tienen más de 1 compra pagada en su historia, y compraron en los últimos 30d)
  SELECT COUNT(DISTINCT o1.customer_id)
  INTO v_clientes_recurrentes_30d
  FROM orders o1
  WHERE o1.status = 'paid' AND o1.created_at >= (now() - interval '30 days')
  AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = o1.customer_id AND o2.id != o1.id AND o2.status = 'paid');

  -- Carritos
  SELECT 
    COUNT(*) FILTER (WHERE status = 'abandoned' OR status = 'converted'),
    COUNT(*) FILTER (WHERE status = 'converted'),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'converted'), 0)
  INTO v_carritos_abandonados, v_carritos_recuperados, v_ventas_recuperadas
  FROM abandoned_checkouts
  WHERE created_at >= (now() - interval '30 days');
  
  IF v_carritos_abandonados > 0 THEN
    v_tasa_recuperacion := (v_carritos_recuperados::numeric / v_carritos_abandonados::numeric) * 100;
  END IF;

  -- Wishlist
  SELECT COUNT(DISTINCT user_id) INTO v_wishlist_activas FROM wishlists;
  SELECT COUNT(*) INTO v_alertas_wishlist_enviadas FROM wishlist_alerts WHERE created_at >= (now() - interval '30 days') AND status = 'sent';

  -- Logs
  SELECT 
    COUNT(*) FILTER (WHERE channel = 'email'),
    COUNT(*) FILTER (WHERE channel = 'whatsapp')
  INTO v_emails_enviados, v_whatsapp_enviados
  FROM communication_logs
  WHERE created_at >= (now() - interval '30 days') AND status IN ('sent', 'delivered', 'opened', 'clicked');

  -- Preventas
  SELECT 
    COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled')),
    COUNT(*) FILTER (WHERE status = 'delivered'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_preventas_activas, v_preventas_entregadas, v_preventas_canceladas
  FROM preorder_items;

  RETURN jsonb_build_object(
    'ventas_totales', v_ventas_totales,
    'clientes_nuevos', v_clientes_unicos_30d - v_clientes_recurrentes_30d,
    'clientes_recurrentes', v_clientes_recurrentes_30d,
    'ticket_promedio', v_ticket_promedio,
    'carritos_abandonados', v_carritos_abandonados,
    'carritos_recuperados', v_carritos_recuperados,
    'tasa_recuperacion', v_tasa_recuperacion,
    'ventas_recuperadas', v_ventas_recuperadas,
    'wishlist_activas', v_wishlist_activas,
    'alertas_wishlist_enviadas', v_alertas_wishlist_enviadas,
    'emails_enviados', v_emails_enviados,
    'whatsapp_enviados', v_whatsapp_enviados,
    'preventas_activas', v_preventas_activas,
    'preventas_entregadas', v_preventas_entregadas,
    'preventas_canceladas', v_preventas_canceladas
  );
END;
$$;

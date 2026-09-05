-- ==============================================================================
-- MIGRATION: 20261231020000_collector_compare_core.sql
-- DESCRIPTION: Core schema, attribute registry, and configuration for Collector Compare
-- MODULE: MÓDULO 04 — COMPARADOR DEL COLECCIONISTA
-- ==============================================================================

-- 1. Configuration & Feature Flags Table
CREATE TABLE IF NOT EXISTS public.compare_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.compare_config (key, value, description)
VALUES 
  ('collector_compare_enabled', 'true'::jsonb, 'Master flag to enable collector product comparator'),
  ('compare_ai_verdict_enabled', 'true'::jsonb, 'Enable AI deterministic verdict engine for product comparisons'),
  ('compare_compatibility_enabled', 'true'::jsonb, 'Enable scale and line compatibility engine between figures'),
  ('compare_editorial_seo_enabled', 'false'::jsonb, 'Allow indexable editorial comparison URLs (default false / noindex)'),
  ('compare_import_cost_enabled', 'true'::jsonb, 'Allow international import cost comparison when courier data is available'),
  ('compare_max_products', '4'::jsonb, 'Maximum number of items compared simultaneously (hard limit 4)')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

-- 2. Attribute Registry Table
CREATE TABLE IF NOT EXISTS public.compare_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category_scope TEXT NOT NULL DEFAULT 'all', -- 'all', 'action_figures', 'statues', 'cards', 'lego', 'funkos'
  data_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'number', 'dimension', 'scale', 'boolean', 'currency'
  unit TEXT, -- 'cm', 'inch', 'kg', 'g', 'ratio', 'usd', 'uyu'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
  sort_order INTEGER NOT NULL DEFAULT 10,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Essential Collector Attributes
INSERT INTO public.compare_attributes (attribute_key, label, category_scope, data_type, unit, priority, sort_order, description)
VALUES
  ('price', 'Precio', 'all', 'currency', 'usd', 'critical', 1, 'Precio comercial visible'),
  ('availability', 'Disponibilidad / Stock', 'all', 'text', NULL, 'critical', 2, 'En stock, preventa, internacional o agotado'),
  ('origin_type', 'Origen / Procedencia', 'all', 'text', NULL, 'high', 3, 'Local con entrega inmediata vs Internacional con flete'),
  ('brand', 'Fabricante / Marca', 'all', 'text', NULL, 'critical', 4, 'Fabricante oficial (NECA, Hot Toys, McFarlane, etc.)'),
  ('license', 'Licencia / Franquicia', 'all', 'text', NULL, 'critical', 5, 'Propiedad intelectual (Batman, Star Wars, Marvel, etc.)'),
  ('product_line', 'Línea de Producto', 'all', 'text', NULL, 'high', 6, 'Línea de colección (Ultimate, Black Series, Marvel Legends)'),
  ('scale', 'Escala', 'action_figures', 'scale', 'ratio', 'critical', 7, 'Escala estandarizada (1:12, 1:6, 1:10, 1:4)'),
  ('height', 'Altura Estimada', 'action_figures', 'dimension', 'cm', 'high', 8, 'Altura normalizada en centímetros con equivalente en pulgadas'),
  ('dimensions', 'Dimensiones (L x An x Al)', 'all', 'dimension', 'cm', 'medium', 9, 'Medidas físicas del producto o empaque'),
  ('weight', 'Peso', 'all', 'number', 'kg', 'high', 10, 'Peso normalizado en kilogramos'),
  ('material', 'Material Principal', 'all', 'text', NULL, 'medium', 11, 'PVC, ABS, Polystone, Resina, Tela, Die-cast'),
  ('articulation_points', 'Puntos de Articulación', 'action_figures', 'number', 'pts', 'high', 12, 'Cantidad de articulaciones para posabilidad'),
  ('accessories', 'Accesorios Incluidos', 'action_figures', 'text', NULL, 'high', 13, 'Armas, manos intercambiables, cabezas alternativas, etc.'),
  ('edition_type', 'Tipo de Edición', 'all', 'text', NULL, 'medium', 14, 'Regular, Deluxe, Limitada, Numerada, Exclusive'),
  ('release_year', 'Año de Lanzamiento', 'all', 'number', 'year', 'medium', 15, 'Año de producción o distribución'),
  ('condition', 'Condición', 'all', 'text', NULL, 'high', 16, 'Nuevo sellado de fábrica vs Usado / exhibido'),
  ('seller_name', 'Vendedor / Tienda', 'all', 'text', NULL, 'medium', 17, 'Collectibles Oficial o Vendor verificado'),
  ('shipping_estimate', 'Costo Envío / Puesto en UY', 'all', 'currency', 'usd', 'high', 18, 'Costo de traslado local o flete internacional estimado')
ON CONFLICT (attribute_key) DO UPDATE SET
  label = EXCLUDED.label,
  category_scope = EXCLUDED.category_scope,
  data_type = EXCLUDED.data_type,
  unit = EXCLUDED.unit,
  priority = EXCLUDED.priority,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  updated_at = now();

-- 3. Category Attribute Rules (mapping rules between category slugs and attributes)
CREATE TABLE IF NOT EXISTS public.compare_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug TEXT NOT NULL,
  attribute_key TEXT NOT NULL REFERENCES public.compare_attributes(attribute_key) ON DELETE CASCADE,
  is_highlighted BOOLEAN NOT NULL DEFAULT false,
  custom_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_slug, attribute_key)
);

-- Seed Category Rules for Action Figures, Statues, Lego, Funkos
INSERT INTO public.compare_category_rules (category_slug, attribute_key, is_highlighted, sort_order)
VALUES
  -- Figuras de acción
  ('figuras-de-accion', 'scale', true, 1),
  ('figuras-de-accion', 'height', true, 2),
  ('figuras-de-accion', 'articulation_points', true, 3),
  ('figuras-de-accion', 'accessories', true, 4),
  ('figuras-de-accion', 'product_line', false, 5),
  ('figuras-de-accion', 'material', false, 6),
  -- Estatuas
  ('estatuas', 'scale', true, 1),
  ('estatuas', 'height', true, 2),
  ('estatuas', 'material', true, 3),
  ('estatuas', 'weight', true, 4),
  ('estatuas', 'edition_type', true, 5),
  -- Funkos
  ('funkos', 'product_line', true, 1),
  ('funkos', 'edition_type', true, 2),
  ('funkos', 'release_year', false, 3)
ON CONFLICT (category_slug, attribute_key) DO NOTHING;

-- 4. Enable Row Level Security
ALTER TABLE public.compare_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compare_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compare_category_rules ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Public read for frontend comparisons, admin write)
CREATE POLICY "Public read compare config" ON public.compare_config
  FOR SELECT USING (true);

CREATE POLICY "Admin write compare config" ON public.compare_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Public read compare attributes" ON public.compare_attributes
  FOR SELECT USING (is_visible = true);

CREATE POLICY "Admin write compare attributes" ON public.compare_attributes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Public read compare category rules" ON public.compare_category_rules
  FOR SELECT USING (true);

CREATE POLICY "Admin write compare category rules" ON public.compare_category_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 6. RPC: Fast Batch Fetch for Comparison (Strips Internal Costs!)
CREATE OR REPLACE FUNCTION public.get_products_for_comparison(p_product_ids UUID[])
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Limit to maximum 4 products
  IF array_length(p_product_ids, 1) > 4 THEN
    p_product_ids := p_product_ids[1:4];
  END IF;

  SELECT coalesce(jsonb_agg(sub), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT 
      p.id,
      p.title,
      p.slug,
      p.base_price,
      p.compare_at_price,
      p.status,
      p.condition,
      p.weight_kg,
      p.dimensions,
      p.metadata,
      p.ml_attributes,
      (SELECT url FROM public.product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) as primary_image,
      b.name as brand_name,
      l.name as license_name,
      c.name as category_name,
      c.slug as category_slug,
      vs.store_name as seller_store_name,
      -- Check if international
      ip.id IS NOT NULL as is_international,
      ip.base_price_usd as intl_base_price_usd,
      ip.final_price_usd as intl_final_price_usd,
      ip.urubox_estimated_cost_usd as intl_courier_estimate_usd,
      ip.weight_grams as intl_weight_grams,
      ip.package_length as intl_length,
      ip.package_width as intl_width,
      ip.package_height as intl_height
      -- NOTICE: raw_data, real_cost_usd, zinc_fee, expected_profit_usd are STRICTLY NOT RETURNED.
    FROM public.products p
    LEFT JOIN public.brands b ON p.brand_id = b.id
    LEFT JOIN public.licenses l ON p.license_id = l.id
    LEFT JOIN public.categories c ON p.category_id = c.id
    LEFT JOIN public.vendor_stores vs ON p.vendor_store_id = vs.id
    LEFT JOIN public.international_products ip ON ip.id = p.id
    WHERE p.id = ANY(p_product_ids)
      AND p.status != 'deleted'
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

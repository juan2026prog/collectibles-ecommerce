-- 1. Create product_duplicates table
CREATE TABLE IF NOT EXISTS public.product_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  match_reason text NOT NULL,
  match_percentage numeric NOT NULL DEFAULT 100,
  status text NOT NULL CHECK (status IN ('posible', 'probable', 'confirmado', 'fusionado', 'ignorado', 'falso_positivo', 'resuelto')),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_performed text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT unique_product_pair UNIQUE (product_id, related_product_id)
);

-- 2. Create product_duplicate_history table
CREATE TABLE IF NOT EXISTS public.product_duplicate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duplicate_id uuid REFERENCES public.product_duplicates(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  related_product_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('detectado', 'confirmado', 'fusionado', 'ignorado', 'falso_positivo', 'resuelto', 'eliminado')),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.product_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_duplicate_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all authenticated users access to product_duplicates" ON public.product_duplicates;
CREATE POLICY "Allow all authenticated users access to product_duplicates"
ON public.product_duplicates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all authenticated users access to product_duplicate_history" ON public.product_duplicate_history;
CREATE POLICY "Allow all authenticated users access to product_duplicate_history"
ON public.product_duplicate_history
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Recalculation logic
CREATE OR REPLACE FUNCTION public.recalculate_product_duplicates(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_p1_id uuid;
  v_p2_id uuid;
  v_existing_id uuid;
  v_existing_status text;
BEGIN
  -- Find matches for p_product_id
  FOR v_rec IN 
    -- 1. SKU Match
    SELECT DISTINCT v2.product_id as related_id, 'Mismo SKU' as reason, 100 as score
    FROM public.product_variants v1
    JOIN public.product_variants v2 ON LOWER(TRIM(v1.sku)) = LOWER(TRIM(v2.sku))
    WHERE v1.product_id = p_product_id 
      AND v2.product_id <> p_product_id 
      AND v1.sku IS NOT NULL AND v1.sku NOT IN ('', '-', '—', 'none', 'no tiene', 'n/a')
      
    UNION
    
    -- 2. ML Item ID Match
    SELECT DISTINCT p2.id as related_id, 'Mismo ML Item ID' as reason, 100 as score
    FROM public.products p1
    JOIN public.products p2 ON p1.ml_item_id = p2.ml_item_id
    WHERE p1.id = p_product_id 
      AND p2.id <> p_product_id 
      AND p1.ml_item_id IS NOT NULL AND p1.ml_item_id <> ''
      
    UNION
    
    -- 3. GTIN/EAN/UPC Match
    SELECT DISTINCT p2.id as related_id, 'Mismo GTIN/EAN/UPC' as reason, 100 as score
    FROM public.products p1
    CROSS JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(p1.metadata->'attributes') = 'array' THEN p1.metadata->'attributes' ELSE '[]'::jsonb END) as attr1
    JOIN public.products p2 ON p2.id <> p_product_id
    CROSS JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(p2.metadata->'attributes') = 'array' THEN p2.metadata->'attributes' ELSE '[]'::jsonb END) as attr2
    WHERE p1.id = p_product_id
      AND attr1->>'id' IN ('GTIN', 'EAN', 'UPC', 'ASIN', 'BARCODE')
      AND attr1->>'value_name' IS NOT NULL AND attr1->>'value_name' <> ''
      AND attr2->>'id' IN ('GTIN', 'EAN', 'UPC', 'ASIN', 'BARCODE')
      AND attr2->>'value_name' = attr1->>'value_name'
      
    UNION
    
    -- 4. Title Match
    SELECT DISTINCT p2.id as related_id, 'Título idéntico' as reason, 90 as score
    FROM public.products p1
    JOIN public.products p2 ON LOWER(TRIM(p1.title)) = LOWER(TRIM(p2.title))
    WHERE p1.id = p_product_id 
      AND p2.id <> p_product_id
      AND p1.title IS NOT NULL AND p1.title <> ''
      
    UNION
    
    -- 5. Image Match
    SELECT DISTINCT i2.product_id as related_id, 'Misma Imagen' as reason, 85 as score
    FROM public.product_images i1
    JOIN public.product_images i2 ON i1.url = i2.url
    WHERE i1.product_id = p_product_id 
      AND i2.product_id <> p_product_id
      AND i1.url IS NOT NULL AND i1.url <> ''
  LOOP
    -- Ensure product_id < related_product_id in table to avoid duplicate rows
    IF p_product_id < v_rec.related_id THEN
      v_p1_id := p_product_id;
      v_p2_id := v_rec.related_id;
    ELSE
      v_p1_id := v_rec.related_id;
      v_p2_id := p_product_id;
    END IF;
    
    -- Check if duplicate already exists
    SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.product_duplicates
    WHERE product_id = v_p1_id AND related_product_id = v_p2_id;
    
    IF v_existing_id IS NULL THEN
      -- Create new duplicate entry
      INSERT INTO public.product_duplicates (
        product_id,
        related_product_id,
        match_reason,
        match_percentage,
        status
      ) VALUES (
        v_p1_id,
        v_p2_id,
        v_rec.reason,
        v_rec.score,
        CASE WHEN v_rec.score >= 95 THEN 'probable' ELSE 'posible' END
      ) RETURNING id INTO v_existing_id;
      
      -- Log history
      INSERT INTO public.product_duplicate_history (
        duplicate_id,
        product_id,
        related_product_id,
        action_type,
        details
      ) VALUES (
        v_existing_id,
        v_p1_id,
        v_p2_id,
        'detectado',
        'Detección automática: ' || v_rec.reason || ' (Confianza: ' || v_rec.score || '%)'
      );
    ELSE
      -- Entry exists. If it is in automatic status (posible/probable), we update reason/percentage
      IF v_existing_status IN ('posible', 'probable') THEN
        UPDATE public.product_duplicates
        SET 
          match_reason = v_rec.reason,
          match_percentage = v_rec.score,
          status = CASE WHEN v_rec.score >= 95 THEN 'probable'::text ELSE 'posible'::text END,
          updated_at = now()
        WHERE id = v_existing_id;
      END IF;
    END IF;
  END LOOP;

  -- Delete duplicates that are no longer matching (only if they are in 'posible' or 'probable' state)
  FOR v_rec IN 
    SELECT id, product_id, related_product_id, match_reason
    FROM public.product_duplicates
    WHERE (product_id = p_product_id OR related_product_id = p_product_id)
      AND status IN ('posible', 'probable')
  LOOP
    -- Verify if they still match
    IF NOT EXISTS (
      -- Check SKU Match
      SELECT 1 FROM public.product_variants v1 JOIN public.product_variants v2 ON LOWER(TRIM(v1.sku)) = LOWER(TRIM(v2.sku)) WHERE v1.product_id = v_rec.product_id AND v2.product_id = v_rec.related_product_id AND v1.sku IS NOT NULL AND v1.sku NOT IN ('', '-', '—', 'none', 'no tiene', 'n/a')
      UNION ALL
      -- Check ML Item ID Match
      SELECT 1 FROM public.products p1 JOIN public.products p2 ON p1.ml_item_id = p2.ml_item_id WHERE p1.id = v_rec.product_id AND p2.id = v_rec.related_product_id AND p1.ml_item_id IS NOT NULL AND p1.ml_item_id <> ''
      UNION ALL
      -- Check GTIN Match
      SELECT 1 
      FROM public.products p1
      CROSS JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(p1.metadata->'attributes') = 'array' THEN p1.metadata->'attributes' ELSE '[]'::jsonb END) as attr1 
      JOIN public.products p2 ON p2.id = v_rec.related_product_id
      CROSS JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(p2.metadata->'attributes') = 'array' THEN p2.metadata->'attributes' ELSE '[]'::jsonb END) as attr2
      WHERE p1.id = v_rec.product_id 
        AND attr1->>'id' IN ('GTIN', 'EAN', 'UPC', 'ASIN', 'BARCODE') 
        AND attr1->>'value_name' IS NOT NULL AND attr1->>'value_name' <> ''
        AND attr2->>'id' IN ('GTIN', 'EAN', 'UPC', 'ASIN', 'BARCODE') 
        AND attr2->>'value_name' = attr1->>'value_name'
      UNION ALL
      -- Check Title Match
      SELECT 1 FROM public.products p1 JOIN public.products p2 ON LOWER(TRIM(p1.title)) = LOWER(TRIM(p2.title)) WHERE p1.id = v_rec.product_id AND p2.id = v_rec.related_product_id AND p1.title IS NOT NULL AND p1.title <> ''
      UNION ALL
      -- Check Image Match
      SELECT 1 FROM public.product_images i1 JOIN public.product_images i2 ON i1.url = i2.url WHERE i1.product_id = v_rec.product_id AND i2.product_id = v_rec.related_product_id AND i1.url IS NOT NULL AND i1.url <> ''
    ) THEN
      -- No longer matches, delete
      DELETE FROM public.product_duplicates WHERE id = v_rec.id;
      
      -- Log history
      INSERT INTO public.product_duplicate_history (
        product_id,
        related_product_id,
        action_type,
        details
      ) VALUES (
        v_rec.product_id,
        v_rec.related_product_id,
        'resuelto',
        'Resuelto automáticamente: los productos ya no coinciden por ' || v_rec.match_reason
      );
    END IF;
  END LOOP;
END $$;

-- 5. Trigger functions to sync recalculation
CREATE OR REPLACE FUNCTION public.trg_product_duplicates_sync()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.product_duplicate_history (
      product_id,
      related_product_id,
      action_type,
      details
    ) VALUES (
      OLD.id,
      OLD.id,
      'eliminado',
      'Producto eliminado: ' || OLD.title
    );
  ELSE
    PERFORM public.recalculate_product_duplicates(NEW.id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_variant_duplicates_sync()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_product_duplicates(OLD.product_id);
  ELSE
    PERFORM public.recalculate_product_duplicates(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach triggers
DROP TRIGGER IF EXISTS t_product_duplicates_sync ON public.products;
CREATE TRIGGER t_product_duplicates_sync
AFTER INSERT OR UPDATE OF title, ml_item_id, metadata, status, is_active ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_product_duplicates_sync();

DROP TRIGGER IF EXISTS t_variant_duplicates_sync ON public.product_variants;
CREATE TRIGGER t_variant_duplicates_sync
AFTER INSERT OR UPDATE OF sku ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.trg_variant_duplicates_sync();

-- 7. Update status helper function
CREATE OR REPLACE FUNCTION public.update_duplicate_status(
  p_dup_id uuid,
  p_status text,
  p_admin_id uuid,
  p_action_performed text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_p1 uuid;
  v_p2 uuid;
BEGIN
  SELECT product_id, related_product_id INTO v_p1, v_p2
  FROM public.product_duplicates
  WHERE id = p_dup_id;

  UPDATE public.product_duplicates
  SET 
    status = p_status,
    admin_id = p_admin_id,
    action_performed = p_action_performed,
    updated_at = now()
  WHERE id = p_dup_id;

  INSERT INTO public.product_duplicate_history (
    duplicate_id,
    product_id,
    related_product_id,
    action_type,
    admin_id,
    details
  ) VALUES (
    p_dup_id,
    v_p1,
    v_p2,
    p_status,
    p_admin_id,
    COALESCE(p_action_performed, 'Cambio de estado a ' || p_status)
  );

  -- Touch products to trigger downstream sync/events
  UPDATE public.products
  SET updated_at = now()
  WHERE id IN (v_p1, v_p2);
END;
$$;

-- 8. Merge products helper function
CREATE OR REPLACE FUNCTION public.merge_products(p_keep_id uuid, p_discard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reassign variants
  UPDATE public.product_variants
  SET product_id = p_keep_id
  WHERE product_id = p_discard_id;

  -- Reassign images
  UPDATE public.product_images
  SET product_id = p_keep_id
  WHERE product_id = p_discard_id;

  -- Reassign taxonomy history
  UPDATE public.taxonomy_history
  SET product_id = p_keep_id::text
  WHERE product_id = p_discard_id::text;

  -- Log history about merge
  INSERT INTO public.product_duplicate_history (
    product_id,
    related_product_id,
    action_type,
    details
  ) VALUES (
    p_keep_id,
    p_discard_id,
    'fusionado',
    'Producto ' || p_discard_id || ' fusionado con ' || p_keep_id
  );

  -- Delete discarded product
  DELETE FROM public.products WHERE id = p_discard_id;

  -- Touch kept product to trigger downstream sync/events
  UPDATE public.products
  SET updated_at = now()
  WHERE id = p_keep_id;

  -- Recalculate duplicates for keep product
  PERFORM public.recalculate_product_duplicates(p_keep_id);
END;
$$;

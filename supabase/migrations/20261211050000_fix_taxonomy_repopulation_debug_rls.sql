-- Migration: Fix RLS and Security Definer for taxonomy_repopulation_debug
-- Date: 2026-07-25

-- 1. Ensure INSERT policy exists for taxonomy_repopulation_debug
DROP POLICY IF EXISTS "Allow insert access to taxonomy_repopulation_debug" ON public.taxonomy_repopulation_debug;
CREATE POLICY "Allow insert access to taxonomy_repopulation_debug" 
  ON public.taxonomy_repopulation_debug
  FOR INSERT WITH CHECK (true);

-- 2. Grant permissions
GRANT ALL ON public.taxonomy_repopulation_debug TO authenticated, anon, service_role;

-- 3. Recreate trg_audit_taxonomy_repopulation as SECURITY DEFINER with xid8 cast fix
CREATE OR REPLACE FUNCTION public.trg_audit_taxonomy_repopulation()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text;
  v_old_cat_id uuid := NULL;
  v_txid bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_cat_id := OLD.category_id;
  END IF;

  IF NEW.category_id = 'ddd41421-fb1c-423f-a282-131aba8c4373' AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id)) THEN
    
    BEGIN
      v_query := current_query();
    EXCEPTION WHEN OTHERS THEN
      v_query := 'Unknown query';
    END;

    BEGIN
      v_txid := pg_current_xact_id()::text::bigint;
    EXCEPTION WHEN OTHERS THEN
      v_txid := NULL;
    END;

    INSERT INTO public.taxonomy_repopulation_debug (
      product_id,
      title,
      old_category_id,
      new_category_id,
      username,
      trigger_name,
      query,
      txid,
      metadata,
      vendor_id
    ) VALUES (
      NEW.id,
      NEW.title,
      v_old_cat_id,
      NEW.category_id,
      current_user,
      TG_NAME,
      v_query,
      v_txid,
      jsonb_build_object('source', 'trigger', 'action', TG_OP),
      NEW.vendor_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. HARDEN CRITICAL ADMIN FUNCTIONS WITH INTERNAL auth.uid() VALIDATION
-- ============================================================================

-- merge_products: ensure ONLY active admin caller can execute merge (returns void)
CREATE OR REPLACE FUNCTION public.merge_products(p_keep_id uuid, p_discard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.' USING errcode = '42501';
  END IF;

  IF p_keep_id = p_discard_id THEN
    RAISE EXCEPTION 'No se puede fusionar un producto consigo mismo';
  END IF;

  UPDATE public.product_variants SET product_id = p_keep_id WHERE product_id = p_discard_id;
  UPDATE public.vendor_product_variants SET product_id = p_keep_id WHERE product_id = p_discard_id;
  UPDATE public.product_images SET product_id = p_keep_id WHERE product_id = p_discard_id;
  UPDATE public.order_items SET product_id = p_keep_id WHERE product_id = p_discard_id;
  UPDATE public.reviews SET product_id = p_keep_id WHERE product_id = p_discard_id;
  UPDATE public.wishlists SET product_id = p_keep_id WHERE product_id = p_discard_id;
  UPDATE public.cart_items SET product_id = p_keep_id WHERE product_id = p_discard_id;

  INSERT INTO public.product_slug_redirects (old_slug, product_id, is_canonical_history)
  SELECT slug, p_keep_id, true FROM public.products WHERE id = p_discard_id
  ON CONFLICT (old_slug) DO UPDATE SET product_id = p_keep_id;

  DELETE FROM public.products WHERE id = p_discard_id;

  SELECT id INTO v_dup_id FROM public.product_duplicates
  WHERE (product_id = p_keep_id AND related_product_id = p_discard_id)
     OR (product_id = p_discard_id AND related_product_id = p_keep_id)
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    UPDATE public.product_duplicates
    SET status = 'merged', action_performed = 'Fusionado con producto ' || p_keep_id::text, updated_at = now()
    WHERE id = v_dup_id;
  END IF;
END;
$$;

-- generate_vendor_liquidations: enforce auth.uid() admin validation (returns jsonb)
CREATE OR REPLACE FUNCTION public.generate_vendor_liquidations(p_admin_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_vendor_id UUID;
  v_liq_id UUID;
  v_suborder RECORD;
  v_gross_sales NUMERIC(10,2);
  v_shipping_collected NUMERIC(10,2);
  v_marketplace_fees NUMERIC(10,2);
  v_payment_fees NUMERIC(10,2);
  v_net_amount NUMERIC(10,2);
  v_count INTEGER := 0;
  v_suborder_count INTEGER := 0;
  v_wednesday DATE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.' USING errcode = '42501';
  END IF;

  IF v_admin_id IS NULL AND p_admin_id IS NOT NULL THEN
    v_admin_id := p_admin_id;
  END IF;

  v_wednesday := CURRENT_DATE + ((3 - EXTRACT(DOW FROM CURRENT_DATE)::integer + 7) % 7);

  FOR v_vendor_id IN 
    SELECT DISTINCT vendor_id 
    FROM public.order_suborders 
    WHERE shipping_status = 'delivered' 
      AND liquidation_status = 'pending_liquidation'
  LOOP
    SELECT 
      COALESCE(SUM(subtotal), 0),
      COALESCE(SUM(shipping_cost), 0),
      COALESCE(SUM(commission_amount), 0),
      COALESCE(SUM(net_vendor_amount), 0)
    INTO 
      v_gross_sales,
      v_shipping_collected,
      v_marketplace_fees,
      v_net_amount
    FROM public.order_suborders
    WHERE vendor_id = v_vendor_id
      AND shipping_status = 'delivered'
      AND liquidation_status = 'pending_liquidation';

    IF v_gross_sales > 0 THEN
      INSERT INTO public.vendor_liquidations (
        vendor_id,
        period_start,
        period_end,
        payout_date,
        gross_sales,
        shipping_collected,
        marketplace_fees,
        payment_processing_fees,
        net_amount,
        status,
        created_by
      ) VALUES (
        v_vendor_id,
        CURRENT_DATE - INTERVAL '7 days',
        CURRENT_DATE,
        v_wednesday,
        v_gross_sales,
        v_shipping_collected,
        v_marketplace_fees,
        0,
        v_net_amount,
        'draft',
        v_admin_id
      ) RETURNING id INTO v_liq_id;

      FOR v_suborder IN 
        SELECT id, subtotal, commission_amount, net_vendor_amount
        FROM public.order_suborders
        WHERE vendor_id = v_vendor_id
          AND shipping_status = 'delivered'
          AND liquidation_status = 'pending_liquidation'
      LOOP
        INSERT INTO public.vendor_liquidation_items (
          liquidation_id,
          suborder_id,
          gross_amount,
          commission_amount,
          net_amount
        ) VALUES (
          v_liq_id,
          v_suborder.id,
          v_suborder.subtotal,
          v_suborder.commission_amount,
          v_suborder.net_vendor_amount
        );

        UPDATE public.order_suborders
        SET liquidation_status = 'in_liquidation',
            liquidation_id = v_liq_id,
            updated_at = now()
        WHERE id = v_suborder.id;

        v_suborder_count := v_suborder_count + 1;
      END LOOP;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'liquidations_generated', v_count,
    'suborders_processed', v_suborder_count,
    'payout_date', v_wednesday
  );
END;
$$;

-- mark_liquidation_as_paid: enforce auth.uid() admin validation (returns boolean)
CREATE OR REPLACE FUNCTION public.mark_liquidation_as_paid(p_admin_id uuid, p_liquidation_id uuid, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.' USING errcode = '42501';
  END IF;

  UPDATE public.vendor_liquidations
  SET status = 'paid',
      paid_at = now(),
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_liquidation_id;

  UPDATE public.order_suborders
  SET liquidation_status = 'liquidated',
      updated_at = now()
  WHERE liquidation_id = p_liquidation_id;

  RETURN true;
END;
$$;

-- update_duplicate_status: enforce auth.uid() admin validation (returns void)
CREATE OR REPLACE FUNCTION public.update_duplicate_status(p_dup_id uuid, p_status text, p_admin_id uuid, p_action_performed text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 uuid;
  v_p2 uuid;
  v_admin uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.' USING errcode = '42501';
  END IF;

  IF v_admin IS NULL AND p_admin_id IS NOT NULL THEN
    v_admin := p_admin_id;
  END IF;

  SELECT product_id, related_product_id INTO v_p1, v_p2
  FROM public.product_duplicates
  WHERE id = p_dup_id;

  UPDATE public.product_duplicates
  SET 
    status = p_status,
    admin_id = v_admin,
    action_performed = p_action_performed,
    updated_at = now()
  WHERE id = p_dup_id;

  INSERT INTO public.product_duplicate_history (
    duplicate_id,
    product_id,
    related_product_id,
    previous_status,
    new_status,
    changed_by,
    reason
  ) VALUES (
    p_dup_id,
    v_p1,
    v_p2,
    'pending',
    p_status,
    v_admin,
    p_action_performed
  );
END;
$$;

-- ============================================================================
-- 2. REVOKE & GRANT PERMISSIONS PER FUNCTION GROUP (REVOKING FROM PUBLIC TO BLIND REST)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.auto_assign_product_store() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_product_store() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.check_fulfillment_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_fulfillment_allowed() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.check_vendor_store_brand_modification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_vendor_store_brand_modification() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.check_vendor_store_insertion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_vendor_store_insertion() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.check_vendor_store_modification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_vendor_store_modification() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_buy_box_on_vendor_variant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_buy_box_on_vendor_variant() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_payment_events_append_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_payment_events_append_only() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_product_variant_stock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_product_variant_stock() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_published_product_guardrails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_published_product_guardrails() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_vendor_admin_fields_protection() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_vendor_admin_fields_protection() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_auto_create_vendor_notification_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_auto_create_vendor_notification_settings() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_trigger_adjustment_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trigger_adjustment_notification() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_trigger_dispute_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trigger_dispute_notification() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_trigger_whatsapp_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trigger_whatsapp_notification() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_product_store_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_product_store_change() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_review_change_recalculate_reputation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_review_change_recalculate_reputation() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_shipment_late_tracking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_shipment_late_tracking() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_suborder_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_suborder_status_change() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_default_dispatch_address() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_vendor_default_dispatch_address() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_payout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_vendor_payout() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_store_follower_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_vendor_store_follower_change() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.learn_funko_pop_category() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learn_funko_pop_category() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.ml_sync_master_stock_on_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_sync_master_stock_on_update() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.ml_sync_vendor_stock_on_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_sync_vendor_stock_on_update() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.prevent_self_admin_promotion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_self_admin_promotion() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_shipment_event_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_shipment_event_fields() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.secure_kyc_status_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.secure_kyc_status_update() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.secure_vendor_store_type_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.secure_vendor_store_type_update() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_master_variant_to_vendor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_master_variant_to_vendor() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_product_license_to_junction() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_product_license_to_junction() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_product_primary_category() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_product_primary_category() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_profile_to_user_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_to_user_roles() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_vendor_buy_box() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_vendor_buy_box() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_vendor_store_type() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_vendor_store_type() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_vendor_variant_to_master() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_vendor_variant_to_master() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_auto_curate_ml_raw_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_auto_curate_ml_raw_items() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_auto_curate_ml_raw_items_after() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_auto_curate_ml_raw_items_after() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_create_logistics_outbox_entry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_create_logistics_outbox_entry() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_process_logistics_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_process_logistics_outbox() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_audit_taxonomy_repopulation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_audit_taxonomy_repopulation() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_product_duplicates_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_product_duplicates_sync() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_variant_duplicates_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_variant_duplicates_sync() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trigger_ai_seo_optimizer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_ai_seo_optimizer() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trigger_wishlist_price_drop() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_wishlist_price_drop() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.trigger_wishlist_restock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_wishlist_restock() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_product_store_assignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_store_assignment() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_international_order_item_for_zinc(p_item_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_international_order_item_for_zinc(p_item_id uuid) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_ml_import_items(p_job_id uuid, p_limit integer, p_worker_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ml_import_items(p_job_id uuid, p_limit integer, p_worker_id text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_import_job_items(p_job_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_import_job_items(p_job_id uuid, p_limit integer) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_next_ml_import_job(p_worker_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_ml_import_job(p_worker_id text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.commit_international_capacity(p_reservation_id uuid, p_order_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_international_capacity(p_reservation_id uuid, p_order_id uuid) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_atomic(p_order_id uuid, p_payment_provider text, p_payment_ref text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(p_order_id uuid, p_payment_provider text, p_payment_ref text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(p_customer_id uuid, p_total_amount numeric, p_currency text, p_payment_method text, p_customer_email text, p_customer_phone text, p_shipping_address jsonb, p_affiliate_id uuid, p_coupon_id uuid, p_items jsonb, p_suborders jsonb, p_terms_accepted boolean, p_terms_accepted_at timestamp with time zone, p_accepted_terms_version text, p_email_opt_in boolean, p_whatsapp_opt_in boolean, p_logistics_consent boolean, p_display_currency text, p_display_subtotal numeric, p_display_shipping numeric, p_display_total numeric, p_fx_rate numeric, p_fx_rate_source text, p_shipping_weight_kg numeric, p_shipping_cost_ars numeric, p_shipping_cost_usd numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(p_customer_id uuid, p_total_amount numeric, p_currency text, p_payment_method text, p_customer_email text, p_customer_phone text, p_shipping_address jsonb, p_affiliate_id uuid, p_coupon_id uuid, p_items jsonb, p_suborders jsonb, p_terms_accepted boolean, p_terms_accepted_at timestamp with time zone, p_accepted_terms_version text, p_email_opt_in boolean, p_whatsapp_opt_in boolean, p_logistics_consent boolean, p_display_currency text, p_display_subtotal numeric, p_display_shipping numeric, p_display_total numeric, p_fx_rate numeric, p_fx_rate_source text, p_shipping_weight_kg numeric, p_shipping_cost_ars numeric, p_shipping_cost_usd numeric) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer, p_skip_ml_sync boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer, p_skip_ml_sync boolean) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.expire_stale_international_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_international_reservations() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_or_release_ml_import_job(p_job_id uuid, p_worker_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_or_release_ml_import_job(p_job_id uuid, p_worker_id text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.get_next_internal_sku(p_prefix text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_internal_sku(p_prefix text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_commission_rate(p_vendor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_commission_rate(p_vendor_id uuid) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.get_zinc_vault_secret(p_environment text, p_secret_type text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_zinc_vault_secret(p_environment text, p_secret_type text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.lock_shipping_queue_items(limit_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_shipping_queue_items(limit_count integer) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.recover_abandoned_ml_import_jobs(p_timeout_minutes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_abandoned_ml_import_jobs(p_timeout_minutes integer) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.release_international_capacity(p_reservation_id uuid, p_order_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_international_capacity(p_reservation_id uuid, p_order_id uuid, p_reason text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_international_capacity(p_amount_usd numeric, p_order_id uuid, p_user_id uuid, p_reservation_minutes integer, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_international_capacity(p_amount_usd numeric, p_order_id uuid, p_user_id uuid, p_reservation_minutes integer, p_metadata jsonb) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.reset_international_order_item_for_retry(p_item_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_international_order_item_for_retry(p_item_id uuid) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.spend_international_capacity(p_reservation_id uuid, p_order_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_international_capacity(p_reservation_id uuid, p_order_id uuid) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_public_site_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_public_site_config() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.invoke_admin_daily_summary_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_admin_daily_summary_cron() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.invoke_ml_import_worker_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_ml_import_worker_cron() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.invoke_zinc_sync_worker_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_zinc_sync_worker_cron() TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.increment_loyalty(p_user_id uuid, p_points integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_loyalty(p_user_id uuid, p_points integer) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.normalize_payment_status(p_provider text, p_provider_status text, p_status_detail text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_payment_status(p_provider text, p_provider_status text, p_status_detail text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.evaluate_product_rules(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_product_rules(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.evaluate_rule_conditions(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid, p_rule jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_rule_conditions(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid, p_rule jsonb) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.evaluate_single_condition(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid, p_cond jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_single_condition(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid, p_cond jsonb) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.extract_funko_subject(p_title text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extract_funko_subject(p_title text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.normalize_ml_category(p_value text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_ml_category(p_value text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.normalize_text(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_text(p_text text) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_algorithm_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_algorithm_config() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_feature_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_feature_flags() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_media_heavy_asset_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_media_heavy_asset_candidates() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_review_vendor_onboarding(p_vendor_id uuid, p_action text, p_notes text, p_rejected_steps jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_vendor_onboarding(p_vendor_id uuid, p_action text, p_notes text, p_rejected_steps jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_search_locations(search_term text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_locations(search_term text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(search_term text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(search_term text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_segment_estimate(rules jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_segment_estimate(rules jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_vendor_invitation(p_email character varying, p_store_name character varying, p_commission_rate numeric, p_initial_status character varying, p_message text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vendor_invitation(p_email character varying, p_store_name character varying, p_commission_rate numeric, p_initial_status character varying, p_message text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.curate_raw_item_manually(p_raw_item_id uuid, p_category_id uuid, p_brand_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curate_raw_item_manually(p_raw_item_id uuid, p_category_id uuid, p_brand_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.emergency_kill_all_features() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_kill_all_features() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_products_in_batch(p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_products_in_batch(p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_vendor_liquidations(p_admin_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_vendor_liquidations(p_admin_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_affected_products(p_vendor_id uuid, p_taxonomy_type text, p_ml_category_id text, p_proposed_name text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_affected_products(p_vendor_id uuid, p_taxonomy_type text, p_ml_category_id text, p_proposed_name text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_ai_search_analytics_summary(p_days integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_search_analytics_summary(p_days integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_automation_dashboard_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_automation_dashboard_metrics() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_batch_classification_preview(p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_batch_classification_preview(p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_effective_payment_status(p_order_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_payment_status(p_order_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_international_capacity_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_international_capacity_summary() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_mapping_rules_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mapping_rules_stats() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_marketplace_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_marketplace_kpis() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_rule_impact_preview(p_field text, p_value text, p_conditions jsonb, p_logical_operator text, p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rule_impact_preview(p_field text, p_value text, p_conditions jsonb, p_logical_operator text, p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_segment_emails(p_segment_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_segment_emails(p_segment_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_taxonomy_conflicts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_taxonomy_conflicts() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_top_vendors(p_limit integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_vendors(p_limit integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_liquidation_as_paid(p_admin_id uuid, p_liquidation_id uuid, p_reference text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_liquidation_as_paid(p_admin_id uuid, p_liquidation_id uuid, p_reference text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.merge_products(p_keep_id uuid, p_discard_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_products(p_keep_id uuid, p_discard_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.recalculate_candidate_category_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_candidate_category_suggestions() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.recalculate_product_duplicates(p_product_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_product_duplicates(p_product_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.register_manual_payment(p_order_id uuid, p_method text, p_amount numeric, p_currency text, p_reference text, p_notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_manual_payment(p_order_id uuid, p_method text, p_amount numeric, p_currency text, p_reference text, p_notes text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.restore_all_features() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_all_features() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_zinc_vault_secret(p_environment text, p_secret text, p_secret_type text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_zinc_vault_secret(p_environment text, p_secret text, p_secret_type text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_duplicate_status(p_dup_id uuid, p_status text, p_admin_id uuid, p_action_performed text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_duplicate_status(p_dup_id uuid, p_status text, p_admin_id uuid, p_action_performed text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_international_sync_cron() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_international_sync_cron() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_ml_category_mappings_in_raw_items(p_ml_category_id text, p_internal_category_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ml_category_mappings_in_raw_items(p_ml_category_id text, p_internal_category_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_ml_raw_items_brand(p_old_brand_id uuid, p_new_brand_id uuid, p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ml_raw_items_brand(p_old_brand_id uuid, p_new_brand_id uuid, p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.apply_rule_to_existing(p_rule_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_rule_to_existing(p_rule_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.auto_curate_raw_item(p_raw_item_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_curate_raw_item(p_raw_item_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_vendor_invitation(p_token character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_vendor_invitation(p_token character varying) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_vendor_terms(p_document_id uuid, p_ip_address text, p_user_agent text, p_device_metadata jsonb, p_source text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_vendor_terms(p_document_id uuid, p_ip_address text, p_user_agent text, p_device_metadata jsonb, p_source text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.acknowledge_onboarding_item(p_item_type text, p_item_version text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_onboarding_item(p_item_type text, p_item_version text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.dismiss_vendor_terms_notice(p_legal_document_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_vendor_terms_notice(p_legal_document_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_active_vendor_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_vendor_terms() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_onboarding_status(p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_onboarding_status(p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_sales_metrics(p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_sales_metrics(p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_suborder_details(p_suborder_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_suborder_details(p_suborder_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_suborder_details_by_number(p_suborder_number text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_suborder_details_by_number(p_suborder_number text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_taxonomy_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_taxonomy_pending() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reset_vendor_terms_notice(p_vendor_id uuid, p_legal_document_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_vendor_terms_notice(p_vendor_id uuid, p_legal_document_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_vendor_onboarding_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_onboarding_for_review() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.toggle_onboarding_minimized(p_minimized boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_onboarding_minimized(p_minimized boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.vendor_has_accepted_current_terms(p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_has_accepted_current_terms(p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.vendor_requires_terms_acceptance(p_vendor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_requires_terms_acceptance(p_vendor_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_access_shipping_label_as_vendor(p_name text, p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_shipping_label_as_vendor(p_name text, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.search_admin_products(p_search text, p_category_id uuid, p_brand_id uuid, p_vendor_id text, p_status text, p_page integer, p_page_size integer, p_sort_field text, p_sort_order text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_admin_products(p_search text, p_category_id uuid, p_brand_id uuid, p_vendor_id text, p_status text, p_page integer, p_page_size integer, p_sort_field text, p_sort_order text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_vault_stats(p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vault_stats(p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_user_customs_summary(p_year integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_customs_summary(p_year integer) TO authenticated, service_role;
-- RLS Helper functions required by table/view RLS policies for anonymous queries
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_order_customer(p_order_id uuid, p_customer_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_order_vendor(p_order_id uuid, p_vendor_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_shipping_label_as_customer(p_name text, p_user_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_shipping_label_as_vendor(p_name text, p_user_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_international_public_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_payment_providers() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_buybox(p_product_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_products_for_comparison(p_product_ids uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_brand_facets(p_category_slug text, p_search_query text, p_vendor_store_id uuid, p_group_slug text, p_is_international boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_international_category_facets(p_brand_slug text, p_search_query text, p_min_price numeric, p_max_price numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_collector_showcase(p_handle text, p_collection_slug text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_similar_products(p_product_id uuid, p_limit integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_products_ai(p_query text, p_filters jsonb, p_embedding vector, p_limit integer, p_offset integer, p_availability text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_academy_articles_for_search(p_query text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_ml_client_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_duplicate_product(p_title text, p_brand_id uuid, p_sku text, p_gtin text, p_asin text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_products_by_title(title_query text, similarity_threshold numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_gtin_checksum(p_code text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_ai_search_event(p_query text, p_normalized_query text, p_intent text, p_filters jsonb, p_results_count integer, p_session_id text, p_device text, p_source text, p_latency_ms integer, p_ai_level integer, p_ai_cost_usd numeric) TO anon, authenticated, service_role;
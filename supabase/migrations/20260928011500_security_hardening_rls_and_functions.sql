ALTER FUNCTION public.accept_vendor_invitation(p_token character varying) SET search_path = public;
ALTER FUNCTION public.accept_vendor_terms(p_document_id uuid, p_ip_address text, p_user_agent text, p_device_metadata jsonb, p_source text) SET search_path = public;
ALTER FUNCTION public.acknowledge_onboarding_item(p_item_type text, p_item_version text) SET search_path = public;
ALTER FUNCTION public.admin_get_algorithm_config() SET search_path = public;
ALTER FUNCTION public.admin_get_feature_flags() SET search_path = public;
ALTER FUNCTION public.admin_media_heavy_asset_candidates() SET search_path = public;
ALTER FUNCTION public.admin_review_vendor_onboarding(p_vendor_id uuid, p_action text, p_notes text, p_rejected_steps jsonb) SET search_path = public;
ALTER FUNCTION public.admin_search_locations(search_term text) SET search_path = public;
ALTER FUNCTION public.admin_search_users(search_term text) SET search_path = public;
ALTER FUNCTION public.auto_assign_product_store() SET search_path = public;
ALTER FUNCTION public.calculate_segment_estimate(rules jsonb) SET search_path = public;
ALTER FUNCTION public.check_duplicate_product(p_title text, p_brand_id uuid, p_sku text, p_gtin text, p_asin text) SET search_path = public;
ALTER FUNCTION public.check_fulfillment_allowed() SET search_path = public;
ALTER FUNCTION public.check_vendor_store_brand_modification() SET search_path = public;
ALTER FUNCTION public.check_vendor_store_insertion() SET search_path = public;
ALTER FUNCTION public.check_vendor_store_modification() SET search_path = public;
ALTER FUNCTION public.claim_international_order_item_for_zinc(p_item_id uuid) SET search_path = public;
ALTER FUNCTION public.claim_ml_import_items(p_job_id uuid, p_limit integer, p_worker_id text) SET search_path = public;
ALTER FUNCTION public.claim_next_ml_import_job(p_worker_id text) SET search_path = public;
ALTER FUNCTION public.cleanup_cron_job_history(retention_days integer) SET search_path = public;
ALTER FUNCTION public.commit_international_capacity(p_reservation_id uuid, p_order_id uuid) SET search_path = public;
ALTER FUNCTION public.confirm_payment_atomic(p_order_id uuid, p_payment_provider text, p_payment_ref text) SET search_path = public;
ALTER FUNCTION public.create_order_atomic(p_customer_id uuid, p_total_amount numeric, p_currency text, p_payment_method text, p_customer_email text, p_customer_phone text, p_shipping_address jsonb, p_affiliate_id uuid, p_coupon_id uuid, p_items jsonb, p_suborders jsonb, p_terms_accepted boolean, p_terms_accepted_at timestamp with time zone, p_accepted_terms_version text, p_email_opt_in boolean, p_whatsapp_opt_in boolean, p_logistics_consent boolean, p_display_currency text, p_display_subtotal numeric, p_display_shipping numeric, p_display_total numeric, p_fx_rate numeric, p_fx_rate_source text, p_shipping_weight_kg numeric, p_shipping_cost_ars numeric, p_shipping_cost_usd numeric) SET search_path = public;
ALTER FUNCTION public.create_vendor_invitation(p_email character varying, p_store_name character varying, p_commission_rate numeric, p_initial_status character varying, p_message text) SET search_path = public;
ALTER FUNCTION public.curate_raw_item_manually(p_raw_item_id uuid, p_category_id uuid, p_brand_id uuid) SET search_path = public;
ALTER FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer, p_skip_ml_sync boolean) SET search_path = public;
ALTER FUNCTION public.dismiss_vendor_terms_notice(p_legal_document_id uuid) SET search_path = public;
ALTER FUNCTION public.emergency_kill_all_features() SET search_path = public;
ALTER FUNCTION public.enforce_buy_box_on_vendor_variant() SET search_path = public;
ALTER FUNCTION public.enforce_payment_events_append_only() SET search_path = public;
ALTER FUNCTION public.enforce_product_variant_stock() SET search_path = public;
ALTER FUNCTION public.enforce_published_product_guardrails() SET search_path = public;
ALTER FUNCTION public.enforce_vendor_admin_fields_protection() SET search_path = public;
ALTER FUNCTION public.expire_stale_international_reservations() SET search_path = public;
ALTER FUNCTION public.finalize_or_release_ml_import_job(p_job_id uuid, p_worker_id text) SET search_path = public;
ALTER FUNCTION public.find_duplicate_products_in_batch(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.fn_auto_create_vendor_notification_settings() SET search_path = public;
ALTER FUNCTION public.fn_trigger_adjustment_notification() SET search_path = public;
ALTER FUNCTION public.fn_trigger_dispute_notification() SET search_path = public;
ALTER FUNCTION public.fn_trigger_whatsapp_notification() SET search_path = public;
ALTER FUNCTION public.generate_vendor_liquidations(p_admin_id uuid) SET search_path = public;
ALTER FUNCTION public.get_active_vendor_terms() SET search_path = public;
ALTER FUNCTION public.get_affected_products(p_vendor_id uuid, p_taxonomy_type text, p_ml_category_id text, p_proposed_name text) SET search_path = public;
ALTER FUNCTION public.get_ai_search_analytics_summary(p_days integer) SET search_path = public;
ALTER FUNCTION public.get_automation_dashboard_metrics() SET search_path = public;
ALTER FUNCTION public.get_batch_classification_preview(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.get_effective_payment_status(p_order_id uuid) SET search_path = public;
ALTER FUNCTION public.get_international_capacity_summary() SET search_path = public;
ALTER FUNCTION public.get_international_category_facets(p_brand_slug text, p_search_query text, p_min_price numeric, p_max_price numeric) SET search_path = public;
ALTER FUNCTION public.get_marketplace_kpis() SET search_path = public;
ALTER FUNCTION public.get_next_internal_sku(p_prefix text) SET search_path = public;
ALTER FUNCTION public.get_product_buybox(p_product_id uuid) SET search_path = public;
ALTER FUNCTION public.get_products_for_comparison(p_product_ids uuid[]) SET search_path = public;
ALTER FUNCTION public.get_public_collector_showcase(p_handle text, p_collection_slug text) SET search_path = public;
ALTER FUNCTION public.get_public_ml_client_id() SET search_path = public;
ALTER FUNCTION public.get_rule_impact_preview(p_field text, p_value text, p_conditions jsonb, p_logical_operator text, p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.get_segment_emails(p_segment_id uuid) SET search_path = public;
ALTER FUNCTION public.get_similar_products(p_product_id uuid, p_limit integer) SET search_path = public;
ALTER FUNCTION public.get_taxonomy_conflicts() SET search_path = public;
ALTER FUNCTION public.get_top_vendors(p_limit integer) SET search_path = public;
ALTER FUNCTION public.get_vault_stats(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.get_vendor_commission_rate(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.get_vendor_onboarding_status(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.get_vendor_sales_metrics(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.get_vendor_taxonomy_pending() SET search_path = public;
ALTER FUNCTION public.get_zinc_vault_secret(p_environment text, p_secret_type text) SET search_path = public;
ALTER FUNCTION public.handle_product_store_change() SET search_path = public;
ALTER FUNCTION public.handle_review_change_recalculate_reputation() SET search_path = public;
ALTER FUNCTION public.handle_shipment_late_tracking() SET search_path = public;
ALTER FUNCTION public.handle_suborder_status_change() SET search_path = public;
ALTER FUNCTION public.handle_vendor_payout() SET search_path = public;
ALTER FUNCTION public.handle_vendor_store_follower_change() SET search_path = public;
ALTER FUNCTION public.invoke_admin_daily_summary_cron() SET search_path = public;
ALTER FUNCTION public.invoke_ml_import_worker_cron() SET search_path = public;
ALTER FUNCTION public.invoke_zinc_sync_worker_cron() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_superadmin() SET search_path = public;
ALTER FUNCTION public.is_valid_gtin_checksum(p_code text) SET search_path = public;
ALTER FUNCTION public.learn_funko_pop_category() SET search_path = public;
ALTER FUNCTION public.lock_shipping_queue_items(limit_count integer) SET search_path = public;
ALTER FUNCTION public.log_ai_search_event(p_query text, p_normalized_query text, p_intent text, p_filters jsonb, p_results_count integer, p_session_id text, p_device text, p_source text, p_latency_ms integer, p_ai_level integer, p_ai_cost_usd numeric) SET search_path = public;
ALTER FUNCTION public.mark_liquidation_as_paid(p_admin_id uuid, p_liquidation_id uuid, p_reference text) SET search_path = public;
ALTER FUNCTION public.match_products_by_title(title_query text, similarity_threshold numeric) SET search_path = public;
ALTER FUNCTION public.merge_products(p_keep_id uuid, p_discard_id uuid) SET search_path = public;
ALTER FUNCTION public.ml_sync_master_stock_on_update() SET search_path = public;
ALTER FUNCTION public.ml_sync_vendor_stock_on_update() SET search_path = public;
ALTER FUNCTION public.prevent_self_admin_promotion() SET search_path = public;
ALTER FUNCTION public.recalculate_product_duplicates(p_product_id uuid) SET search_path = public;
ALTER FUNCTION public.recover_abandoned_ml_import_jobs(p_timeout_minutes integer) SET search_path = public;
ALTER FUNCTION public.register_manual_payment(p_order_id uuid, p_method text, p_amount numeric, p_currency text, p_reference text, p_notes text) SET search_path = public;
ALTER FUNCTION public.release_expired_reservations() SET search_path = public;
ALTER FUNCTION public.release_international_capacity(p_reservation_id uuid, p_order_id uuid, p_reason text) SET search_path = public;
ALTER FUNCTION public.reserve_international_capacity(p_amount_usd numeric, p_order_id uuid, p_user_id uuid, p_reservation_minutes integer, p_metadata jsonb) SET search_path = public;
ALTER FUNCTION public.reset_international_order_item_for_retry(p_item_id uuid) SET search_path = public;
ALTER FUNCTION public.reset_vendor_terms_notice(p_vendor_id uuid, p_legal_document_id uuid) SET search_path = public;
ALTER FUNCTION public.resolve_shipment_event_fields() SET search_path = public;
ALTER FUNCTION public.restore_all_features() SET search_path = public;
ALTER FUNCTION public.search_products_ai(p_query text, p_filters jsonb, p_embedding vector, p_limit integer, p_offset integer, p_availability text) SET search_path = public;
ALTER FUNCTION public.secure_kyc_status_update() SET search_path = public;
ALTER FUNCTION public.secure_vendor_store_type_update() SET search_path = public;
ALTER FUNCTION public.set_zinc_vault_secret(p_environment text, p_secret text, p_secret_type text) SET search_path = public;
ALTER FUNCTION public.spend_international_capacity(p_reservation_id uuid, p_order_id uuid) SET search_path = public;
ALTER FUNCTION public.submit_vendor_onboarding_for_review() SET search_path = public;
ALTER FUNCTION public.sync_master_variant_to_vendor() SET search_path = public;
ALTER FUNCTION public.sync_product_primary_category() SET search_path = public;
ALTER FUNCTION public.sync_profile_to_user_roles() SET search_path = public;
ALTER FUNCTION public.sync_public_site_config() SET search_path = public;
ALTER FUNCTION public.sync_vendor_buy_box() SET search_path = public;
ALTER FUNCTION public.sync_vendor_store_type() SET search_path = public;
ALTER FUNCTION public.sync_vendor_variant_to_master() SET search_path = public;
ALTER FUNCTION public.toggle_onboarding_minimized(p_minimized boolean) SET search_path = public;
ALTER FUNCTION public.trg_fn_create_logistics_outbox_entry() SET search_path = public;
ALTER FUNCTION public.trg_fn_process_logistics_outbox() SET search_path = public;
ALTER FUNCTION public.trigger_ai_seo_optimizer() SET search_path = public;
ALTER FUNCTION public.trigger_wishlist_price_drop() SET search_path = public;
ALTER FUNCTION public.trigger_wishlist_restock() SET search_path = public;
ALTER FUNCTION public.update_duplicate_status(p_dup_id uuid, p_status text, p_admin_id uuid, p_action_performed text) SET search_path = public;
ALTER FUNCTION public.update_international_sync_cron() SET search_path = public;
ALTER FUNCTION public.update_ml_category_mappings_in_raw_items(p_ml_category_id text, p_internal_category_id uuid) SET search_path = public;
ALTER FUNCTION public.update_ml_raw_items_brand(p_old_brand_id uuid, p_new_brand_id uuid, p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.validate_product_store_assignment() SET search_path = public;
ALTER FUNCTION public.vendor_has_accepted_current_terms(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.vendor_requires_terms_acceptance(p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.apply_rule_to_existing(p_rule_id uuid) SET search_path = public;
ALTER FUNCTION public.auto_curate_raw_item(p_raw_item_id uuid) SET search_path = public;
ALTER FUNCTION public.claim_import_job_items(p_job_id uuid, p_limit integer) SET search_path = public;
ALTER FUNCTION public.evaluate_product_rules(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid) SET search_path = public;
ALTER FUNCTION public.evaluate_rule_conditions(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid, p_rule jsonb) SET search_path = public;
ALTER FUNCTION public.evaluate_single_condition(p_title text, p_ml_category_id text, p_brand_name text, p_vendor_id uuid, p_cond jsonb) SET search_path = public;
ALTER FUNCTION public.extract_funko_subject(p_title text) SET search_path = public;
ALTER FUNCTION public.get_brand_facets(p_category_slug text, p_search_query text, p_vendor_store_id uuid, p_group_slug text, p_is_international boolean) SET search_path = public;
ALTER FUNCTION public.handle_vendor_default_dispatch_address() SET search_path = public;
ALTER FUNCTION public.normalize_ml_category(p_value text) SET search_path = public;
ALTER FUNCTION public.normalize_payment_status(p_provider text, p_provider_status text, p_status_detail text) SET search_path = public;
ALTER FUNCTION public.normalize_text(p_text text) SET search_path = public;
ALTER FUNCTION public.search_admin_products(p_search text, p_category_id uuid, p_brand_id uuid, p_vendor_id text, p_status text, p_page integer, p_page_size integer, p_sort_field text, p_sort_order text) SET search_path = public;
ALTER FUNCTION public.sync_product_license_to_junction() SET search_path = public;
ALTER FUNCTION public.trg_auto_curate_ml_raw_items() SET search_path = public;
ALTER FUNCTION public.trg_auto_curate_ml_raw_items_after() SET search_path = public;
ALTER FUNCTION public.trg_product_duplicates_sync() SET search_path = public;
ALTER FUNCTION public.trg_variant_duplicates_sync() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- ============================================================================
-- 2. TIGHTEN RLS ON public.product_slug_redirects
-- ============================================================================
DROP POLICY IF EXISTS "Allow admin full access to product_slug_redirects" ON public.product_slug_redirects;
DROP POLICY IF EXISTS "Allow public read access to product_slug_redirects" ON public.product_slug_redirects;

CREATE POLICY "Allow public read access to product_slug_redirects"
ON public.product_slug_redirects
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow admin full access to product_slug_redirects"
ON public.product_slug_redirects
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ============================================================================
-- 3. TIGHTEN INSERT RLS ON public.shipments
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users create shipments" ON public.shipments;

CREATE POLICY "Authenticated users create shipments"
ON public.shipments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o 
    WHERE o.id = shipments.order_id 
      AND (o.customer_id = auth.uid() OR o.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.order_suborders sub 
    WHERE sub.id = shipments.suborder_id 
      AND sub.vendor_id = auth.uid()
  )
  OR public.is_admin()
);

-- ============================================================================
-- 4. CLOSE PUBLIC INSERT ON public.taxonomy_repopulation_debug
-- ============================================================================
DROP POLICY IF EXISTS "Allow insert access to taxonomy_repopulation_debug" ON public.taxonomy_repopulation_debug;

CREATE POLICY "Allow admin insert to taxonomy_repopulation_debug"
ON public.taxonomy_repopulation_debug
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- ============================================================================
-- 5. SET security_invoker = true ON PUBLIC VIEWS
-- ============================================================================
ALTER VIEW public.categories_with_published_counts SET (security_invoker = true);
ALTER VIEW public.themes_with_counts SET (security_invoker = true);
ALTER VIEW public.licenses_with_counts SET (security_invoker = true);
ALTER VIEW public.delivery_providers SET (security_invoker = true);
ALTER VIEW public.delivery_providers_admin SET (security_invoker = true);
ALTER VIEW public.shipping_providers_admin SET (security_invoker = true);


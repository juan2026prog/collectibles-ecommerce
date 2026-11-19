-- =============================================================================
-- Staging-Only Hardening Migration: 20271119000200_staging_rls_and_deblex_rpc_hardening.sql
-- Target: Supabase Staging (csnudufkpfzveoonjumy) ONLY.
-- DO NOT apply to Production (cobtsgkwcftvexaarwmo).
--
-- Purpose:
--   1. Enable RLS + least-privilege policies on the 10 public tables in Staging
--      that had rls_disabled_in_public with full anon/authenticated grants.
--   2. Add missing RLS policies on argentina_audit_logs, argentina_consolidation_items,
--      and deblex_pre_alerts (preserving all Deblex operator/customer workflows).
--   3. Revoke excessive anon grants on tables and SECURITY DEFINER Deblex RPCs
--      without altering any historical consolidations, ledger entries, or invoices.
-- =============================================================================

-- 1. Enable RLS on all 10 exposed tables in Staging
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_suborders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

-- 2. Revoke blanket anon/authenticated write grants on sensitive tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_suborders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.international_products FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.international_sync_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.shipping_providers FROM anon;
REVOKE ALL ON public.stock_reservations FROM anon;
REVOKE ALL ON public.daily_order_counters FROM anon, authenticated;
REVOKE ALL ON public.customer_consents FROM anon;
REVOKE ALL ON public.payment_attempts FROM anon;

-- 3. Least-privilege RLS policies for the 10 tables

-- orders: customer reads own; admin manages all
DROP POLICY IF EXISTS staging_orders_select_own ON public.orders;
CREATE POLICY staging_orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS staging_orders_admin_all ON public.orders;
CREATE POLICY staging_orders_admin_all ON public.orders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- order_suborders: customer reads own parent order's suborders; admin manages all
DROP POLICY IF EXISTS staging_order_suborders_select_own ON public.order_suborders;
CREATE POLICY staging_order_suborders_select_own ON public.order_suborders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = parent_order_id AND o.customer_id = auth.uid()));

DROP POLICY IF EXISTS staging_order_suborders_admin_all ON public.order_suborders;
CREATE POLICY staging_order_suborders_admin_all ON public.order_suborders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- order_items: customer reads own order's items; admin manages all
DROP POLICY IF EXISTS staging_order_items_select_own ON public.order_items;
CREATE POLICY staging_order_items_select_own ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));

DROP POLICY IF EXISTS staging_order_items_admin_all ON public.order_items;
CREATE POLICY staging_order_items_admin_all ON public.order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- international_products: public read; admin manage
DROP POLICY IF EXISTS staging_intl_products_public_select ON public.international_products;
CREATE POLICY staging_intl_products_public_select ON public.international_products
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS staging_intl_products_admin_all ON public.international_products;
CREATE POLICY staging_intl_products_admin_all ON public.international_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- international_sync_settings: admin only (public status goes through get_international_public_status RPC)
DROP POLICY IF EXISTS staging_intl_sync_settings_admin_all ON public.international_sync_settings;
CREATE POLICY staging_intl_sync_settings_admin_all ON public.international_sync_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- shipping_providers: public read active; admin manage
DROP POLICY IF EXISTS staging_shipping_providers_public_select ON public.shipping_providers;
CREATE POLICY staging_shipping_providers_public_select ON public.shipping_providers
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS staging_shipping_providers_admin_all ON public.shipping_providers;
CREATE POLICY staging_shipping_providers_admin_all ON public.shipping_providers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- stock_reservations: admin read/manage only (backend service_role bypasses RLS)
DROP POLICY IF EXISTS staging_stock_reservations_admin_all ON public.stock_reservations;
CREATE POLICY staging_stock_reservations_admin_all ON public.stock_reservations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- daily_order_counters: service_role only (no anon/authenticated policy needed)

-- customer_consents: admin only (written via service_role in create_order_atomic_v2)
DROP POLICY IF EXISTS staging_customer_consents_admin_all ON public.customer_consents;
CREATE POLICY staging_customer_consents_admin_all ON public.customer_consents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- payment_attempts: user reads own; admin manages all
DROP POLICY IF EXISTS staging_payment_attempts_select_own ON public.payment_attempts;
CREATE POLICY staging_payment_attempts_select_own ON public.payment_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS staging_payment_attempts_admin_all ON public.payment_attempts;
CREATE POLICY staging_payment_attempts_admin_all ON public.payment_attempts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- 4. Missing RLS policies on Deblex operational tables (preserving all Deblex workflows)
DROP POLICY IF EXISTS staging_argentina_audit_logs_deblex_read ON public.argentina_audit_logs;
CREATE POLICY staging_argentina_audit_logs_deblex_read ON public.argentina_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_deblex_user(auth.uid()));

DROP POLICY IF EXISTS staging_argentina_consolidation_items_select ON public.argentina_consolidation_items;
CREATE POLICY staging_argentina_consolidation_items_select ON public.argentina_consolidation_items
  FOR SELECT TO authenticated
  USING (
    public.is_deblex_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.argentina_consolidations c
      WHERE c.id = consolidation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staging_deblex_pre_alerts_select ON public.deblex_pre_alerts;
CREATE POLICY staging_deblex_pre_alerts_select ON public.deblex_pre_alerts
  FOR SELECT TO authenticated
  USING (public.is_deblex_user(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS staging_deblex_pre_alerts_deblex_manage ON public.deblex_pre_alerts;
CREATE POLICY staging_deblex_pre_alerts_deblex_manage ON public.deblex_pre_alerts
  FOR ALL TO authenticated
  USING (public.is_deblex_user(auth.uid()))
  WITH CHECK (public.is_deblex_user(auth.uid()));

-- 5. Least-privilege EXECUTE hardening on Deblex SECURITY DEFINER RPCs
REVOKE EXECUTE ON FUNCTION public.close_consolidation_atomic(uuid[], text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.close_consolidation_atomic(uuid[], text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_create_consolidation(uuid[], text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_create_consolidation(uuid[], text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_edit_consolidation(uuid, uuid[], jsonb, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_edit_consolidation(uuid, uuid[], jsonb, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_undo_consolidation(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_undo_consolidation(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_redo_consolidation(uuid, uuid[], text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_redo_consolidation(uuid, uuid[], text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_set_shipment_status(uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_set_shipment_status(uuid, boolean, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_register_package_document(uuid, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_register_package_document(uuid, text, text, bigint, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_replace_package_document(uuid, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_replace_package_document(uuid, text, text, bigint, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deblex_delete_package_document(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deblex_delete_package_document(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_deblex_consolidation_code() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_deblex_consolidation_code() TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_deblex_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_deblex_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_deblex_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_deblex_user(uuid) TO authenticated, service_role;

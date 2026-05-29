-- Alter ml_sync_queue status check constraint to support pending, processing, completed, failed, dead_letter
ALTER TABLE public.ml_sync_queue DROP CONSTRAINT IF EXISTS ml_sync_queue_status_check;
ALTER TABLE public.ml_sync_queue ADD CONSTRAINT ml_sync_queue_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'dead_letter'::text]));

-- Recreate foreign keys referencing ml_seller_accounts(seller_id) with ON UPDATE CASCADE to support self-healing transitions cleanly.
ALTER TABLE public.ml_sync_queue DROP CONSTRAINT IF EXISTS ml_sync_queue_seller_id_fkey;
ALTER TABLE public.ml_sync_queue ADD CONSTRAINT ml_sync_queue_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.ml_raw_items DROP CONSTRAINT IF EXISTS ml_raw_items_seller_id_fkey;
ALTER TABLE public.ml_raw_items ADD CONSTRAINT ml_raw_items_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.ml_catalog_links DROP CONSTRAINT IF EXISTS ml_catalog_links_seller_id_fkey;
ALTER TABLE public.ml_catalog_links ADD CONSTRAINT ml_catalog_links_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.ml_import_logs DROP CONSTRAINT IF EXISTS ml_import_logs_seller_id_fkey;
ALTER TABLE public.ml_import_logs ADD CONSTRAINT ml_import_logs_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Alter ml_raw_items status check constraint to support pending, analyzing, review_needed, ignored, approved
ALTER TABLE public.ml_raw_items DROP CONSTRAINT IF EXISTS ml_raw_items_status_check;
ALTER TABLE public.ml_raw_items ADD CONSTRAINT ml_raw_items_status_check CHECK (status = ANY (ARRAY['pending'::text, 'analyzing'::text, 'review_needed'::text, 'ignored'::text, 'approved'::text]));

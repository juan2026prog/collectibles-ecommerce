-- Alter ml_import_matches to add is_strong column
ALTER TABLE public.ml_import_matches ADD COLUMN IF NOT EXISTS is_strong BOOLEAN DEFAULT FALSE;

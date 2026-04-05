-- Add SEO columns to products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS seo_title text,
ADD COLUMN IF NOT EXISTS seo_description text;

-- Enable pg_net if not enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_ai_seo_optimizer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We only trigger if seo_title or seo_description is null or being inserted empty.
  -- The Edge Function also checks this, but we can do a sanity check here too.
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND (NEW.seo_title IS NULL OR NEW.seo_description IS NULL)) THEN
    
    PERFORM extensions.http_post(
      url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/ai-seo-optimizer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Use the anon key to invoke the function securely
        'Authorization', current_setting('request.headers')::json->>'authorization'
      ),
      body := json_build_object(
        'type', TG_OP,
        'record', row_to_json(NEW)
      )::jsonb
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists to recreate
DROP TRIGGER IF EXISTS trigger_ai_seo_optimizer ON public.products;

-- Create the trigger on the products table
CREATE TRIGGER trigger_ai_seo_optimizer
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_seo_optimizer();

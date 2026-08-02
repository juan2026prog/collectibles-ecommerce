-- Migration: customer_international_addresses table for pilot shipping
-- Path: supabase/migrations/20261212020000_customer_international_addresses.sql

CREATE TABLE IF NOT EXISTS public.customer_international_addresses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label text NOT NULL, -- ej: 'Mi casilla Urubox', 'Courier USX familiar'
    courier_name text NOT NULL, -- ej: 'Urubox', 'USX Cargo', 'Courier Express'
    recipient_name text NOT NULL, -- Nombre completo destinatario exigido por courier
    customer_code text, -- Número de suite / casilla (UY12345)
    address_line_1 text NOT NULL, -- Calle, número, etc.
    address_line_2 text, -- Apto, Suite, indicaciones
    city text NOT NULL,
    state text NOT NULL, -- FL / Florida
    postal_code text NOT NULL, -- ZIP Code (ej: 33172)
    country text NOT NULL DEFAULT 'United States',
    phone text NOT NULL, -- Teléfono de depósito
    instructions text, -- Instrucciones adicionales
    is_default boolean DEFAULT false NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Configurar RLS
ALTER TABLE public.customer_international_addresses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors during re-runs
DROP POLICY IF EXISTS "Users can manage their own international addresses" ON public.customer_international_addresses;
DROP POLICY IF EXISTS "Admins can view all international addresses" ON public.customer_international_addresses;

CREATE POLICY "Users can manage their own international addresses" 
ON public.customer_international_addresses
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all international addresses" 
ON public.customer_international_addresses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Re-create set_updated_at trigger for this table
DROP TRIGGER IF EXISTS set_updated_at ON public.customer_international_addresses;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.customer_international_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

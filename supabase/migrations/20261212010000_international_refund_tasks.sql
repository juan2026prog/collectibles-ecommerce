-- 1. Agregar campos de auditoría de Tipo de Cambio a las subórdenes
ALTER TABLE public.order_suborders
ADD COLUMN IF NOT EXISTS exchange_rate_used numeric(10,4),
ADD COLUMN IF NOT EXISTS exchange_rate_source text,
ADD COLUMN IF NOT EXISTS exchange_rate_buffer_percent numeric(4,2),
ADD COLUMN IF NOT EXISTS exchange_rate_timestamp timestamptz;

-- 2. Modificar constraint de estado de subórdenes para permitir nuevos estados internacionales
ALTER TABLE public.order_suborders DROP CONSTRAINT IF EXISTS order_suborders_status_check;
ALTER TABLE public.order_suborders ADD CONSTRAINT order_suborders_status_check 
CHECK (status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'partially_refunded', 'claim_open', 'refund_pending_manual', 'cancellation_requires_review'));

-- 3. Tabla de Tareas de Reembolso Manual
CREATE TABLE IF NOT EXISTS public.manual_refund_tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_provider text NOT NULL, -- 'handy', 'dlocalgo', 'mercadopago', 'paypal'
    payment_id text NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text NOT NULL DEFAULT 'UYU',
    reason text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    assigned_to uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz,
    external_reference text, -- ej: ID de reverso en dLocal/Handy
    proof_url text, -- URL del comprobante de transferencia bancaria
    note text NOT NULL, -- Explicación del reverso (obligatoria)
    completed_by uuid REFERENCES auth.users(id)
);

-- Políticas RLS para manual_refund_tasks
ALTER TABLE public.manual_refund_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on manual_refund_tasks" ON public.manual_refund_tasks
    FOR ALL
    TO authenticated
    USING (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
    WITH CHECK (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

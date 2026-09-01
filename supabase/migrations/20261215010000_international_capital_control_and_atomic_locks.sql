-- ==============================================================================
-- 20261215010000_international_capital_control_and_atomic_locks.sql
-- Control de Capital Operativo, Locks Atómicos de Compra y Seguridad RLS
-- ==============================================================================

-- 1. Nuevas columnas de configuración en international_sync_settings
ALTER TABLE public.international_sync_settings
ADD COLUMN IF NOT EXISTS international_operating_limit_usd numeric(10,2) DEFAULT 500.00,
ADD COLUMN IF NOT EXISTS international_safety_reserve_usd numeric(10,2) DEFAULT 50.00,
ADD COLUMN IF NOT EXISTS international_capacity_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS international_reservation_minutes integer DEFAULT 15,
ADD COLUMN IF NOT EXISTS low_capacity_threshold_percent numeric(5,2) DEFAULT 25.0,
ADD COLUMN IF NOT EXISTS international_purchases_enabled boolean DEFAULT true;

-- Asegurar que el registro ID 1 tenga los valores iniciales correctos
UPDATE public.international_sync_settings
SET 
  international_operating_limit_usd = COALESCE(international_operating_limit_usd, 500.00),
  international_safety_reserve_usd = COALESCE(international_safety_reserve_usd, 50.00),
  international_capacity_enabled = COALESCE(international_capacity_enabled, true),
  international_reservation_minutes = COALESCE(international_reservation_minutes, 15),
  low_capacity_threshold_percent = COALESCE(low_capacity_threshold_percent, 25.0),
  international_purchases_enabled = COALESCE(international_purchases_enabled, true)
WHERE id = 1;

-- 2. Tabla de Reservas de Capital Operativo
CREATE TABLE IF NOT EXISTS public.international_capital_reservations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    amount_usd numeric(10,2) NOT NULL CHECK (amount_usd > 0),
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'spent', 'released', 'expired', 'cancelled')),
    reserved_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    committed_at timestamptz,
    spent_at timestamptz,
    released_at timestamptz,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para búsquedas de capacidad y expiración
CREATE INDEX IF NOT EXISTS idx_intl_reservations_status_expires ON public.international_capital_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_intl_reservations_order_id ON public.international_capital_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_intl_reservations_user_id ON public.international_capital_reservations(user_id);

-- 3. Tabla de Lista de Espera de Cupos Internacionales (Waitlist)
CREATE TABLE IF NOT EXISTS public.international_capacity_waitlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    email text,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    international_product_id uuid REFERENCES public.international_products(id) ON DELETE CASCADE,
    required_capacity_usd_internal numeric(10,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'converted', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    notified_at timestamptz,
    converted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_intl_waitlist_status ON public.international_capacity_waitlist(status);
CREATE INDEX IF NOT EXISTS idx_intl_waitlist_product ON public.international_capacity_waitlist(product_id);

-- 4. Nuevas columnas de auditoría y lock en international_order_items
ALTER TABLE public.international_order_items
ADD COLUMN IF NOT EXISTS review_reason_code text,
ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.international_capital_reservations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS zinc_po_number text;

-- 5. RPC: Expirar reservas obsoletas
CREATE OR REPLACE FUNCTION public.expire_stale_international_reservations()
RETURNS integer AS $$
DECLARE
    v_count integer := 0;
BEGIN
    UPDATE public.international_capital_reservations
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'reserved'
      AND expires_at < now();
      
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Resumen y cálculo canónico de capacidad disponible
CREATE OR REPLACE FUNCTION public.get_international_capacity_summary()
RETURNS jsonb AS $$
DECLARE
    v_settings record;
    v_active_reserved numeric(10,2) := 0;
    v_committed numeric(10,2) := 0;
    v_spent numeric(10,2) := 0;
    v_available numeric(10,2) := 0;
    v_usable_limit numeric(10,2) := 0;
    v_percent_available numeric(5,2) := 0;
    v_status_label text := 'AVAILABLE';
BEGIN
    -- Expirar primero reservas viejas
    PERFORM public.expire_stale_international_reservations();

    -- Obtener settings
    SELECT 
      COALESCE(international_operating_limit_usd, 500.00) as limit_usd,
      COALESCE(international_safety_reserve_usd, 50.00) as safety_usd,
      COALESCE(international_capacity_enabled, true) as capacity_enabled,
      COALESCE(international_reservation_minutes, 15) as res_minutes,
      COALESCE(low_capacity_threshold_percent, 25.0) as low_thresh,
      COALESCE(international_purchases_enabled, true) as purchases_enabled
    INTO v_settings
    FROM public.international_sync_settings
    WHERE id = 1;

    -- Si no hay fila en settings, usar defaults
    IF NOT FOUND THEN
      v_settings.limit_usd := 500.00;
      v_settings.safety_usd := 50.00;
      v_settings.capacity_enabled := true;
      v_settings.res_minutes := 15;
      v_settings.low_thresh := 25.0;
      v_settings.purchases_enabled := true;
    END IF;

    -- Sumar reservas activas ('reserved' no expiradas)
    SELECT COALESCE(SUM(amount_usd), 0)
    INTO v_active_reserved
    FROM public.international_capital_reservations
    WHERE status = 'reserved' AND expires_at > now();

    -- Sumar compras comprometidas ('committed')
    SELECT COALESCE(SUM(amount_usd), 0)
    INTO v_committed
    FROM public.international_capital_reservations
    WHERE status = 'committed';

    -- Sumar compras ya gastadas ('spent')
    SELECT COALESCE(SUM(amount_usd), 0)
    INTO v_spent
    FROM public.international_capital_reservations
    WHERE status = 'spent';

    v_usable_limit := GREATEST(0, v_settings.limit_usd - v_settings.safety_usd);
    v_available := GREATEST(0, v_usable_limit - v_active_reserved - v_committed);

    IF v_usable_limit > 0 THEN
      v_percent_available := ROUND((v_available / v_usable_limit) * 100, 2);
    ELSE
      v_percent_available := 0;
    END IF;

    IF NOT v_settings.purchases_enabled THEN
      v_status_label := 'PAUSED';
    ELSIF v_available <= 0 THEN
      v_status_label := 'FULL';
    ELSIF v_percent_available <= v_settings.low_thresh THEN
      v_status_label := 'LOW';
    ELSE
      v_status_label := 'AVAILABLE';
    END IF;

    RETURN jsonb_build_object(
        'operating_limit_usd', v_settings.limit_usd,
        'safety_reserve_usd', v_settings.safety_usd,
        'usable_limit_usd', v_usable_limit,
        'active_reserved_usd', v_active_reserved,
        'committed_usd', v_committed,
        'spent_usd', v_spent,
        'available_capacity_usd', v_available,
        'percent_available', v_percent_available,
        'capacity_enabled', v_settings.capacity_enabled,
        'purchases_enabled', v_settings.purchases_enabled,
        'reservation_minutes', v_settings.res_minutes,
        'low_capacity_threshold_percent', v_settings.low_thresh,
        'status_label', v_status_label
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Reserva Atómica de Capacidad con Lock de Concurrencia
CREATE OR REPLACE FUNCTION public.reserve_international_capacity(
    p_amount_usd numeric,
    p_order_id uuid DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_reservation_minutes integer DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb AS $$
DECLARE
    v_settings record;
    v_active_reserved numeric(10,2) := 0;
    v_committed numeric(10,2) := 0;
    v_usable_limit numeric(10,2) := 0;
    v_available numeric(10,2) := 0;
    v_res_minutes integer;
    v_expires_at timestamptz;
    v_reservation_id uuid;
BEGIN
    IF p_amount_usd <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT', 'message', 'El monto a reservar debe ser mayor a 0');
    END IF;

    -- Bloqueo transaccional de settings para garantizar atomicidad global en reservas concurrentes
    SELECT 
      COALESCE(international_operating_limit_usd, 500.00) as limit_usd,
      COALESCE(international_safety_reserve_usd, 50.00) as safety_usd,
      COALESCE(international_capacity_enabled, true) as capacity_enabled,
      COALESCE(international_reservation_minutes, 15) as res_minutes,
      COALESCE(international_purchases_enabled, true) as purchases_enabled
    INTO v_settings
    FROM public.international_sync_settings
    WHERE id = 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'SETTINGS_NOT_FOUND', 'message', 'No se encontró la configuración internacional');
    END IF;

    IF NOT v_settings.purchases_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'PURCHASES_DISABLED', 'message', 'Las compras internacionales están temporalmente pausadas');
    END IF;

    -- Expirar reservas viejas dentro de la transacción
    PERFORM public.expire_stale_international_reservations();

    -- Si el control de capacidad está activo, verificar disponibilidad
    IF v_settings.capacity_enabled THEN
        SELECT COALESCE(SUM(amount_usd), 0)
        INTO v_active_reserved
        FROM public.international_capital_reservations
        WHERE status = 'reserved' AND expires_at > now();

        SELECT COALESCE(SUM(amount_usd), 0)
        INTO v_committed
        FROM public.international_capital_reservations
        WHERE status = 'committed';

        v_usable_limit := GREATEST(0, v_settings.limit_usd - v_settings.safety_usd);
        v_available := GREATEST(0, v_usable_limit - v_active_reserved - v_committed);

        IF v_available < p_amount_usd THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INSUFFICIENT_CAPACITY',
                'message', 'Capacidad internacional insuficiente para este monto',
                'available_capacity_usd', v_available,
                'required_amount_usd', p_amount_usd
            );
        END IF;
    END IF;

    v_res_minutes := COALESCE(p_reservation_minutes, v_settings.res_minutes, 15);
    v_expires_at := now() + (v_res_minutes || ' minutes')::interval;

    INSERT INTO public.international_capital_reservations (
        order_id,
        user_id,
        amount_usd,
        status,
        reserved_at,
        expires_at,
        metadata
    ) VALUES (
        p_order_id,
        p_user_id,
        p_amount_usd,
        'reserved',
        now(),
        v_expires_at,
        p_metadata
    ) RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'amount_usd', p_amount_usd,
        'expires_at', v_expires_at,
        'available_capacity_usd', (v_available - p_amount_usd)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: Comprometer Capacidad al aprobar el Pago
CREATE OR REPLACE FUNCTION public.commit_international_capacity(
    p_reservation_id uuid DEFAULT NULL,
    p_order_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_updated integer := 0;
BEGIN
    UPDATE public.international_capital_reservations
    SET status = 'committed',
        committed_at = now(),
        order_id = COALESCE(p_order_id, order_id),
        updated_at = now()
    WHERE (id = p_reservation_id OR (order_id = p_order_id AND p_order_id IS NOT NULL))
      AND status IN ('reserved', 'committed');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC: Marcar Capacidad como Gastada tras orden en Zinc
CREATE OR REPLACE FUNCTION public.spend_international_capacity(
    p_reservation_id uuid DEFAULT NULL,
    p_order_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_updated integer := 0;
BEGIN
    UPDATE public.international_capital_reservations
    SET status = 'spent',
        spent_at = now(),
        updated_at = now()
    WHERE (id = p_reservation_id OR (order_id = p_order_id AND p_order_id IS NOT NULL))
      AND status IN ('committed', 'reserved');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC: Liberar Capacidad (cancelación o rechazo)
CREATE OR REPLACE FUNCTION public.release_international_capacity(
    p_reservation_id uuid DEFAULT NULL,
    p_order_id uuid DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_updated integer := 0;
BEGIN
    UPDATE public.international_capital_reservations
    SET status = 'released',
        released_at = now(),
        reason = COALESCE(p_reason, reason),
        updated_at = now()
    WHERE (id = p_reservation_id OR (order_id = p_order_id AND p_order_id IS NOT NULL))
      AND status IN ('reserved', 'committed');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC: Lock Atómico para procesar compras en Zinc (Exclusión Mutua)
CREATE OR REPLACE FUNCTION public.claim_international_order_item_for_zinc(p_item_id uuid)
RETURNS boolean AS $$
DECLARE
    v_updated integer := 0;
BEGIN
    UPDATE public.international_order_items
    SET purchase_status = 'zinc_processing',
        updated_at = now()
    WHERE id = p_item_id
      AND purchase_status = 'pending_purchase';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. RPC: Reset Atómico para reintentos manuales de compras desde el Admin
CREATE OR REPLACE FUNCTION public.reset_international_order_item_for_retry(p_item_id uuid)
RETURNS boolean AS $$
DECLARE
    v_updated integer := 0;
BEGIN
    UPDATE public.international_order_items
    SET purchase_status = 'pending_purchase',
        zinc_error_message = NULL,
        review_reason_code = NULL,
        updated_at = now()
    WHERE id = p_item_id
      AND purchase_status IN ('manual_review', 'zinc_failed', 'cancelled');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Seguridad RLS en Tablas Internacionales
ALTER TABLE public.international_couriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active couriers" ON public.international_couriers;
CREATE POLICY "Public can view active couriers" ON public.international_couriers
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage couriers" ON public.international_couriers;
CREATE POLICY "Admins can manage couriers" ON public.international_couriers
    FOR ALL TO authenticated
    USING (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
    WITH CHECK (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

ALTER TABLE public.site_exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view site exchange rates" ON public.site_exchange_rates;
CREATE POLICY "Public can view site exchange rates" ON public.site_exchange_rates
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage site exchange rates" ON public.site_exchange_rates;
CREATE POLICY "Admins can manage site exchange rates" ON public.site_exchange_rates
    FOR ALL TO authenticated
    USING (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
    WITH CHECK (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

ALTER TABLE public.international_capital_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own reservations" ON public.international_capital_reservations;
CREATE POLICY "Users can view own reservations" ON public.international_capital_reservations
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all reservations" ON public.international_capital_reservations;
CREATE POLICY "Admins can manage all reservations" ON public.international_capital_reservations
    FOR ALL TO authenticated
    USING (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
    WITH CHECK (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

ALTER TABLE public.international_capacity_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert waitlist" ON public.international_capacity_waitlist;
CREATE POLICY "Public can insert waitlist" ON public.international_capacity_waitlist
    FOR INSERT TO public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own waitlist" ON public.international_capacity_waitlist;
CREATE POLICY "Users can view own waitlist" ON public.international_capacity_waitlist
    FOR SELECT TO public
    USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage waitlist" ON public.international_capacity_waitlist;
CREATE POLICY "Admins can manage waitlist" ON public.international_capacity_waitlist
    FOR ALL TO authenticated
    USING (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
    WITH CHECK (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

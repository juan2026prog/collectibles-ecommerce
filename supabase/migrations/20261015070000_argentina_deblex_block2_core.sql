-- ==============================================================================
-- MIGRATION: 20261015070000_argentina_deblex_block2_core.sql
-- Description:
--   Bloque 2A Núcleo: Infraestructura de base de datos para Collectibles Argentina + Deblex
--
-- Entidades:
--   1. deblex_tariff_config: Tarifas versionadas, flete (19 USD/kg), Logistic Packs y límites
--   2. customer_argentina_profiles: Identificación documental (CUIT/CUIL/CDI) y cupos
--   3. argentina_packages: Paquetes recibidos en Suite Central Miami vinculados a órdenes y trackings
--   4. argentina_consolidations: Agrupación atómica de paquetes con single Logistic Pack
--   5. argentina_consolidation_items: Relación paquete - consolidado
--   6. deblex_pre_alerts: Avisos previos estructurados para Deblex con CUIT
--   7. argentina_financial_ledger: Libro de movimientos financieros de logística y créditos
--   8. argentina_audit_logs: Auditoría estricta de excepciones y cambios de estado
-- ==============================================================================

BEGIN;

-- 1. Tabla: deblex_tariff_config (Tarifario versionado)
CREATE TABLE IF NOT EXISTS public.deblex_tariff_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_label text NOT NULL UNIQUE,
    international_freight_usd_per_kg numeric(8,2) NOT NULL DEFAULT 19.00,
    logistic_pack_caba_usd numeric(8,2) NOT NULL DEFAULT 20.00,
    logistic_pack_amba_usd numeric(8,2) NOT NULL DEFAULT 34.00,
    logistic_pack_interior_usd numeric(8,2) NOT NULL DEFAULT 43.00,
    max_fob_modalidad_a numeric(10,2) NOT NULL DEFAULT 400.00,
    max_weight_modalidad_a_kg numeric(8,2) NOT NULL DEFAULT 50.00,
    max_units_per_species_modalidad_a integer NOT NULL DEFAULT 3,
    max_operations_per_year_modalidad_a integer NOT NULL DEFAULT 5,
    is_active boolean NOT NULL DEFAULT true,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed initial tariff version
INSERT INTO public.deblex_tariff_config (
    version_label,
    international_freight_usd_per_kg,
    logistic_pack_caba_usd,
    logistic_pack_amba_usd,
    logistic_pack_interior_usd,
    max_fob_modalidad_a,
    max_weight_modalidad_a_kg,
    max_units_per_species_modalidad_a,
    max_operations_per_year_modalidad_a,
    is_active
) VALUES (
    'v1.0_20261015',
    19.00,
    20.00,
    34.00,
    43.00,
    400.00,
    50.00,
    3,
    5,
    true
) ON CONFLICT (version_label) DO NOTHING;

-- 2. Tabla: customer_argentina_profiles (Datos fiscales del comprador argentino)
CREATE TABLE IF NOT EXISTS public.customer_argentina_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_type text NOT NULL CHECK (document_type IN ('CUIT', 'CUIL', 'CDI', 'PASAPORTE')),
    document_number text NOT NULL,
    clean_document text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    street text NOT NULL,
    street_number text NOT NULL,
    floor_apt text,
    city text NOT NULL,
    province text NOT NULL,
    postal_code text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    zone text NOT NULL DEFAULT 'INTERIOR' CHECK (zone IN ('CABA', 'AMBA', 'INTERIOR')),
    annual_operations_count integer NOT NULL DEFAULT 0,
    cupo_verified boolean NOT NULL DEFAULT false,
    cupo_status text NOT NULL DEFAULT 'PENDIENTE_VALIDACION' CHECK (cupo_status IN ('VERIFICADO', 'PENDIENTE_VALIDACION', 'AGOTADO')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_customer_argentina_user UNIQUE (user_id),
    CONSTRAINT uq_customer_argentina_document UNIQUE (clean_document)
);

CREATE INDEX IF NOT EXISTS idx_customer_argentina_clean_doc ON public.customer_argentina_profiles (clean_document);

-- 3. Tabla: argentina_packages (Paquetes en Suite Central Miami)
CREATE TABLE IF NOT EXISTS public.argentina_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid,
    order_number text,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    recipient_document text,
    recipient_name text,
    product_title text NOT NULL,
    product_image text,
    species_category text DEFAULT 'figuras_accion',
    units integer NOT NULL DEFAULT 1,
    fob_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    estimated_weight_kg numeric(8,2) NOT NULL DEFAULT 0.50,
    confirmed_weight_kg numeric(8,2),
    logistics_paid_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    original_tracking_number text,
    carrier text DEFAULT 'Amazon Logistics',
    deblex_guide_number text,
    package_status text NOT NULL DEFAULT 'PEDIDO_CONFIRMADO' CHECK (
        package_status IN (
            'PEDIDO_CONFIRMADO', 'COMPRA_EN_PROCESO', 'COMPRADO_EN_AMAZON',
            'EN_TRANSITO_A_MIAMI', 'PENDIENTE_IDENTIFICACION', 'PENDIENTE_DOCUMENTACION',
            'RECIBIDO_EN_DEPOSITO', 'DISPONIBLE_PARA_CONSOLIDAR', 'SELECCIONADO',
            'PENDIENTE_CONFIRMACION', 'CONSOLIDACION_CERRADA', 'EN_DESPACHO',
            'EN_TRANSITO', 'EN_ADUANA', 'ENTREGADO', 'INCIDENCIA', 'RETENIDO',
            'CANCELADO', 'DEVUELTO'
        )
    ),
    is_available_for_consolidation boolean NOT NULL DEFAULT false,
    consolidation_id uuid,
    received_at_miami_at timestamptz,
    dispatched_at timestamptz,
    delivered_at timestamptz,
    evidence_urls text[],
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arg_packages_user_id ON public.argentina_packages (user_id);
CREATE INDEX IF NOT EXISTS idx_arg_packages_order_id ON public.argentina_packages (order_id);
CREATE INDEX IF NOT EXISTS idx_arg_packages_tracking ON public.argentina_packages (original_tracking_number);
CREATE INDEX IF NOT EXISTS idx_arg_packages_status ON public.argentina_packages (package_status);
CREATE INDEX IF NOT EXISTS idx_arg_packages_doc ON public.argentina_packages (recipient_document);

-- 4. Tabla: argentina_consolidations (Consolidaciones con Single Logistic Pack)
CREATE TABLE IF NOT EXISTS public.argentina_consolidations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consolidation_code text NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    recipient_document text NOT NULL,
    recipient_name text NOT NULL,
    destination_zone text NOT NULL CHECK (destination_zone IN ('CABA', 'AMBA', 'INTERIOR')),
    package_count integer NOT NULL DEFAULT 1,
    total_fob_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    total_weight_kg numeric(8,2) NOT NULL DEFAULT 0.00,
    freight_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    single_logistic_pack_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    total_calculated_logistics_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    total_previous_logistics_paid_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    net_difference_usd numeric(10,2) NOT NULL DEFAULT 0.00,
    status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED')),
    deblex_master_guide text,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    dispatched_at timestamptz,
    delivered_at timestamptz,
    tariff_version text NOT NULL DEFAULT 'v1.0_20261015',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arg_consolidations_user ON public.argentina_consolidations (user_id);
CREATE INDEX IF NOT EXISTS idx_arg_consolidations_code ON public.argentina_consolidations (consolidation_code);

-- 5. Tabla: argentina_consolidation_items
CREATE TABLE IF NOT EXISTS public.argentina_consolidation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consolidation_id uuid NOT NULL REFERENCES public.argentina_consolidations(id) ON DELETE CASCADE,
    package_id uuid NOT NULL REFERENCES public.argentina_packages(id) ON DELETE RESTRICT,
    fob_at_consolidation numeric(10,2) NOT NULL,
    weight_at_consolidation numeric(8,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_arg_consolidation_package UNIQUE (package_id)
);

-- 6. Tabla: deblex_pre_alerts (Manifiestos y Avisos previos a Deblex)
CREATE TABLE IF NOT EXISTS public.deblex_pre_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid,
    order_number text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    buyer_full_name text NOT NULL,
    buyer_document_type text NOT NULL,
    buyer_document_number text NOT NULL,
    product_description text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    fob_value_usd numeric(10,2) NOT NULL,
    estimated_weight_kg numeric(8,2) NOT NULL,
    original_tracking_number text,
    carrier text,
    status text NOT NULL DEFAULT 'PENDING_TRANSMISSION' CHECK (status IN ('PENDING_TRANSMISSION', 'TRANSMITTED_EXCEL', 'ACKNOWLEDGED', 'MATCHED_PACKAGE', 'FAILED')),
    export_batch_id text,
    transmitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Tabla: argentina_financial_ledger (Libro de movimientos logísticos y créditos)
CREATE TABLE IF NOT EXISTS public.argentina_financial_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    order_id uuid,
    consolidation_id uuid REFERENCES public.argentina_consolidations(id),
    entry_type text NOT NULL CHECK (entry_type IN ('CHARGE_CHECKOUT', 'LOGISTIC_PACK_PAID', 'CONSOLIDATION_CREDIT', 'WEIGHT_ADJUSTMENT', 'DEBLEX_COST_ACCRUAL', 'REFUND')),
    amount_usd numeric(10,2) NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    description text NOT NULL,
    balance_after_usd numeric(10,2),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arg_ledger_user ON public.argentina_financial_ledger (user_id);

-- 8. Tabla: argentina_audit_logs (Auditoría de excepciones)
CREATE TABLE IF NOT EXISTS public.argentina_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name text NOT NULL,
    entity_id uuid NOT NULL,
    action text NOT NULL,
    performed_by uuid REFERENCES auth.users(id),
    previous_state jsonb,
    new_state jsonb,
    justification text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Habilitar RLS en todas las tablas nuevas
ALTER TABLE public.deblex_tariff_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_argentina_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argentina_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argentina_consolidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argentina_consolidation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deblex_pre_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argentina_financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argentina_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- deblex_tariff_config: lectura para autenticados/públicos, edición solo admins
CREATE POLICY "Tariff config readable by all" ON public.deblex_tariff_config FOR SELECT USING (true);
CREATE POLICY "Tariff config managed by admin" ON public.deblex_tariff_config FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- customer_argentina_profiles: usuario ve/edita el suyo, admin ve todo
CREATE POLICY "Users access own ar profile" ON public.customer_argentina_profiles FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all ar profiles" ON public.customer_argentina_profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- argentina_packages: usuario ve sus paquetes, admin y deblex ven todos
CREATE POLICY "Users view own packages" ON public.argentina_packages FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all packages" ON public.argentina_packages FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) OR
  EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE user_id = auth.uid() AND is_active = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) OR
  EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE user_id = auth.uid() AND is_active = true)
);

-- argentina_consolidations: usuario ve las suyas y puede crear si es el dueño
CREATE POLICY "Users view own consolidations" ON public.argentina_consolidations FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Users create own consolidations" ON public.argentina_consolidations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all consolidations" ON public.argentina_consolidations FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) OR
  EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE user_id = auth.uid() AND is_active = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) OR
  EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE user_id = auth.uid() AND is_active = true)
);

-- argentina_consolidation_items: visible por dueño del paquete o admin
CREATE POLICY "Users view consolidation items" ON public.argentina_consolidation_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.argentina_consolidations c WHERE c.id = consolidation_id AND c.user_id = auth.uid()));
CREATE POLICY "Admins manage consolidation items" ON public.argentina_consolidation_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- deblex_pre_alerts: solo admins y operadores de Deblex
CREATE POLICY "Admins manage pre alerts" ON public.deblex_pre_alerts FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) OR
  EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE user_id = auth.uid() AND is_active = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) OR
  EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE user_id = auth.uid() AND is_active = true)
);

-- argentina_financial_ledger: usuario ve sus transacciones, admins ven todo
CREATE POLICY "Users view own ledger" ON public.argentina_financial_ledger FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Admins manage ledger" ON public.argentina_financial_ledger FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- argentina_audit_logs: solo admins
CREATE POLICY "Admins view audit logs" ON public.argentina_audit_logs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 10. RPC Atómica: close_consolidation_atomic
CREATE OR REPLACE FUNCTION public.close_consolidation_atomic(
    p_package_ids uuid[],
    p_destination_zone text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_pkg record;
    v_pkg_count integer := 0;
    v_total_fob numeric(10,2) := 0;
    v_total_weight numeric(8,2) := 0;
    v_prev_logistics numeric(10,2) := 0;
    v_freight numeric(10,2) := 0;
    v_logistic_pack numeric(10,2) := 0;
    v_total_calc numeric(10,2) := 0;
    v_net_diff numeric(10,2) := 0;
    v_tariff record;
    v_consolidation_id uuid;
    v_consolidation_code text;
    v_user_doc text;
    v_user_name text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- Validar tarifario activo
    SELECT * INTO v_tariff FROM public.deblex_tariff_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    IF v_tariff IS NULL THEN
        RAISE EXCEPTION 'No hay tarifario de Deblex activo configurado';
    END IF;

    -- Validar perfil del comprador
    SELECT clean_document, first_name || ' ' || last_name INTO v_user_doc, v_user_name
    FROM public.customer_argentina_profiles WHERE user_id = v_user_id;

    IF v_user_doc IS NULL THEN
        v_user_doc := 'PENDIENTE_DOCUMENTO';
        v_user_name := 'Comprador Argentina';
    END IF;

    -- Bloquear y verificar paquetes concurrentemente
    FOR v_pkg IN 
        SELECT id, user_id, fob_usd, confirmed_weight_kg, estimated_weight_kg, logistics_paid_usd, package_status, is_available_for_consolidation
        FROM public.argentina_packages
        WHERE id = ANY(p_package_ids)
        FOR UPDATE
    LOOP
        IF v_pkg.user_id != v_user_id THEN
            RAISE EXCEPTION 'Acceso denegado: El paquete % no pertenece al usuario autenticado', v_pkg.id;
        END IF;

        IF v_pkg.package_status != 'DISPONIBLE_PARA_CONSOLIDAR' AND v_pkg.package_status != 'RECIBIDO_EN_DEPOSITO' THEN
            RAISE EXCEPTION 'El paquete % no se encuentra en estado disponible para consolidar (Estado: %)', v_pkg.id, v_pkg.package_status;
        END IF;

        v_pkg_count := v_pkg_count + 1;
        v_total_fob := v_total_fob + v_pkg.fob_usd;
        v_total_weight := v_total_weight + COALESCE(v_pkg.confirmed_weight_kg, v_pkg.estimated_weight_kg, 0.50);
        v_prev_logistics := v_prev_logistics + v_pkg.logistics_paid_usd;
    END LOOP;

    IF v_pkg_count = 0 THEN
        RAISE EXCEPTION 'Debe seleccionar al menos un paquete elegible para consolidar';
    END IF;

    -- Validación estricta de Modalidad A
    IF v_total_fob > v_tariff.max_fob_modalidad_a THEN
        RAISE EXCEPTION 'Límite superado: El valor FOB consolidado (USD %) supera el máximo permitido de USD %', v_total_fob, v_tariff.max_fob_modalidad_a;
    END IF;

    IF v_total_weight > v_tariff.max_weight_modalidad_a_kg THEN
        RAISE EXCEPTION 'Límite operativo superado: El peso consolidado (% kg) supera el límite de % kg', v_total_weight, v_tariff.max_weight_modalidad_a_kg;
    END IF;

    -- Determinar Logistic Pack único según zona
    IF p_destination_zone = 'CABA' THEN
        v_logistic_pack := v_tariff.logistic_pack_caba_usd;
    ELSIF p_destination_zone = 'AMBA' THEN
        v_logistic_pack := v_tariff.logistic_pack_amba_usd;
    ELSE
        v_logistic_pack := v_tariff.logistic_pack_interior_usd;
    END IF;

    v_freight := ROUND(v_total_weight * v_tariff.international_freight_usd_per_kg, 2);
    v_total_calc := ROUND(v_freight + v_logistic_pack, 2);
    v_net_diff := ROUND(v_total_calc - v_prev_logistics, 2);

    -- Generar código de consolidación seguro
    v_consolidation_code := 'CS-AR-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 6);

    -- Insertar consolidación
    INSERT INTO public.argentina_consolidations (
        consolidation_code,
        user_id,
        recipient_document,
        recipient_name,
        destination_zone,
        package_count,
        total_fob_usd,
        total_weight_kg,
        freight_usd,
        single_logistic_pack_usd,
        total_calculated_logistics_usd,
        total_previous_logistics_paid_usd,
        net_difference_usd,
        status,
        tariff_version,
        metadata
    ) VALUES (
        v_consolidation_code,
        v_user_id,
        v_user_doc,
        v_user_name,
        p_destination_zone,
        v_pkg_count,
        v_total_fob,
        v_total_weight,
        v_freight,
        v_logistic_pack,
        v_total_calc,
        v_prev_logistics,
        v_net_diff,
        'CONFIRMED',
        v_tariff.version_label,
        p_metadata
    ) RETURNING id INTO v_consolidation_id;

    -- Vincular cada paquete e insertar en consolidation_items
    FOR v_pkg IN 
        SELECT id, fob_usd, COALESCE(confirmed_weight_kg, estimated_weight_kg, 0.50) as weight
        FROM public.argentina_packages
        WHERE id = ANY(p_package_ids)
    LOOP
        INSERT INTO public.argentina_consolidation_items (
            consolidation_id,
            package_id,
            fob_at_consolidation,
            weight_at_consolidation
        ) VALUES (
            v_consolidation_id,
            v_pkg.id,
            v_pkg.fob_usd,
            v_pkg.weight
        );

        UPDATE public.argentina_packages
        SET 
            package_status = 'CONSOLIDACION_CERRADA',
            is_available_for_consolidation = false,
            consolidation_id = v_consolidation_id,
            updated_at = now()
        WHERE id = v_pkg.id;
    END LOOP;

    -- Registrar movimiento contable si hay diferencia o crédito
    INSERT INTO public.argentina_financial_ledger (
        user_id,
        consolidation_id,
        entry_type,
        amount_usd,
        description
    ) VALUES (
        v_user_id,
        v_consolidation_id,
        CASE WHEN v_net_diff < 0 THEN 'CONSOLIDATION_CREDIT' ELSE 'WEIGHT_ADJUSTMENT' END,
        ABS(v_net_diff),
        'Consolidación ' || v_consolidation_code || ' (Single Logistic Pack aplicado)'
    );

    RETURN jsonb_build_object(
        'success', true,
        'consolidation_id', v_consolidation_id,
        'consolidation_code', v_consolidation_code,
        'package_count', v_pkg_count,
        'total_fob_usd', v_total_fob,
        'total_weight_kg', v_total_weight,
        'freight_usd', v_freight,
        'single_logistic_pack_usd', v_logistic_pack,
        'total_calculated_logistics_usd', v_total_calc,
        'total_previous_logistics_paid_usd', v_prev_logistics,
        'net_difference_usd', v_net_diff
    );
END;
$$;

COMMIT;

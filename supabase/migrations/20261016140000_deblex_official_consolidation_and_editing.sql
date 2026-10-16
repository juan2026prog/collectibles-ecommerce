-- Migration: 20261016140000_deblex_official_consolidation_and_editing.sql
-- Description:
-- 1. Secuencia transaccional y generador para código oficial de consolidación CS[0-9]{9}AR
-- 2. Migración controlada de consolidaciones existentes con formato anterior conservando historial
-- 3. Tabla de versiones/auditoría argentina_consolidation_history
-- 4. Extensión de estados en argentina_consolidations ('REOPENED')
-- 5. RPCs transaccionales seguras para Deblex (Admin / Operador):
--    - deblex_edit_consolidation: agregar/quitar paquetes, corregir pesos y recalcular tarifas
--    - deblex_undo_consolidation: deshacer consolidación con motivo obligatorio y asientos compensatorios
--    - deblex_redo_consolidation: rehacer consolidación con nueva composición y recálculo
--    - deblex_dispatch_consolidation: registrar despacho ('DISPATCHED' / 'EN_TRANSITO'), fecha persistida y asiento único de facturación sin duplicación

-- 1. Secuencia transaccional para el código CS#########AR
CREATE SEQUENCE IF NOT EXISTS public.argentina_consolidation_code_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Función para generar el código oficial con formato ^CS[0-9]{9}AR$
CREATE OR REPLACE FUNCTION public.generate_deblex_consolidation_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq BIGINT;
  v_code TEXT;
BEGIN
  v_seq := nextval('public.argentina_consolidation_code_seq');
  v_code := 'CS' || LPAD(v_seq::TEXT, 9, '0') || 'AR';
  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_deblex_consolidation_code() TO authenticated, service_role;

-- 2. Actualizar la restricción de estados en argentina_consolidations para admitir REOPENED
ALTER TABLE public.argentina_consolidations DROP CONSTRAINT IF EXISTS argentina_consolidations_status_check;
ALTER TABLE public.argentina_consolidations ADD CONSTRAINT argentina_consolidations_status_check
  CHECK (status IN ('DRAFT', 'CONFIRMED', 'REOPENED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'));

-- Agregar columna para referencia de código anterior (migración y trazabilidad) y versión
ALTER TABLE public.argentina_consolidations
  ADD COLUMN IF NOT EXISTS legacy_consolidation_code TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 3. Tabla de historial de modificaciones y auditoría de consolidaciones
CREATE TABLE IF NOT EXISTS public.argentina_consolidation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_id UUID NOT NULL REFERENCES public.argentina_consolidations(id) ON DELETE CASCADE,
  consolidation_code TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'EDITED', 'PACKAGE_ADDED', 'PACKAGE_REMOVED', 'WEIGHT_CORRECTED', 'UNDONE', 'REOPENED', 'REDONE', 'DISPATCHED', 'DELIVERED', 'RECTIFIED')),
  performed_by UUID REFERENCES auth.users(id),
  performer_email TEXT,
  reason TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  financial_delta_usd NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arg_cons_hist_cid ON public.argentina_consolidation_history (consolidation_id);
CREATE INDEX IF NOT EXISTS idx_arg_cons_hist_code ON public.argentina_consolidation_history (consolidation_code);

ALTER TABLE public.argentina_consolidation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deblex staff can view history" ON public.argentina_consolidation_history;
CREATE POLICY "Deblex staff can view history" ON public.argentina_consolidation_history
  FOR SELECT TO authenticated
  USING (
    public.is_deblex_user(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.argentina_consolidations c WHERE c.id = consolidation_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Deblex staff can insert history" ON public.argentina_consolidation_history;
CREATE POLICY "Deblex staff can insert history" ON public.argentina_consolidation_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_deblex_user(auth.uid()));

-- 4. Migración de datos existentes a formato CS[0-9]{9}AR
DO $$
DECLARE
  v_rec RECORD;
  v_new_code TEXT;
BEGIN
  FOR v_rec IN 
    SELECT id, consolidation_code, created_at, status 
    FROM public.argentina_consolidations 
    WHERE consolidation_code !~ '^CS[0-9]{9}AR$'
    ORDER BY created_at ASC
  LOOP
    v_new_code := public.generate_deblex_consolidation_code();
    
    UPDATE public.argentina_consolidations
    SET 
      legacy_consolidation_code = consolidation_code,
      consolidation_code = v_new_code,
      updated_at = now()
    WHERE id = v_rec.id;

    -- Registrar en historial la migración de formato
    INSERT INTO public.argentina_consolidation_history (
      consolidation_id,
      consolidation_code,
      action,
      reason,
      version_number,
      snapshot_data,
      created_at
    ) VALUES (
      v_rec.id,
      v_new_code,
      'EDITED',
      'Migración de código anterior ' || v_rec.consolidation_code || ' a formato oficial CS[0-9]{9}AR',
      1,
      jsonb_build_object('legacy_code', v_rec.consolidation_code, 'migrated_at', now()),
      now()
    );
  END LOOP;
END $$;

-- Asegurar validación regex para nuevos códigos en argentina_consolidations
ALTER TABLE public.argentina_consolidations DROP CONSTRAINT IF EXISTS chk_arg_consolidation_code_format;
ALTER TABLE public.argentina_consolidations ADD CONSTRAINT chk_arg_consolidation_code_format
  CHECK (consolidation_code ~ '^CS[0-9]{9}AR$');

-- 5. Modificar close_consolidation_atomic para usar generate_deblex_consolidation_code()
CREATE OR REPLACE FUNCTION public.close_consolidation_atomic(
    p_package_ids uuid[],
    p_destination_zone text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    v_requested_count integer;
    v_distinct_count integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_package_ids IS NULL OR array_length(p_package_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Debe seleccionar paquetes';
    END IF;
    SELECT COUNT(*), COUNT(DISTINCT x) INTO v_requested_count, v_distinct_count FROM unnest(p_package_ids) AS x;
    IF v_requested_count <> v_distinct_count OR array_position(p_package_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Paquetes duplicados o invalidos';
    END IF;
    IF p_destination_zone IS NULL OR p_destination_zone NOT IN ('CABA','AMBA','INTERIOR') THEN
        RAISE EXCEPTION 'Zona de destino invalida';
    END IF;

    -- Validar tarifario activo
    SELECT * INTO v_tariff FROM public.deblex_tariff_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    IF v_tariff IS NULL THEN
        RAISE EXCEPTION 'No hay tarifario de Deblex activo configurado';
    END IF;

    -- Validar perfil del comprador
    SELECT clean_document, first_name || ' ' || last_name INTO v_user_doc, v_user_name
    FROM public.customer_argentina_profiles WHERE user_id = v_user_id;

    IF NULLIF(BTRIM(v_user_doc),'') IS NULL THEN
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

    IF v_pkg_count <> v_requested_count THEN
        RAISE EXCEPTION 'Uno o mas paquetes no existen o no son elegibles';
    END IF;

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

    -- Generar código oficial de consolidación CS#########AR
    v_consolidation_code := public.generate_deblex_consolidation_code();

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
        version,
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
        1,
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
            consolidation_id = v_consolidation_id,
            package_status = 'CONSOLIDACION_CERRADA',
            is_available_for_consolidation = false,
            updated_at = now()
        WHERE id = v_pkg.id;
    END LOOP;

    -- Registrar en historial de la consolidación
    INSERT INTO public.argentina_consolidation_history (
        consolidation_id,
        consolidation_code,
        action,
        performed_by,
        reason,
        version_number,
        snapshot_data,
        financial_delta_usd
    ) VALUES (
        v_consolidation_id,
        v_consolidation_code,
        'CREATED',
        v_user_id,
        'Consolidación solicitada y confirmada por comprador',
        1,
        jsonb_build_object(
          'package_count', v_pkg_count,
          'total_fob_usd', v_total_fob,
          'total_weight_kg', v_total_weight,
          'freight_usd', v_freight,
          'single_logistic_pack_usd', v_logistic_pack,
          'total_calculated_logistics_usd', v_total_calc,
          'net_difference_usd', v_net_diff
        ),
        v_net_diff
    );

    -- Registrar movimiento en el libro financiero si hay diferencia
    IF v_net_diff <> 0 THEN
        INSERT INTO public.argentina_financial_ledger (
            user_id,
            consolidation_id,
            entry_type,
            amount_usd,
            description,
            created_by
        ) VALUES (
            v_user_id,
            v_consolidation_id,
            'CONSOLIDATION_CREDIT',
            v_net_diff,
            'Ajuste por consolidación de ' || v_pkg_count || ' paquetes (' || v_consolidation_code || ')',
            v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'consolidation_id', v_consolidation_id,
        'consolidation_code', v_consolidation_code,
        'total_fob_usd', v_total_fob,
        'total_weight_kg', v_total_weight,
        'freight_usd', v_freight,
        'single_logistic_pack_usd', v_logistic_pack,
        'total_calculated_logistics_usd', v_total_calc,
        'net_difference_usd', v_net_diff
    );
END;
$function$;

-- 6. RPC: deblex_edit_consolidation
-- Permite a Operador y Admin Deblex agregar/quitar paquetes, ajustar pesos y recalcular tarifas
CREATE OR REPLACE FUNCTION public.deblex_edit_consolidation(
    p_consolidation_id UUID,
    p_package_ids UUID[],
    p_package_weights JSONB DEFAULT '{}'::jsonb, -- map de package_id -> weight_kg
    p_destination_zone TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT 'Ajuste operativo de consolidación en Miami'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN;
    v_is_operator BOOLEAN;
    v_cons RECORD;
    v_tariff RECORD;
    v_target_zone TEXT;
    v_pkg RECORD;
    v_pkg_count INTEGER := 0;
    v_total_fob NUMERIC(10,2) := 0;
    v_total_weight NUMERIC(8,2) := 0;
    v_prev_logistics NUMERIC(10,2) := 0;
    v_freight NUMERIC(10,2) := 0;
    v_logistic_pack NUMERIC(10,2) := 0;
    v_total_calc NUMERIC(10,2) := 0;
    v_net_diff NUMERIC(10,2) := 0;
    v_financial_delta NUMERIC(10,2) := 0;
    v_new_version INTEGER;
    v_custom_weight NUMERIC(8,2);
    v_removed_pkg_ids UUID[];
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo del cambio es obligatorio';
    END IF;

    -- Bloquear consolidación para actualización concurrente
    SELECT * INTO v_cons 
    FROM public.argentina_consolidations 
    WHERE id = p_consolidation_id 
    FOR UPDATE;

    IF v_cons IS NULL THEN
        RAISE EXCEPTION 'Consolidación % no encontrada', p_consolidation_id;
    END IF;

    -- Regla de negocio: Si ya fue despachada o entregada, no se permite reorganización estándar de paquetes
    IF v_cons.status IN ('DISPATCHED', 'DELIVERED') THEN
        RAISE EXCEPTION 'No se puede modificar la composición de un consolidado despachado o entregado (Estado: %)', v_cons.status;
    END IF;

    -- Tarifario activo
    SELECT * INTO v_tariff FROM public.deblex_tariff_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    IF v_tariff IS NULL THEN
        RAISE EXCEPTION 'No hay tarifario de Deblex activo';
    END IF;

    v_target_zone := COALESCE(p_destination_zone, v_cons.destination_zone);
    IF v_target_zone NOT IN ('CABA', 'AMBA', 'INTERIOR') THEN
        RAISE EXCEPTION 'Zona inválida %', v_target_zone;
    END IF;

    -- Determinar paquetes removidos
    SELECT array_agg(package_id) INTO v_removed_pkg_ids
    FROM public.argentina_consolidation_items
    WHERE consolidation_id = p_consolidation_id
      AND package_id != ALL(p_package_ids);

    -- Liberar paquetes removidos
    IF v_removed_pkg_ids IS NOT NULL AND array_length(v_removed_pkg_ids, 1) > 0 THEN
      UPDATE public.argentina_packages
      SET 
        consolidation_id = NULL,
        package_status = 'RECIBIDO_EN_DEPOSITO',
        is_available_for_consolidation = true,
        updated_at = now()
      WHERE id = ANY(v_removed_pkg_ids);

      DELETE FROM public.argentina_consolidation_items
      WHERE consolidation_id = p_consolidation_id
        AND package_id = ANY(v_removed_pkg_ids);
    END IF;

    -- Actualizar pesos y verificar paquetes incluidos
    FOR v_pkg IN
        SELECT id, user_id, fob_usd, confirmed_weight_kg, estimated_weight_kg, logistics_paid_usd, package_status, consolidation_id
        FROM public.argentina_packages
        WHERE id = ANY(p_package_ids)
        FOR UPDATE
    LOOP
        -- Validar mismo comprador
        IF v_pkg.user_id != v_cons.user_id THEN
            RAISE EXCEPTION 'El paquete % pertenece a otro comprador', v_pkg.id;
        END IF;

        -- Si no pertenecía a este consolidado, debe estar disponible
        IF v_pkg.consolidation_id IS DISTINCT FROM p_consolidation_id THEN
            IF v_pkg.consolidation_id IS NOT NULL THEN
                RAISE EXCEPTION 'El paquete % ya pertenece a otra consolidación', v_pkg.id;
            END IF;
            IF v_pkg.package_status NOT IN ('RECIBIDO_EN_DEPOSITO', 'DISPONIBLE_PARA_CONSOLIDAR') THEN
                RAISE EXCEPTION 'El paquete % no está disponible en Miami', v_pkg.id;
            END IF;
        END IF;

        -- Peso ajustado si vino en p_package_weights
        IF p_package_weights ? v_pkg.id::text THEN
            v_custom_weight := (p_package_weights->>v_pkg.id::text)::numeric;
            IF v_custom_weight > 0 THEN
                UPDATE public.argentina_packages
                SET confirmed_weight_kg = v_custom_weight, updated_at = now()
                WHERE id = v_pkg.id;
                v_pkg.confirmed_weight_kg := v_custom_weight;
            END IF;
        END IF;

        v_pkg_count := v_pkg_count + 1;
        v_total_fob := v_total_fob + v_pkg.fob_usd;
        v_total_weight := v_total_weight + COALESCE(v_pkg.confirmed_weight_kg, v_pkg.estimated_weight_kg, 0.50);
        v_prev_logistics := v_prev_logistics + v_pkg.logistics_paid_usd;
    END LOOP;

    IF v_pkg_count = 0 THEN
        RAISE EXCEPTION 'La consolidación debe contener al menos 1 paquete';
    END IF;

    -- Validaciones de Modalidad A
    IF v_total_fob > v_tariff.max_fob_modalidad_a THEN
        RAISE EXCEPTION 'FOB total USD % supera el límite de USD %', v_total_fob, v_tariff.max_fob_modalidad_a;
    END IF;
    IF v_total_weight > v_tariff.max_weight_modalidad_a_kg THEN
        RAISE EXCEPTION 'Peso total % kg supera el límite de % kg', v_total_weight, v_tariff.max_weight_modalidad_a_kg;
    END IF;

    -- Tarifa
    IF v_target_zone = 'CABA' THEN
        v_logistic_pack := v_tariff.logistic_pack_caba_usd;
    ELSIF v_target_zone = 'AMBA' THEN
        v_logistic_pack := v_tariff.logistic_pack_amba_usd;
    ELSE
        v_logistic_pack := v_tariff.logistic_pack_interior_usd;
    END IF;

    v_freight := ROUND(v_total_weight * v_tariff.international_freight_usd_per_kg, 2);
    v_total_calc := ROUND(v_freight + v_logistic_pack, 2);
    v_net_diff := ROUND(v_total_calc - v_prev_logistics, 2);

    v_financial_delta := ROUND(v_total_calc - v_cons.total_calculated_logistics_usd, 2);
    v_new_version := COALESCE(v_cons.version, 1) + 1;

    -- Actualizar consolidación
    UPDATE public.argentina_consolidations
    SET 
        package_count = v_pkg_count,
        total_fob_usd = v_total_fob,
        total_weight_kg = v_total_weight,
        freight_usd = v_freight,
        single_logistic_pack_usd = v_logistic_pack,
        total_calculated_logistics_usd = v_total_calc,
        total_previous_logistics_paid_usd = v_prev_logistics,
        net_difference_usd = v_net_diff,
        destination_zone = v_target_zone,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_consolidation_id;

    -- Sincronizar items
    FOR v_pkg IN 
        SELECT id, fob_usd, COALESCE(confirmed_weight_kg, estimated_weight_kg, 0.50) AS weight
        FROM public.argentina_packages
        WHERE id = ANY(p_package_ids)
    LOOP
        INSERT INTO public.argentina_consolidation_items (
            consolidation_id,
            package_id,
            fob_at_consolidation,
            weight_at_consolidation
        ) VALUES (
            p_consolidation_id,
            v_pkg.id,
            v_pkg.fob_usd,
            v_pkg.weight
        ) ON CONFLICT (package_id) DO UPDATE
        SET 
            consolidation_id = p_consolidation_id,
            fob_at_consolidation = EXCLUDED.fob_at_consolidation,
            weight_at_consolidation = EXCLUDED.weight_at_consolidation;

        UPDATE public.argentina_packages
        SET 
            consolidation_id = p_consolidation_id,
            package_status = 'CONSOLIDACION_CERRADA',
            is_available_for_consolidation = false,
            updated_at = now()
        WHERE id = v_pkg.id;
    END LOOP;

    -- Asiento de ajuste financiero si cambió el total calculado
    IF v_financial_delta <> 0 THEN
        INSERT INTO public.argentina_financial_ledger (
            user_id,
            consolidation_id,
            entry_type,
            amount_usd,
            description,
            created_by
        ) VALUES (
            v_cons.user_id,
            p_consolidation_id,
            'WEIGHT_ADJUSTMENT',
            v_financial_delta,
            'Ajuste logístico por edición de ' || v_cons.consolidation_code || ' (v' || v_new_version || '): ' || p_reason,
            v_caller_id
        );
    END IF;

    -- Historial
    INSERT INTO public.argentina_consolidation_history (
        consolidation_id,
        consolidation_code,
        action,
        performed_by,
        performer_email,
        reason,
        version_number,
        snapshot_data,
        financial_delta_usd
    ) VALUES (
        p_consolidation_id,
        v_cons.consolidation_code,
        'EDITED',
        v_caller_id,
        (SELECT email FROM auth.users WHERE id = v_caller_id),
        p_reason,
        v_new_version,
        jsonb_build_object(
            'package_count', v_pkg_count,
            'total_fob_usd', v_total_fob,
            'total_weight_kg', v_total_weight,
            'freight_usd', v_freight,
            'single_logistic_pack_usd', v_logistic_pack,
            'total_calculated_logistics_usd', v_total_calc,
            'financial_delta_usd', v_financial_delta
        ),
        v_financial_delta
    );

    RETURN jsonb_build_object(
        'success', true,
        'consolidation_id', p_consolidation_id,
        'consolidation_code', v_cons.consolidation_code,
        'version', v_new_version,
        'package_count', v_pkg_count,
        'total_fob_usd', v_total_fob,
        'total_weight_kg', v_total_weight,
        'total_calculated_logistics_usd', v_total_calc,
        'net_difference_usd', v_net_diff,
        'financial_delta_usd', v_financial_delta
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_edit_consolidation(UUID, UUID[], JSONB, TEXT, TEXT) TO authenticated, service_role;

-- 7. RPC: deblex_undo_consolidation
-- Deshace una consolidación, liberando paquetes y revirtiendo cargos/créditos de forma inmutable
CREATE OR REPLACE FUNCTION public.deblex_undo_consolidation(
    p_consolidation_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_cons RECORD;
    v_pkg_ids UUID[];
    v_reversal_amount NUMERIC(10,2);
    v_new_version INTEGER;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo para deshacer el consolidado es obligatorio';
    END IF;

    SELECT * INTO v_cons 
    FROM public.argentina_consolidations 
    WHERE id = p_consolidation_id 
    FOR UPDATE;

    IF v_cons IS NULL THEN
        RAISE EXCEPTION 'Consolidación no encontrada';
    END IF;

    IF v_cons.status IN ('DISPATCHED', 'DELIVERED') THEN
        RAISE EXCEPTION 'No se puede deshacer una consolidación que ya fue despachada o entregada';
    END IF;

    IF v_cons.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'La consolidación ya se encuentra anulada';
    END IF;

    -- Obtener paquetes asociados
    SELECT array_agg(package_id) INTO v_pkg_ids
    FROM public.argentina_consolidation_items
    WHERE consolidation_id = p_consolidation_id;

    -- Liberar paquetes
    IF v_pkg_ids IS NOT NULL AND array_length(v_pkg_ids, 1) > 0 THEN
        UPDATE public.argentina_packages
        SET 
            consolidation_id = NULL,
            package_status = 'RECIBIDO_EN_DEPOSITO',
            is_available_for_consolidation = true,
            updated_at = now()
        WHERE id = ANY(v_pkg_ids);
    END IF;

    v_new_version := COALESCE(v_cons.version, 1) + 1;

    -- Actualizar estado a CANCELLED (sin borrar físicamente)
    UPDATE public.argentina_consolidations
    SET 
        status = 'CANCELLED',
        version = v_new_version,
        updated_at = now()
    WHERE id = p_consolidation_id;

    -- Asiento compensatorio en el ledger si se había acreditado o debitado diferencia
    IF v_cons.net_difference_usd <> 0 THEN
        v_reversal_amount := -1 * v_cons.net_difference_usd;
        INSERT INTO public.argentina_financial_ledger (
            user_id,
            consolidation_id,
            entry_type,
            amount_usd,
            description,
            created_by
        ) VALUES (
            v_cons.user_id,
            p_consolidation_id,
            'WEIGHT_ADJUSTMENT',
            v_reversal_amount,
            'Reversión compensatoria por anulación de consolidado ' || v_cons.consolidation_code || ': ' || p_reason,
            v_caller_id
        );
    END IF;

    -- Registrar en historial
    INSERT INTO public.argentina_consolidation_history (
        consolidation_id,
        consolidation_code,
        action,
        performed_by,
        performer_email,
        reason,
        version_number,
        snapshot_data,
        financial_delta_usd
    ) VALUES (
        p_consolidation_id,
        v_cons.consolidation_code,
        'UNDONE',
        v_caller_id,
        (SELECT email FROM auth.users WHERE id = v_caller_id),
        p_reason,
        v_new_version,
        jsonb_build_object(
            'released_packages', v_pkg_ids,
            'previous_status', v_cons.status,
            'reversal_amount_usd', v_reversal_amount
        ),
        COALESCE(v_reversal_amount, 0.00)
    );

    RETURN jsonb_build_object(
        'success', true,
        'consolidation_id', p_consolidation_id,
        'consolidation_code', v_cons.consolidation_code,
        'status', 'CANCELLED',
        'released_packages_count', COALESCE(array_length(v_pkg_ids, 1), 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_undo_consolidation(UUID, TEXT) TO authenticated, service_role;

-- 8. RPC: deblex_redo_consolidation
-- Permite reactivar o rehacer una consolidación previamente cancelada o abierta
CREATE OR REPLACE FUNCTION public.deblex_redo_consolidation(
    p_consolidation_id UUID,
    p_package_ids UUID[],
    p_destination_zone TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT 'Reconstrucción de consolidado'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_cons RECORD;
    v_new_version INTEGER;
    v_edit_res JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    SELECT * INTO v_cons 
    FROM public.argentina_consolidations 
    WHERE id = p_consolidation_id 
    FOR UPDATE;

    IF v_cons IS NULL THEN
        RAISE EXCEPTION 'Consolidación no encontrada';
    END IF;

    -- Cambiar estado de vuelta a CONFIRMED
    UPDATE public.argentina_consolidations
    SET 
        status = 'CONFIRMED',
        updated_at = now()
    WHERE id = p_consolidation_id;

    -- Invocar deblex_edit_consolidation para vincular los paquetes y recalcular todo
    v_edit_res := public.deblex_edit_consolidation(
        p_consolidation_id,
        p_package_ids,
        '{}'::jsonb,
        COALESCE(p_destination_zone, v_cons.destination_zone),
        'Rehacer consolidado: ' || p_reason
    );

    -- Registrar acción REDONE en historial
    INSERT INTO public.argentina_consolidation_history (
        consolidation_id,
        consolidation_code,
        action,
        performed_by,
        performer_email,
        reason,
        version_number,
        snapshot_data
    ) VALUES (
        p_consolidation_id,
        v_cons.consolidation_code,
        'REDONE',
        v_caller_id,
        (SELECT email FROM auth.users WHERE id = v_caller_id),
        p_reason,
        (v_edit_res->>'version')::int,
        v_edit_res
    );

    RETURN jsonb_build_object(
        'success', true,
        'consolidation_id', p_consolidation_id,
        'consolidation_code', v_cons.consolidation_code,
        'status', 'CONFIRMED',
        'details', v_edit_res
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_redo_consolidation(UUID, UUID[], TEXT, TEXT) TO authenticated, service_role;

-- 9. RPC: deblex_set_shipment_status (Despacho / Tránsito / Facturación única sin duplicación)
CREATE OR REPLACE FUNCTION public.deblex_set_shipment_status(
    p_id UUID,
    p_is_consolidation BOOLEAN,
    p_new_status TEXT,
    p_deblex_guide TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT 'Actualización de estado operativo Deblex'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_now TIMESTAMPTZ := now();
    v_cons RECORD;
    v_pkg RECORD;
    v_existing_ledger_charge BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    IF p_is_consolidation THEN
        SELECT * INTO v_cons 
        FROM public.argentina_consolidations 
        WHERE id = p_id 
        FOR UPDATE;

        IF v_cons IS NULL THEN
            RAISE EXCEPTION 'Consolidación no encontrada';
        END IF;

        -- Actualizar estado de la consolidación
        UPDATE public.argentina_consolidations
        SET 
            status = p_new_status,
            deblex_master_guide = COALESCE(p_deblex_guide, deblex_master_guide),
            dispatched_at = CASE WHEN p_new_status IN ('DISPATCHED', 'EN_TRANSITO') AND dispatched_at IS NULL THEN v_now ELSE dispatched_at END,
            delivered_at = CASE WHEN p_new_status IN ('DELIVERED', 'ENTREGADO') AND delivered_at IS NULL THEN v_now ELSE delivered_at END,
            updated_at = v_now
        WHERE id = p_id;

        -- Actualizar paquetes hijos
        UPDATE public.argentina_packages
        SET 
            package_status = CASE 
                WHEN p_new_status IN ('DISPATCHED', 'EN_TRANSITO') THEN 'EN_TRANSITO'
                WHEN p_new_status IN ('DELIVERED', 'ENTREGADO') THEN 'ENTREGADO'
                ELSE package_status 
            END,
            dispatched_at = CASE WHEN p_new_status IN ('DISPATCHED', 'EN_TRANSITO') AND dispatched_at IS NULL THEN v_now ELSE dispatched_at END,
            delivered_at = CASE WHEN p_new_status IN ('DELIVERED', 'ENTREGADO') AND delivered_at IS NULL THEN v_now ELSE delivered_at END,
            updated_at = v_now
        WHERE consolidation_id = p_id;

        -- Momento de facturación: Se genera cargo de costo Deblex cuando pasa a despacho/tránsito,
        -- asegurando con idempotencia estricta que NUNCA se duplique por múltiples guardados
        IF p_new_status IN ('DISPATCHED', 'EN_TRANSITO') THEN
            SELECT EXISTS (
                SELECT 1 FROM public.argentina_financial_ledger
                WHERE consolidation_id = p_id AND entry_type = 'DEBLEX_COST_ACCRUAL'
            ) INTO v_existing_ledger_charge;

            IF NOT v_existing_ledger_charge THEN
                INSERT INTO public.argentina_financial_ledger (
                    user_id,
                    consolidation_id,
                    entry_type,
                    amount_usd,
                    description,
                    created_by
                ) VALUES (
                    v_cons.user_id,
                    p_id,
                    'DEBLEX_COST_ACCRUAL',
                    v_cons.total_calculated_logistics_usd,
                    'Facturación logística devengada por despacho de consolidado ' || v_cons.consolidation_code,
                    v_caller_id
                );
            END IF;
        END IF;

        -- Historial
        INSERT INTO public.argentina_consolidation_history (
            consolidation_id,
            consolidation_code,
            action,
            performed_by,
            performer_email,
            reason,
            version_number,
            snapshot_data
        ) VALUES (
            p_id,
            v_cons.consolidation_code,
            CASE WHEN p_new_status IN ('DISPATCHED', 'EN_TRANSITO') THEN 'DISPATCHED' ELSE 'EDITED' END,
            v_caller_id,
            (SELECT email FROM auth.users WHERE id = v_caller_id),
            p_reason,
            COALESCE(v_cons.version, 1),
            jsonb_build_object('new_status', p_new_status, 'guide', p_deblex_guide, 'dispatched_at', v_now)
        );

    ELSE
        -- Envío individual (paquete suelto)
        SELECT * INTO v_pkg 
        FROM public.argentina_packages 
        WHERE id = p_id 
        FOR UPDATE;

        IF v_pkg IS NULL THEN
            RAISE EXCEPTION 'Paquete no encontrado';
        END IF;

        UPDATE public.argentina_packages
        SET 
            package_status = p_new_status,
            deblex_guide_number = COALESCE(p_deblex_guide, deblex_guide_number),
            dispatched_at = CASE WHEN p_new_status IN ('EN_TRANSITO', 'EN_DESPACHO') AND dispatched_at IS NULL THEN v_now ELSE dispatched_at END,
            delivered_at = CASE WHEN p_new_status = 'ENTREGADO' AND delivered_at IS NULL THEN v_now ELSE delivered_at END,
            updated_at = v_now
        WHERE id = p_id;

        -- Facturación individual única al despachar
        IF p_new_status IN ('EN_TRANSITO', 'EN_DESPACHO') THEN
            SELECT EXISTS (
                SELECT 1 FROM public.argentina_financial_ledger
                WHERE order_id = v_pkg.order_id AND entry_type = 'DEBLEX_COST_ACCRUAL'
            ) INTO v_existing_ledger_charge;

            IF NOT v_existing_ledger_charge AND v_pkg.user_id IS NOT NULL THEN
                INSERT INTO public.argentina_financial_ledger (
                    user_id,
                    order_id,
                    entry_type,
                    amount_usd,
                    description,
                    created_by
                ) VALUES (
                    v_pkg.user_id,
                    v_pkg.order_id,
                    'DEBLEX_COST_ACCRUAL',
                    v_pkg.logistics_paid_usd,
                    'Facturación logística individual devengada: ' || COALESCE(v_pkg.original_tracking_number, v_pkg.order_number),
                    v_caller_id
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'id', p_id, 'new_status', p_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_set_shipment_status(UUID, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated, service_role;

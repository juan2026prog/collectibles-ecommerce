CREATE OR REPLACE FUNCTION public.close_consolidation_atomic(p_package_ids uuid[], p_destination_zone text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
        RAISE EXCEPTION 'Documento del destinatario pendiente de verificacion';
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
    IF EXISTS (
        SELECT 1 FROM public.argentina_packages ap
        WHERE ap.id = ANY(p_package_ids)
          AND (ap.is_available_for_consolidation IS DISTINCT FROM true
               OR ap.consolidation_id IS NOT NULL
               OR ap.confirmed_weight_kg IS NULL
               OR ap.confirmed_weight_kg <= 0
               OR ap.fob_usd IS NULL OR ap.fob_usd < 0
               OR ap.logistics_paid_usd IS NULL OR ap.logistics_paid_usd < 0)
    ) THEN
        RAISE EXCEPTION 'Paquete no elegible, sin pesaje confirmado o con valores incompletos';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.argentina_packages ap
      WHERE ap.id = ANY(p_package_ids)
      GROUP BY COALESCE(NULLIF(BTRIM(ap.species_category),''),'SIN_CLASIFICAR')
      HAVING SUM(ap.units) > 3 OR BOOL_OR(ap.units IS NULL OR ap.units < 1 OR ap.species_category IS NULL OR BTRIM(ap.species_category) = '')
    ) THEN
        RAISE EXCEPTION 'Cantidad por especie excedida o especie sin clasificar';
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

    -- Evitar asientos de cero.
    IF v_net_diff <> 0 THEN
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

    END IF;

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
$function$

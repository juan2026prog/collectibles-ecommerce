-- Migration: 20261022100000_deblex_manual_operations_and_invoices.sql
-- Description:
-- 1. RPC administrativa deblex_create_consolidation: consolidación manual para admin/operador Deblex
--    con validación de mismo comprador, límites FOB USD 400 y peso 50 kg, generación oficial CS[0-9]{9}AR,
--    asiento de consolidación e historial inmutable.
-- 2. Tabla public.argentina_package_documents para gestión de facturas y comprobantes por paquete:
--    soporte de estado (ACTIVE, REPLACED, DELETED), soft delete con motivo y trazabilidad de sustituciones.
-- 3. Funciones RPC para subida/vinculación, sustitución y eliminación auditada de comprobantes.
-- 4. Políticas de almacenamiento (storage.objects) para el bucket 'deblex-invoices'.

-- 1. Tabla de comprobantes y facturas por paquete
CREATE TABLE IF NOT EXISTS public.argentina_package_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.argentina_packages(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'COMMERCIAL_INVOICE' CHECK (document_type IN ('COMMERCIAL_INVOICE', 'PURCHASE_RECEIPT', 'CUSTOMS_DECLARATION', 'OTHER')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  uploader_email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REPLACED', 'DELETED')),
  deletion_reason TEXT,
  replaced_by_id UUID REFERENCES public.argentina_package_documents(id),
  replacement_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arg_pkg_docs_pkg_id ON public.argentina_package_documents (package_id);
CREATE INDEX IF NOT EXISTS idx_arg_pkg_docs_status ON public.argentina_package_documents (status);

ALTER TABLE public.argentina_package_documents ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para argentina_package_documents
DROP POLICY IF EXISTS "Deblex staff view package documents" ON public.argentina_package_documents;
CREATE POLICY "Deblex staff view package documents" ON public.argentina_package_documents
  FOR SELECT TO authenticated
  USING (
    public.is_deblex_user(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.argentina_packages ap
      WHERE ap.id = package_id AND ap.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Deblex staff manage package documents" ON public.argentina_package_documents;
CREATE POLICY "Deblex staff manage package documents" ON public.argentina_package_documents
  FOR ALL TO authenticated
  USING (public.is_deblex_user(auth.uid()))
  WITH CHECK (public.is_deblex_user(auth.uid()));

-- 2. Políticas de Supabase Storage para bucket 'deblex-invoices'
DROP POLICY IF EXISTS "Deblex staff read storage invoices" ON storage.objects;
CREATE POLICY "Deblex staff read storage invoices" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'deblex-invoices' AND (
      public.is_deblex_user(auth.uid()) OR
      EXISTS (
        SELECT 1 FROM public.argentina_package_documents doc
        JOIN public.argentina_packages ap ON ap.id = doc.package_id
        WHERE doc.file_path = storage.objects.name AND ap.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Deblex staff upload storage invoices" ON storage.objects;
CREATE POLICY "Deblex staff upload storage invoices" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'deblex-invoices' AND public.is_deblex_user(auth.uid())
  );

DROP POLICY IF EXISTS "Deblex staff update storage invoices" ON storage.objects;
CREATE POLICY "Deblex staff update storage invoices" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'deblex-invoices' AND public.is_deblex_user(auth.uid())
  );

DROP POLICY IF EXISTS "Deblex staff delete storage invoices" ON storage.objects;
CREATE POLICY "Deblex staff delete storage invoices" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'deblex-invoices' AND public.is_deblex_user(auth.uid())
  );

-- 3. RPC Administrativa: deblex_create_consolidation
-- Permite a un operador o administrador de Deblex consolidar manualmente paquetes seleccionados
CREATE OR REPLACE FUNCTION public.deblex_create_consolidation(
    p_package_ids UUID[],
    p_destination_zone TEXT,
    p_reason TEXT DEFAULT 'Consolidación manual operativa Deblex'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_email TEXT;
    v_target_user_id UUID;
    v_pkg RECORD;
    v_pkg_count INTEGER := 0;
    v_total_fob NUMERIC(10,2) := 0;
    v_total_weight NUMERIC(8,2) := 0;
    v_prev_logistics NUMERIC(10,2) := 0;
    v_freight NUMERIC(10,2) := 0;
    v_logistic_pack NUMERIC(10,2) := 0;
    v_total_calc NUMERIC(10,2) := 0;
    v_net_diff NUMERIC(10,2) := 0;
    v_tariff RECORD;
    v_consolidation_id UUID;
    v_consolidation_code TEXT;
    v_recipient_doc TEXT;
    v_recipient_name TEXT;
    v_requested_count INTEGER;
    v_distinct_count INTEGER;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

    IF p_package_ids IS NULL OR array_length(p_package_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Debe seleccionar al menos un paquete';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT x) INTO v_requested_count, v_distinct_count FROM unnest(p_package_ids) AS x;
    IF v_requested_count <> v_distinct_count OR array_position(p_package_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Paquetes duplicados o inválidos';
    END IF;

    IF p_destination_zone IS NULL OR p_destination_zone NOT IN ('CABA', 'AMBA', 'INTERIOR') THEN
        RAISE EXCEPTION 'Zona de destino inválida (permitidas: CABA, AMBA, INTERIOR)';
    END IF;

    -- Validar tarifario activo
    SELECT * INTO v_tariff FROM public.deblex_tariff_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    IF v_tariff IS NULL THEN
        RAISE EXCEPTION 'No hay tarifario de Deblex activo configurado';
    END IF;

    -- Bloquear y verificar paquetes concurrentemente
    FOR v_pkg IN 
        SELECT id, user_id, recipient_document, recipient_name, fob_usd, confirmed_weight_kg, estimated_weight_kg, logistics_paid_usd, package_status, consolidation_id
        FROM public.argentina_packages
        WHERE id = ANY(p_package_ids)
        FOR UPDATE
    LOOP
        -- Validar estado disponible
        IF v_pkg.consolidation_id IS NOT NULL THEN
            RAISE EXCEPTION 'El paquete % ya pertenece a una consolidación activa', v_pkg.id;
        END IF;

        IF v_pkg.package_status NOT IN ('RECIBIDO_EN_DEPOSITO', 'DISPONIBLE_PARA_CONSOLIDAR') THEN
            RAISE EXCEPTION 'El paquete % no se encuentra disponible para consolidar (Estado: %)', v_pkg.id, v_pkg.package_status;
        END IF;

        -- Validar coherencia de comprador (mismo user_id o mismo recipient_document)
        IF v_target_user_id IS NULL THEN
            v_target_user_id := v_pkg.user_id;
            v_recipient_doc := COALESCE(v_pkg.recipient_document, 'PENDIENTE_DOCUMENTO');
            v_recipient_name := COALESCE(v_pkg.recipient_name, 'Comprador Argentina');
        ELSE
            IF v_target_user_id IS NOT NULL AND v_pkg.user_id IS NOT NULL AND v_pkg.user_id != v_target_user_id THEN
                RAISE EXCEPTION 'Todos los paquetes deben pertenecer al mismo comprador';
            END IF;
            IF v_target_user_id IS NULL AND v_pkg.user_id IS NOT NULL THEN
                v_target_user_id := v_pkg.user_id;
            END IF;
        END IF;

        v_pkg_count := v_pkg_count + 1;
        v_total_fob := v_total_fob + v_pkg.fob_usd;
        v_total_weight := v_total_weight + COALESCE(v_pkg.confirmed_weight_kg, v_pkg.estimated_weight_kg, 0.50);
        v_prev_logistics := v_prev_logistics + v_pkg.logistics_paid_usd;
    END LOOP;

    IF v_pkg_count <> v_requested_count THEN
        RAISE EXCEPTION 'Uno o más paquetes no existen o no son elegibles';
    END IF;

    -- Si tenemos user_id, completar datos de perfil oficial si están disponibles
    IF v_target_user_id IS NOT NULL THEN
        SELECT clean_document, first_name || ' ' || last_name INTO v_recipient_doc, v_recipient_name
        FROM public.customer_argentina_profiles WHERE user_id = v_target_user_id;
    END IF;

    IF NULLIF(BTRIM(v_recipient_doc),'') IS NULL THEN
        v_recipient_doc := 'PENDIENTE_DOCUMENTO';
    END IF;
    IF NULLIF(BTRIM(v_recipient_name),'') IS NULL THEN
        v_recipient_name := 'Comprador Argentina';
    END IF;

    -- Validaciones de Modalidad A
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

    -- Insertar consolidación (user_id puede ser el comprador o v_caller_id si aún no tiene user asignado)
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
        COALESCE(v_target_user_id, v_caller_id),
        v_recipient_doc,
        v_recipient_name,
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
        jsonb_build_object(
            'created_by_operator_id', v_caller_id,
            'created_by_operator_email', v_caller_email,
            'operational_reason', p_reason
        )
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
        ) ON CONFLICT (package_id) DO UPDATE
        SET 
            consolidation_id = v_consolidation_id,
            fob_at_consolidation = EXCLUDED.fob_at_consolidation,
            weight_at_consolidation = EXCLUDED.weight_at_consolidation;

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
        performer_email,
        reason,
        version_number,
        snapshot_data,
        financial_delta_usd
    ) VALUES (
        v_consolidation_id,
        v_consolidation_code,
        'CREATED',
        v_caller_id,
        v_caller_email,
        p_reason,
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

    -- Registrar movimiento en el libro financiero si hay diferencia y comprador identificado
    IF v_net_diff <> 0 AND v_target_user_id IS NOT NULL THEN
        INSERT INTO public.argentina_financial_ledger (
            user_id,
            consolidation_id,
            entry_type,
            amount_usd,
            description,
            created_by
        ) VALUES (
            v_target_user_id,
            v_consolidation_id,
            'CONSOLIDATION_CREDIT',
            v_net_diff,
            'Ajuste por consolidación manual de ' || v_pkg_count || ' paquetes (' || v_consolidation_code || ')',
            v_caller_id
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
        'net_difference_usd', v_net_diff
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_create_consolidation(UUID[], TEXT, TEXT) TO authenticated, service_role;

-- 4. RPCs de Gestión Documental de Facturas

-- Subir / Registrar nueva factura de paquete
CREATE OR REPLACE FUNCTION public.deblex_register_package_document(
    p_package_id UUID,
    p_file_name TEXT,
    p_file_path TEXT,
    p_file_size BIGINT,
    p_mime_type TEXT,
    p_document_type TEXT DEFAULT 'COMMERCIAL_INVOICE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_email TEXT;
    v_doc_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

    IF NOT EXISTS (SELECT 1 FROM public.argentina_packages WHERE id = p_package_id) THEN
        RAISE EXCEPTION 'Paquete % no encontrado', p_package_id;
    END IF;

    INSERT INTO public.argentina_package_documents (
        package_id,
        document_type,
        file_name,
        file_path,
        file_size,
        mime_type,
        uploaded_by,
        uploader_email,
        status
    ) VALUES (
        p_package_id,
        p_document_type,
        p_file_name,
        p_file_path,
        p_file_size,
        p_mime_type,
        v_caller_id,
        v_caller_email,
        'ACTIVE'
    ) RETURNING id INTO v_doc_id;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc_id,
        'package_id', p_package_id,
        'file_name', p_file_name,
        'file_path', p_file_path
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_register_package_document(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated, service_role;

-- Sustituir factura existente
CREATE OR REPLACE FUNCTION public.deblex_replace_package_document(
    p_old_document_id UUID,
    p_file_name TEXT,
    p_file_path TEXT,
    p_file_size BIGINT,
    p_mime_type TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_email TEXT;
    v_old_doc RECORD;
    v_new_doc_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo de la sustitución es obligatorio';
    END IF;

    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

    SELECT * INTO v_old_doc FROM public.argentina_package_documents WHERE id = p_old_document_id FOR UPDATE;
    IF v_old_doc IS NULL THEN
        RAISE EXCEPTION 'Documento previo no encontrado';
    END IF;

    -- Crear nuevo registro activo
    INSERT INTO public.argentina_package_documents (
        package_id,
        document_type,
        file_name,
        file_path,
        file_size,
        mime_type,
        uploaded_by,
        uploader_email,
        status,
        replacement_reason
    ) VALUES (
        v_old_doc.package_id,
        v_old_doc.document_type,
        p_file_name,
        p_file_path,
        p_file_size,
        p_mime_type,
        v_caller_id,
        v_caller_email,
        'ACTIVE',
        p_reason
    ) RETURNING id INTO v_new_doc_id;

    -- Marcar anterior como REPLACED (preserva trazabilidad)
    UPDATE public.argentina_package_documents
    SET 
        status = 'REPLACED',
        replaced_by_id = v_new_doc_id,
        replacement_reason = p_reason,
        updated_at = now()
    WHERE id = p_old_document_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_document_id', v_new_doc_id,
        'old_document_id', p_old_document_id,
        'package_id', v_old_doc.package_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_replace_package_document(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated, service_role;

-- Eliminar (Soft-delete) factura con motivo obligatorio
CREATE OR REPLACE FUNCTION public.deblex_delete_package_document(
    p_document_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_doc RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT public.is_deblex_user(v_caller_id) THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere rol activo de operador o administrador de Deblex';
    END IF;

    IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo para eliminar el documento es obligatorio';
    END IF;

    SELECT * INTO v_doc FROM public.argentina_package_documents WHERE id = p_document_id FOR UPDATE;
    IF v_doc IS NULL THEN
        RAISE EXCEPTION 'Documento no encontrado';
    END IF;

    -- Soft delete inmutable
    UPDATE public.argentina_package_documents
    SET 
        status = 'DELETED',
        deletion_reason = p_reason,
        updated_at = now()
    WHERE id = p_document_id;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', p_document_id,
        'package_id', v_doc.package_id,
        'status', 'DELETED'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deblex_delete_package_document(UUID, TEXT) TO authenticated, service_role;

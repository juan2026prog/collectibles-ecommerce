-- Migration: Interactive Vendor Onboarding System
-- Date: 2026-08-05

BEGIN;

-- 1. Create vendor_onboarding_progress table
CREATE TABLE IF NOT EXISTS public.vendor_onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    onboarding_version TEXT NOT NULL DEFAULT '1.0',
    current_step TEXT DEFAULT 'store_profile',
    completed_at TIMESTAMPTZ,
    submitted_for_review_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'onboarding',
    minimized BOOLEAN NOT NULL DEFAULT false,
    admin_notes TEXT,
    rejected_steps JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_onboarding_unique UNIQUE (vendor_id, onboarding_version)
);

CREATE INDEX IF NOT EXISTS idx_vendor_onboarding_vendor ON public.vendor_onboarding_progress(vendor_id);

-- 2. Create vendor_onboarding_acknowledgements table
CREATE TABLE IF NOT EXISTS public.vendor_onboarding_acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    item_version TEXT NOT NULL DEFAULT '1.0',
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_ack_unique UNIQUE (vendor_id, item_type, item_version)
);

CREATE INDEX IF NOT EXISTS idx_vendor_ack_vendor ON public.vendor_onboarding_acknowledgements(vendor_id);

-- 3. Enable RLS
ALTER TABLE public.vendor_onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view their own onboarding progress" ON public.vendor_onboarding_progress;
CREATE POLICY "Vendors can view their own onboarding progress" ON public.vendor_onboarding_progress
    FOR SELECT USING (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Vendors can update their own onboarding progress" ON public.vendor_onboarding_progress;
CREATE POLICY "Vendors can update their own onboarding progress" ON public.vendor_onboarding_progress
    FOR ALL USING (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Vendors can view their acknowledgements" ON public.vendor_onboarding_acknowledgements;
CREATE POLICY "Vendors can view their acknowledgements" ON public.vendor_onboarding_acknowledgements
    FOR SELECT USING (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Vendors can insert their acknowledgements" ON public.vendor_onboarding_acknowledgements;
CREATE POLICY "Vendors can insert their acknowledgements" ON public.vendor_onboarding_acknowledgements
    FOR INSERT WITH CHECK (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

-- 4. Central RPC to calculate Real DB Onboarding Status
CREATE OR REPLACE FUNCTION public.get_vendor_onboarding_status(p_vendor_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_vendor RECORD;
    v_dispatch RECORD;
    v_product RECORD;
    v_progress RECORD;
    
    -- Step indicators
    v_s1_done BOOLEAN := false; -- Store Profile
    v_s2_done BOOLEAN := false; -- Payout Account
    v_s3_done BOOLEAN := false; -- Dispatch Address
    v_s4_done BOOLEAN := false; -- Shipping Methods
    v_s5_done BOOLEAN := false; -- Free Shipping Rule
    v_s6_done BOOLEAN := false; -- First Product
    v_s7_done BOOLEAN := false; -- Sales Workflow
    
    v_s2_status TEXT := 'pending'; -- pending, in_review, verified, rejected
    v_s6_status TEXT := 'pending'; -- pending, in_review, completed, rejected

    v_s1_missing TEXT[] := ARRAY[]::TEXT[];
    v_s2_missing TEXT[] := ARRAY[]::TEXT[];
    v_s3_missing TEXT[] := ARRAY[]::TEXT[];
    v_s4_missing TEXT[] := ARRAY[]::TEXT[];
    v_s5_missing TEXT[] := ARRAY[]::TEXT[];
    v_s6_missing TEXT[] := ARRAY[]::TEXT[];
    v_s7_missing TEXT[] := ARRAY[]::TEXT[];
    
    v_completed_count INTEGER := 0;
    v_percentage INTEGER := 0;
    v_is_complete BOOLEAN := false;
    v_shipping_settings JSONB;
    v_has_shipping_active BOOLEAN := false;
    v_rej_steps JSONB := '{}'::jsonb;
    v_onb_status TEXT := 'onboarding';
    v_minimized BOOLEAN := false;
    v_payout_settings JSONB;
BEGIN
    -- Fetch vendor record
    SELECT id, store_name, description, contact_email, contact_phone, tax_id, 
           vendor_payment_settings, shipping_settings, status, kyc_status
    INTO v_vendor
    FROM public.vendors
    WHERE id = p_vendor_id;

    IF v_vendor.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Fetch onboarding progress record
    SELECT * INTO v_progress
    FROM public.vendor_onboarding_progress
    WHERE vendor_id = p_vendor_id AND onboarding_version = '1.0';

    IF v_progress.id IS NOT NULL THEN
        v_onb_status := v_progress.status;
        v_minimized := v_progress.minimized;
        v_rej_steps := COALESCE(v_progress.rejected_steps, '{}'::jsonb);
    END IF;

    -- PASO 1: Store Profile
    IF v_vendor.store_name IS NULL OR length(trim(v_vendor.store_name)) = 0 THEN
        v_s1_missing := array_append(v_s1_missing, 'Nombre público de la tienda');
    END IF;
    IF v_vendor.description IS NULL OR length(trim(v_vendor.description)) < 10 THEN
        v_s1_missing := array_append(v_s1_missing, 'Descripción detallada de la tienda (mínimo 10 caracteres)');
    END IF;
    IF (v_vendor.contact_email IS NULL OR length(trim(v_vendor.contact_email)) = 0) AND
       (v_vendor.contact_phone IS NULL OR length(trim(v_vendor.contact_phone)) = 0) THEN
        v_s1_missing := array_append(v_s1_missing, 'Email o teléfono de contacto');
    END IF;
    IF v_vendor.tax_id IS NULL OR length(trim(v_vendor.tax_id)) = 0 THEN
        v_s1_missing := array_append(v_s1_missing, 'RUT o Cédula de Identidad fiscal');
    END IF;

    IF array_length(v_s1_missing, 1) IS NULL THEN
        v_s1_done := true;
    END IF;

    -- PASO 2: Payout Account
    v_payout_settings := v_vendor.vendor_payment_settings;
    IF v_payout_settings IS NULL OR
       (v_payout_settings->>'account_number') IS NULL OR
       length(trim(v_payout_settings->>'account_number')) = 0 THEN
        v_s2_missing := array_append(v_s2_missing, 'Número de cuenta bancaria');
    END IF;
    IF v_payout_settings IS NULL OR
       (v_payout_settings->>'account_name') IS NULL OR
       length(trim(v_payout_settings->>'account_name')) = 0 THEN
        v_s2_missing := array_append(v_s2_missing, 'Titular de la cuenta');
    END IF;
    IF v_payout_settings IS NULL OR
       (v_payout_settings->>'bank_name') IS NULL OR
       length(trim(v_payout_settings->>'bank_name')) = 0 THEN
        v_s2_missing := array_append(v_s2_missing, 'Banco o institución');
    END IF;

    IF array_length(v_s2_missing, 1) IS NULL THEN
        IF v_vendor.kyc_status = 'approved' OR (v_payout_settings->>'status') = 'verified' THEN
            v_s2_done := true;
            v_s2_status := 'completed';
        ELSIF v_vendor.kyc_status = 'rejected' OR (v_payout_settings->>'status') = 'rejected' THEN
            v_s2_done := false;
            v_s2_status := 'rejected';
            v_s2_missing := array_append(v_s2_missing, 'Cuenta rechazada por administración');
        ELSE
            v_s2_done := true;
            v_s2_status := 'in_review';
        END IF;
    ELSE
        v_s2_status := 'pending';
    END IF;

    -- PASO 3: Dispatch Address
    SELECT street, number, department, locality, phone INTO v_dispatch
    FROM public.vendor_dispatch_addresses
    WHERE vendor_id = p_vendor_id AND is_active = true
    LIMIT 1;

    IF v_dispatch.street IS NOT NULL AND length(trim(v_dispatch.street)) > 0 AND
       v_dispatch.department IS NOT NULL AND length(trim(v_dispatch.department)) > 0 AND
       v_dispatch.locality IS NOT NULL AND length(trim(v_dispatch.locality)) > 0 AND
       v_dispatch.phone IS NOT NULL AND length(trim(v_dispatch.phone)) > 0 THEN
        v_s3_done := true;
    ELSE
        IF v_dispatch.street IS NULL THEN
            v_s3_missing := array_append(v_s3_missing, 'Calle y número de despacho');
        END IF;
        IF v_dispatch.department IS NULL THEN
            v_s3_missing := array_append(v_s3_missing, 'Departamento de origen');
        END IF;
        IF v_dispatch.locality IS NULL THEN
            v_s3_missing := array_append(v_s3_missing, 'Ciudad o localidad');
        END IF;
        IF v_dispatch.phone IS NULL THEN
            v_s3_missing := array_append(v_s3_missing, 'Teléfono de contacto para retiros');
        END IF;
    END IF;

    -- PASO 4: Shipping Methods
    v_shipping_settings := v_vendor.shipping_settings;
    IF v_shipping_settings IS NOT NULL THEN
        IF (v_shipping_settings->'dac'->>'active')::boolean = true OR
           (v_shipping_settings->'soydelivery'->>'active')::boolean = true OR
           (v_shipping_settings->'distrilogic'->>'active')::boolean = true OR
           (v_shipping_settings->'pickup'->>'active')::boolean = true OR
           (v_shipping_settings->'manual'->>'active')::boolean = true THEN
            v_has_shipping_active := true;
        END IF;
    END IF;

    IF NOT v_has_shipping_active THEN
        IF EXISTS (
            SELECT 1 FROM public.vendor_logistics_connections
            WHERE vendor_id = p_vendor_id AND is_active = true
        ) THEN
            v_has_shipping_active := true;
        END IF;
    END IF;

    IF v_has_shipping_active THEN
        v_s4_done := true;
    ELSE
        v_s4_missing := array_append(v_s4_missing, 'Al menos un método de envío habilitado (DAC, SoyDelivery, Distrilogic, Retiro o Personalizado)');
    END IF;

    -- PASO 5: Free Shipping Acknowledgement
    IF EXISTS (
        SELECT 1 FROM public.vendor_onboarding_acknowledgements
        WHERE vendor_id = p_vendor_id AND item_type = 'free_shipping_rule' AND item_version = '1.0'
    ) THEN
        v_s5_done := true;
    ELSE
        v_s5_missing := array_append(v_s5_missing, 'Confirmación de regla de envío gratis desde UYU 1.500');
    END IF;

    -- PASO 6: First Product Validation
    SELECT id, title, price, images, stock INTO v_product
    FROM public.products
    WHERE vendor_id = p_vendor_id AND price > 0 AND (status = 'published' OR status = 'in_review' OR status = 'draft')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_product.id IS NOT NULL AND v_product.title IS NOT NULL AND length(trim(v_product.title)) > 0 THEN
        v_s6_done := true;
        v_s6_status := 'completed';
    ELSE
        v_s6_status := 'pending';
        v_s6_missing := array_append(v_s6_missing, 'Al menos un producto publicado o en borrador con precio válido, stock y foto');
    END IF;

    -- PASO 7: Sales Workflow Acknowledgement
    IF EXISTS (
        SELECT 1 FROM public.vendor_onboarding_acknowledgements
        WHERE vendor_id = p_vendor_id AND item_type = 'sales_workflow' AND item_version = '1.0'
    ) THEN
        v_s7_done := true;
    ELSE
        v_s7_missing := array_append(v_s7_missing, 'Confirmación de lectura del flujo de venta y liquidaciones');
    END IF;

    -- Count total
    IF v_s1_done THEN v_completed_count := v_completed_count + 1; END IF;
    IF v_s2_done THEN v_completed_count := v_completed_count + 1; END IF;
    IF v_s3_done THEN v_completed_count := v_completed_count + 1; END IF;
    IF v_s4_done THEN v_completed_count := v_completed_count + 1; END IF;
    IF v_s5_done THEN v_completed_count := v_completed_count + 1; END IF;
    IF v_s6_done THEN v_completed_count := v_completed_count + 1; END IF;
    IF v_s7_done THEN v_completed_count := v_completed_count + 1; END IF;

    v_percentage := round((v_completed_count::numeric / 7.0) * 100);
    IF v_completed_count = 7 THEN
        v_is_complete := true;
    END IF;

    RETURN jsonb_build_object(
        'totalSteps', 7,
        'completedSteps', v_completed_count,
        'percentage', v_percentage,
        'isComplete', v_is_complete,
        'status', v_onb_status,
        'minimized', v_minimized,
        'adminNotes', COALESCE(v_progress.admin_notes, ''),
        'rejectedSteps', v_rej_steps,
        'steps', jsonb_build_array(
            jsonb_build_object(
                'code', 'store_profile',
                'number', 1,
                'title', 'Completá los datos de tu tienda',
                'description', 'Nombre público, logo, descripción, RUT/Cédula y domicilio fiscal.',
                'badge', 'Obligatorio',
                'status', CASE WHEN v_s1_done THEN 'completed' WHEN v_rej_steps->>'store_profile' IS NOT NULL THEN 'changes_required' ELSE 'pending' END,
                'ctaText', 'COMPLETAR DATOS DE LA TIENDA',
                'ctaPath', '/vendor?tab=settings&sub=profile',
                'missingFields', v_s1_missing,
                'rejectionReason', COALESCE(v_rej_steps->>'store_profile', '')
            ),
            jsonb_build_object(
                'code', 'payout_account',
                'number', 2,
                'title', 'Configurá dónde recibirás tus pagos',
                'description', 'Cuenta bancaria para transferencias de liquidación todos los miércoles.',
                'badge', 'Obligatorio',
                'status', CASE WHEN v_s2_status = 'completed' THEN 'completed' WHEN v_s2_status = 'in_review' THEN 'in_review' WHEN v_rej_steps->>'payout_account' IS NOT NULL THEN 'changes_required' ELSE 'pending' END,
                'ctaText', 'CONFIGURAR CUENTA DE COBRO',
                'ctaPath', '/vendor?tab=settings&sub=billing',
                'missingFields', v_s2_missing,
                'rejectionReason', COALESCE(v_rej_steps->>'payout_account', '')
            ),
            jsonb_build_object(
                'code', 'dispatch_address',
                'number', 3,
                'title', 'Agregá tu dirección de despacho',
                'description', 'Dirección física de origen desde donde saldrán tus paquetes.',
                'badge', 'Obligatorio',
                'status', CASE WHEN v_s3_done THEN 'completed' WHEN v_rej_steps->>'dispatch_address' IS NOT NULL THEN 'changes_required' ELSE 'pending' END,
                'ctaText', 'AGREGAR DIRECCIÓN DE DESPACHO',
                'ctaPath', '/vendor?tab=settings&sub=shipping',
                'missingFields', v_s3_missing,
                'rejectionReason', COALESCE(v_rej_steps->>'dispatch_address', '')
            ),
            jsonb_build_object(
                'code', 'shipping_methods',
                'number', 4,
                'title', 'Elegí tus métodos de entrega',
                'description', 'Habilitá DAC, SoyDelivery Flex, Distrilogic, Retiro o Envío propio.',
                'badge', 'Obligatorio',
                'status', CASE WHEN v_s4_done THEN 'completed' WHEN v_rej_steps->>'shipping_methods' IS NOT NULL THEN 'changes_required' ELSE 'pending' END,
                'ctaText', 'CONFIGURAR ENVÍOS',
                'ctaPath', '/vendor?tab=settings&sub=shipping',
                'missingFields', v_s4_missing,
                'rejectionReason', COALESCE(v_rej_steps->>'shipping_methods', '')
            ),
            jsonb_build_object(
                'code', 'free_shipping_rule',
                'number', 5,
                'title', 'Revisá la regla de envío gratis',
                'description', 'Envío gratis obligatorio desde UYU 1.500 por tienda a cargo del Vendor.',
                'badge', 'Obligatorio',
                'status', CASE WHEN v_s5_done THEN 'completed' ELSE 'pending' END,
                'ctaText', 'REVISAR Y CONFIRMAR',
                'ctaPath', 'action:free_shipping_modal',
                'missingFields', v_s5_missing,
                'rejectionReason', ''
            ),
            jsonb_build_object(
                'code', 'first_product',
                'number', 6,
                'title', 'Publicá tu primer producto',
                'description', 'Cargá título, fotos, precio, stock, dimensiones y peso.',
                'badge', 'Obligatorio',
                'status', CASE WHEN v_s6_done THEN 'completed' WHEN v_rej_steps->>'first_product' IS NOT NULL THEN 'changes_required' ELSE 'pending' END,
                'ctaText', 'PUBLICAR MI PRIMER PRODUCTO',
                'ctaPath', '/vendor?tab=products&action=new',
                'missingFields', v_s6_missing,
                'rejectionReason', COALESCE(v_rej_steps->>'first_product', '')
            ),
            jsonb_build_object(
                'code', 'sales_workflow',
                'number', 7,
                'title', 'Revisá cómo funciona una venta',
                'description', 'Guía educativa del proceso: pedido, empaque, despacho y liquidación.',
                'badge', 'Informativo',
                'status', CASE WHEN v_s7_done THEN 'completed' ELSE 'pending' END,
                'ctaText', 'VER GUÍA DE VENTA',
                'ctaPath', 'action:sales_workflow_modal',
                'missingFields', v_s7_missing,
                'rejectionReason', ''
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC to acknowledge educational/regulatory items
CREATE OR REPLACE FUNCTION public.acknowledge_onboarding_item(
    p_item_type TEXT,
    p_item_version TEXT DEFAULT '1.0'
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_vendor_id UUID;
    v_ack_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    SELECT id INTO v_vendor_id FROM public.vendors WHERE id = v_user_id;
    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Perfil de Vendor no encontrado.';
    END IF;

    INSERT INTO public.vendor_onboarding_acknowledgements (
        vendor_id, item_type, item_version, accepted_at, accepted_by
    ) VALUES (
        v_vendor_id, p_item_type, COALESCE(p_item_version, '1.0'), now(), v_user_id
    )
    ON CONFLICT (vendor_id, item_type, item_version) DO UPDATE SET
        accepted_at = EXCLUDED.accepted_at
    RETURNING id INTO v_ack_id;

    RETURN jsonb_build_object('success', true, 'item_type', p_item_type, 'acknowledgement_id', v_ack_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC to toggle onboarding minimization
CREATE OR REPLACE FUNCTION public.toggle_onboarding_minimized(p_minimized BOOLEAN)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    INSERT INTO public.vendor_onboarding_progress (
        vendor_id, onboarding_version, minimized, updated_at
    ) VALUES (
        v_user_id, '1.0', p_minimized, now()
    )
    ON CONFLICT (vendor_id, onboarding_version) DO UPDATE SET
        minimized = EXCLUDED.minimized,
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'minimized', p_minimized);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Strict Server-Side Submission Function
CREATE OR REPLACE FUNCTION public.submit_vendor_onboarding_for_review()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_status JSONB;
    v_req_terms BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    -- Check terms requirement
    v_req_terms := public.vendor_requires_terms_acceptance(v_user_id);
    IF v_req_terms IS TRUE THEN
        RAISE EXCEPTION 'Debes aceptar legalmente los Términos y Condiciones vigentes antes de enviar a revisión.';
    END IF;

    -- Check real DB completion status
    v_status := public.get_vendor_onboarding_status(v_user_id);
    IF (v_status->>'isComplete')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Debes completar los 7 pasos obligatorios evaluados técnicamente antes de enviar a revisión.';
    END IF;

    INSERT INTO public.vendor_onboarding_progress (
        vendor_id, onboarding_version, status, submitted_for_review_at, updated_at
    ) VALUES (
        v_user_id, '1.0', 'pending_review', now(), now()
    )
    ON CONFLICT (vendor_id, onboarding_version) DO UPDATE SET
        status = 'pending_review',
        submitted_for_review_at = now(),
        updated_at = now();

    UPDATE public.vendors
    SET status = 'pending_review'
    WHERE id = v_user_id AND status IN ('pending', 'pending_terms_acceptance', 'onboarding', 'changes_required');

    RETURN jsonb_build_object('success', true, 'status', 'pending_review');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Strict Server-Side Admin Review Function
CREATE OR REPLACE FUNCTION public.admin_review_vendor_onboarding(
    p_vendor_id UUID,
    p_action TEXT, -- 'approve' | 'request_changes'
    p_notes TEXT DEFAULT NULL,
    p_rejected_steps JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_admin_id UUID;
    v_new_status TEXT;
    v_status JSONB;
BEGIN
    v_admin_id := auth.uid();
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND is_admin = true) THEN
        RAISE EXCEPTION 'No autorizado. Se requiere perfil de Administrador.';
    END IF;

    IF p_action = 'approve' THEN
        -- Re-verify server-side completion before approving
        v_status := public.get_vendor_onboarding_status(p_vendor_id);
        IF (v_status->>'isComplete')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'Imposible aprobar: El vendedor aún posee pasos incompletos en la evaluación objetiva de base de datos.';
        END IF;

        v_new_status := 'active';
        
        UPDATE public.vendors
        SET status = 'active'
        WHERE id = p_vendor_id;

        INSERT INTO public.vendor_onboarding_progress (
            vendor_id, onboarding_version, status, approved_at, approved_by, admin_notes, updated_at
        ) VALUES (
            p_vendor_id, '1.0', 'active', now(), v_admin_id, p_notes, now()
        )
        ON CONFLICT (vendor_id, onboarding_version) DO UPDATE SET
            status = 'active',
            approved_at = now(),
            approved_by = v_admin_id,
            admin_notes = EXCLUDED.admin_notes,
            rejected_steps = '{}'::jsonb,
            updated_at = now();

    ELSIF p_action = 'request_changes' THEN
        v_new_status := 'changes_required';

        UPDATE public.vendors
        SET status = 'onboarding'
        WHERE id = p_vendor_id;

        INSERT INTO public.vendor_onboarding_progress (
            vendor_id, onboarding_version, status, admin_notes, rejected_steps, updated_at
        ) VALUES (
            p_vendor_id, '1.0', 'changes_required', p_notes, COALESCE(p_rejected_steps, '{}'::jsonb), now()
        )
        ON CONFLICT (vendor_id, onboarding_version) DO UPDATE SET
            status = 'changes_required',
            admin_notes = EXCLUDED.admin_notes,
            rejected_steps = EXCLUDED.rejected_steps,
            updated_at = now();

    ELSE
        RAISE EXCEPTION 'Acción inválida. Use approve o request_changes.';
    END IF;

    RETURN jsonb_build_object('success', true, 'status', v_new_status, 'vendor_id', p_vendor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

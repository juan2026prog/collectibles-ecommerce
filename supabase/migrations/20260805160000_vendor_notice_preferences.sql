-- Migration: Vendor Notice Preferences & Terms Reminder System
-- Date: 2026-08-05

BEGIN;

-- 1. Create vendor_notice_preferences table
CREATE TABLE IF NOT EXISTS public.vendor_notice_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    notice_type TEXT NOT NULL DEFAULT 'vendor_terms_reminder',
    legal_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    document_version TEXT NOT NULL,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    dismissed_at TIMESTAMPTZ,
    dismissed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_notice_unique UNIQUE (vendor_id, notice_type, legal_document_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_notice_pref ON public.vendor_notice_preferences(vendor_id, legal_document_id, notice_type);

-- 2. RLS Security Policies
ALTER TABLE public.vendor_notice_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view their own notice preferences" ON public.vendor_notice_preferences;
CREATE POLICY "Vendors can view their own notice preferences" ON public.vendor_notice_preferences
    FOR SELECT USING (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Vendors can insert or update their own notice preferences" ON public.vendor_notice_preferences;
CREATE POLICY "Vendors can insert or update their own notice preferences" ON public.vendor_notice_preferences
    FOR ALL USING (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

-- 3. RPC Function to dismiss vendor terms notice (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.dismiss_vendor_terms_notice(p_legal_document_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_vendor_id UUID;
    v_doc RECORD;
    v_pref_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    SELECT id INTO v_vendor_id
    FROM public.vendors
    WHERE id = v_user_id;

    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'El usuario no posee perfil de Vendedor registrado.';
    END IF;

    -- Verify vendor has accepted current terms FIRST
    IF public.vendor_requires_terms_acceptance(v_vendor_id) THEN
        RAISE EXCEPTION 'El vendedor no ha aceptado legalmente la versión vigente de los términos.';
    END IF;

    -- Fetch document version
    SELECT id, version, is_active
    INTO v_doc
    FROM public.legal_documents
    WHERE id = p_legal_document_id;

    IF v_doc.id IS NULL THEN
        RAISE EXCEPTION 'El documento legal especificado no existe.';
    END IF;

    -- Upsert preference record
    INSERT INTO public.vendor_notice_preferences (
        vendor_id,
        notice_type,
        legal_document_id,
        document_version,
        dismissed,
        dismissed_at,
        dismissed_by,
        updated_at
    ) VALUES (
        v_vendor_id,
        'vendor_terms_reminder',
        v_doc.id,
        v_doc.version,
        true,
        now(),
        v_user_id,
        now()
    )
    ON CONFLICT (vendor_id, notice_type, legal_document_id) DO UPDATE SET
        dismissed = true,
        dismissed_at = now(),
        dismissed_by = EXCLUDED.dismissed_by,
        updated_at = now()
    RETURNING id INTO v_pref_id;

    RETURN jsonb_build_object(
        'success', true,
        'preference_id', v_pref_id,
        'vendor_id', v_vendor_id,
        'legal_document_id', v_doc.id,
        'version', v_doc.version,
        'dismissed', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC Function for Admin to reset vendor terms notice (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.reset_vendor_terms_notice(p_vendor_id UUID, p_legal_document_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND is_admin = true) THEN
        RAISE EXCEPTION 'No autorizado. Se requiere perfil de Administrador.';
    END IF;

    UPDATE public.vendor_notice_preferences
    SET dismissed = false,
        updated_at = now()
    WHERE vendor_id = p_vendor_id
      AND legal_document_id = p_legal_document_id
      AND notice_type = 'vendor_terms_reminder';

    RETURN jsonb_build_object(
        'success', true,
        'vendor_id', p_vendor_id,
        'legal_document_id', p_legal_document_id,
        'dismissed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

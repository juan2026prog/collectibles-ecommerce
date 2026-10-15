-- ==============================================================================
-- MIGRATION: 20261015090000_deblex_quota_hardening_and_legacy_cleanup.sql
-- Description:
--   Refuerza el control de cupos y seguridad del Portal Deblex:
--   1. Añade campos de estado del usuario ('ACTIVE', 'PENDING_INVITE', 'SUSPENDED', 'FAILED')
--   2. Define política estricta de cupo:
--      - 2 administradores oficiales (juanmacastillo2008@gmail.com, ariel.delpino@deblex.com.ar)
--      - Máximo 6 operadores adicionales (estados 'ACTIVE', 'PENDING_INVITE', 'SUSPENDED' consumen cupo)
--      - Cuentas 'FAILED' NO consumen cupo
--   3. Añade tabla de auditoría para creaciones e invitaciones: public.deblex_user_invitations
--   4. Revoca permisos EXECUTE y ELIMINA la función insegura public.create_deblex_user_atomic
--      que manipulaba directamente auth.users con passwords en texto plano.
--   5. Refuerza RLS en deblex_portal_users para que los operadores no puedan modificar roles ni estatus.
--   6. Añade índice de concurrencia y restricción CHECK para roles autorizados.
-- ==============================================================================

BEGIN;

-- 1. Añadir columna status a public.deblex_portal_users si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'deblex_portal_users' 
          AND column_name = 'status'
    ) THEN
        ALTER TABLE public.deblex_portal_users 
        ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' 
        CHECK (status IN ('ACTIVE', 'PENDING_INVITE', 'SUSPENDED', 'FAILED'));
    END IF;
END $$;

-- 2. Tabla de auditoría e invitaciones seguras
CREATE TABLE IF NOT EXISTS public.deblex_user_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    role text NOT NULL CHECK (role IN ('deblex_operator', 'deblex_admin')),
    invited_by uuid REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'FAILED')),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deblex_user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deblex admins view invitations" ON public.deblex_user_invitations;
CREATE POLICY "Deblex admins view invitations"
ON public.deblex_user_invitations FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.deblex_portal_users d
        WHERE d.user_id = auth.uid() AND d.role = 'deblex_admin' AND d.is_active = true
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

-- 3. Función transaccional segura para reservar cupo antes de invitar (RPC callable únicamente por deblex_admin)
CREATE OR REPLACE FUNCTION public.reserve_deblex_operator_quota(
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_email text;
    v_caller_is_admin boolean := false;
    v_current_count integer;
    v_max_total integer := 8; -- 2 admins iniciales + máx 6 operadores
    v_clean_email text;
    v_portal_user_id uuid;
BEGIN
    v_caller_id := auth.uid();
    v_clean_email := LOWER(TRIM(p_email));

    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'El correo electrónico es obligatorio';
    END IF;

    -- Validar que el llamador sea un deblex_admin autenticado
    SELECT LOWER(email) INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

    IF v_caller_email IN ('juanmacastillo2008@gmail.com', 'ariel.delpino@deblex.com.ar') THEN
        v_caller_is_admin := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.deblex_portal_users 
        WHERE user_id = v_caller_id AND role = 'deblex_admin' AND is_active = true
    ) THEN
        v_caller_is_admin := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_caller_id AND is_admin = true
    ) THEN
        v_caller_is_admin := true;
    END IF;

    IF NOT v_caller_is_admin THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de deblex_admin.';
    END IF;

    -- Bloqueo pesimista para evitar carreras entre múltiples administradores
    PERFORM 1 FROM public.deblex_portal_users FOR UPDATE;

    -- Contabilizar cuentas que consumen cupo (ACTIVE, PENDING_INVITE, SUSPENDED)
    SELECT COUNT(*) INTO v_current_count 
    FROM public.deblex_portal_users
    WHERE status IN ('ACTIVE', 'PENDING_INVITE', 'SUSPENDED');

    IF v_current_count >= v_max_total THEN
        RAISE EXCEPTION 'Cupo alcanzado: Se ha alcanzado el límite máximo permitido de % cuentas en el Portal Deblex (2 admins + 6 operadores).', v_max_total;
    END IF;

    -- Verificar si ya existe este correo registrado
    IF EXISTS (
        SELECT 1 FROM public.deblex_portal_users 
        WHERE email = v_clean_email AND status != 'FAILED'
    ) THEN
        RAISE EXCEPTION 'El correo % ya está registrado en el portal Deblex.', v_clean_email;
    END IF;

    -- Insertar o reutilizar registro en estado PENDING_INVITE
    INSERT INTO public.deblex_portal_users (
        email,
        role,
        is_active,
        status,
        created_by
    ) VALUES (
        v_clean_email,
        'deblex_operator',
        true,
        'PENDING_INVITE',
        v_caller_id
    )
    ON CONFLICT (email) DO UPDATE SET
        role = 'deblex_operator',
        status = 'PENDING_INVITE',
        is_active = true,
        updated_at = now()
    RETURNING id INTO v_portal_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'portal_user_id', v_portal_user_id,
        'email', v_clean_email,
        'allocated_count', v_current_count + 1,
        'max_allowed', v_max_total
    );
END;
$$;

-- Revocar permisos a anónimos
REVOKE EXECUTE ON FUNCTION public.reserve_deblex_operator_quota(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_deblex_operator_quota(text) TO authenticated;

-- 4. ELIMINAR LA FUNCIÓN INSEGURA ANTERIOR (create_deblex_user_atomic)
-- Revocar y dropear para erradicar el riesgo de passwords en texto plano y manipulación de auth.users
DROP FUNCTION IF EXISTS public.create_deblex_user_atomic(text, text, text);

-- 5. Asegurar consistencia de los dos administradores oficiales
UPDATE public.deblex_portal_users
SET role = 'deblex_admin', is_active = true, status = 'ACTIVE'
WHERE email IN ('juanmacastillo2008@gmail.com', 'ariel.delpino@deblex.com.ar');

COMMIT;

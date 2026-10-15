-- ==============================================================================
-- MIGRATION: 20261015080000_deblex_portal_roles_and_quota.sql
-- Description:
--   Implementa el sistema seguro de roles y cuota estricta para el Portal Deblex
--   Reglas:
--     1. Tabla public.deblex_portal_users para gestionar los accesos del portal
--     2. Función atómica create_deblex_user_atomic con control transaccional de cupo:
--        Máximo 8 cuentas en total (2 administradores iniciales + máx 6 operadores adicionales).
--        El intento de crear un 7mo operador adicional (9na cuenta) queda bloqueado por excepción.
--     3. Solo administradores autorizados (deblex_admin) pueden invocar la creación.
--     4. Registro de los dos administradores oficiales:
--        - juanmacastillo2008@gmail.com (deblex_admin)
--        - ariel.delpino@deblex.com.ar (deblex_admin)
-- ==============================================================================

BEGIN;

-- 1. Tabla de usuarios autorizados del Portal Deblex
CREATE TABLE IF NOT EXISTS public.deblex_portal_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    role text NOT NULL CHECK (role IN ('deblex_admin', 'deblex_operator')),
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deblex_portal_users_email ON public.deblex_portal_users(email);
CREATE INDEX IF NOT EXISTS idx_deblex_portal_users_user_id ON public.deblex_portal_users(user_id);

-- RLS en deblex_portal_users
ALTER TABLE public.deblex_portal_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deblex users can read their own row" ON public.deblex_portal_users;
CREATE POLICY "Deblex users can read their own row"
ON public.deblex_portal_users FOR SELECT TO authenticated
USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.deblex_portal_users d
        WHERE d.user_id = auth.uid() AND d.role = 'deblex_admin' AND d.is_active = true
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

DROP POLICY IF EXISTS "Deblex admins manage portal users" ON public.deblex_portal_users;
CREATE POLICY "Deblex admins manage portal users"
ON public.deblex_portal_users FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.deblex_portal_users d
        WHERE d.user_id = auth.uid() AND d.role = 'deblex_admin' AND d.is_active = true
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.deblex_portal_users d
        WHERE d.user_id = auth.uid() AND d.role = 'deblex_admin' AND d.is_active = true
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

-- 2. Seed inicial de los dos Administradores Deblex
INSERT INTO public.deblex_portal_users (email, role, is_active)
VALUES 
    ('juanmacastillo2008@gmail.com', 'deblex_admin', true),
    ('ariel.delpino@deblex.com.ar', 'deblex_admin', true)
ON CONFLICT (email) DO UPDATE SET
    role = 'deblex_admin',
    is_active = true,
    updated_at = now();

-- 3. Función RPC atómica para creación con límite estricto de 8 usuarios
CREATE OR REPLACE FUNCTION public.create_deblex_user_atomic(
    p_email text,
    p_password text,
    p_role text DEFAULT 'deblex_operator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_email text;
    v_caller_is_admin boolean := false;
    v_current_count integer;
    v_max_allowed integer := 8; -- 2 admins iniciales + 6 operadores adicionales
    v_new_user_id uuid;
    v_clean_email text;
BEGIN
    v_caller_id := auth.uid();
    v_caller_email := LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')));
    v_clean_email := LOWER(TRIM(p_email));

    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'El correo electrónico es obligatorio';
    END IF;

    -- Validar permisos del llamador: debe ser deblex_admin en deblex_portal_users o admin global
    IF v_caller_email = 'juanmacastillo2008@gmail.com' OR v_caller_email = 'ariel.delpino@deblex.com.ar' THEN
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
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de deblex_admin para crear usuarios del portal.';
    END IF;

    -- Bloquear concurrentemente la tabla para verificar cupo con aislamiento estricto
    PERFORM 1 FROM public.deblex_portal_users FOR UPDATE;

    SELECT COUNT(*) INTO v_current_count FROM public.deblex_portal_users;

    IF v_current_count >= v_max_allowed THEN
        RAISE EXCEPTION 'Cupo alcanzado: No es posible crear más de % usuarios en el portal Deblex (2 administradores + 6 operadores adicionales).', v_max_allowed;
    END IF;

    -- Verificar si el email ya está registrado en deblex_portal_users
    IF EXISTS (SELECT 1 FROM public.deblex_portal_users WHERE email = v_clean_email) THEN
        RAISE EXCEPTION 'El correo % ya se encuentra registrado en el portal Deblex.', v_clean_email;
    END IF;

    -- Comprobar si existe en auth.users
    SELECT id INTO v_new_user_id FROM auth.users WHERE email = v_clean_email;

    IF v_new_user_id IS NULL THEN
        -- Crear el usuario en auth.users
        v_new_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud
        ) VALUES (
            v_new_user_id,
            '00000000-0000-0000-0000-000000000000',
            v_clean_email,
            crypt(p_password, gen_salt('bf')),
            now(),
            jsonb_build_object('provider', 'email', 'providers', array['email']),
            jsonb_build_object('role', p_role, 'portal', 'deblex'),
            now(),
            now(),
            'authenticated',
            'authenticated'
        );
    END IF;

    -- Registrar en deblex_portal_users
    INSERT INTO public.deblex_portal_users (
        user_id,
        email,
        role,
        is_active,
        created_by
    ) VALUES (
        v_new_user_id,
        v_clean_email,
        p_role,
        true,
        v_caller_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_new_user_id,
        'email', v_clean_email,
        'role', p_role,
        'total_users_count', v_current_count + 1,
        'max_allowed', v_max_allowed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_deblex_user_atomic(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deblex_user_atomic(text, text, text) TO authenticated;

COMMIT;

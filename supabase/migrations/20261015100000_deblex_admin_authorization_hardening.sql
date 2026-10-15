-- ==============================================================================
-- MIGRATION: 20261015100000_deblex_admin_authorization_hardening.sql
-- Description:
--   Corrección definitiva de seguridad y autorización del Portal Deblex:
--   1. Elimina completamente cualquier excepción o autorización basada en correos electrónicos hardcodeados.
--   2. Exige verificación estricta de identidad:
--      - auth.uid() verificado o caller_admin_id explícito proveniente de sesión verificada
--      - Registro en public.deblex_portal_users con:
--        * role = 'deblex_admin'
--        * is_active = true
--        * status = 'ACTIVE'
--      - Si una cuenta está suspendida o inactiva, queda INMEDIATAMENTE denegada.
--   3. RPC reserve_deblex_operator_quota redefinida con:
--      - SECURITY DEFINER y search_path = public, pg_temp estrictamente acotado.
--      - Revocación total de EXECUTE para 'anon' y 'PUBLIC'.
--      - Restricción de permisos: solo roles autorizados.
--      - Soporte para validación interna por auth.uid() y por parámetro seguro p_admin_user_id validado.
--   4. Mantenimiento inalterable de la cuota:
--      - Máximo 8 cuentas en total (2 administradores + máx 6 operadores).
--      - Cuentas ACTIVE, PENDING_INVITE, SUSPENDED consumen cupo.
--      - FAILED no consume cupo.
-- ==============================================================================

BEGIN;

-- 1. Redefinir la función con validación de identidad estricta y sin bypass de emails ni perfiles genéricos
CREATE OR REPLACE FUNCTION public.reserve_deblex_operator_quota(
    p_email text,
    p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_is_authorized boolean := false;
    v_current_count integer;
    v_max_total integer := 8; -- 2 admins iniciales + máx 6 operadores
    v_clean_email text;
    v_portal_user_id uuid;
BEGIN
    -- Determinar identidad verificada: usar auth.uid() o p_admin_user_id validado
    v_caller_id := COALESCE(auth.uid(), p_admin_user_id);

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado: Identidad no autenticada o sesión inexistente.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' OR v_clean_email NOT LIKE '%@%' THEN
        RAISE EXCEPTION 'El correo electrónico es inválido o está vacío.';
    END IF;

    -- Comprobación estricta en base de datos:
    -- Requiere obligatoriamente role = 'deblex_admin', is_active = true Y status = 'ACTIVE'
    -- CERO excepciones por correo electrónico hardcodeado.
    SELECT EXISTS (
        SELECT 1 
        FROM public.deblex_portal_users
        WHERE user_id = v_caller_id
          AND role = 'deblex_admin'
          AND is_active = true
          AND status = 'ACTIVE'
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere una cuenta de administrador Deblex activa y autorizada.';
    END IF;

    -- Bloqueo pesimista para evitar concurrencia entre administradores
    PERFORM 1 FROM public.deblex_portal_users FOR UPDATE;

    -- Contabilizar cuentas que consumen cupo (ACTIVE, PENDING_INVITE, SUSPENDED)
    SELECT COUNT(*) INTO v_current_count 
    FROM public.deblex_portal_users
    WHERE status IN ('ACTIVE', 'PENDING_INVITE', 'SUSPENDED');

    IF v_current_count >= v_max_total THEN
        RAISE EXCEPTION 'Cupo alcanzado: Se ha alcanzado el límite máximo permitido de % cuentas en el Portal Deblex (2 admins + 6 operadores).', v_max_total;
    END IF;

    -- Verificar si el correo ya existe en estado activo o pendiente
    IF EXISTS (
        SELECT 1 FROM public.deblex_portal_users 
        WHERE email = v_clean_email AND status != 'FAILED'
    ) THEN
        RAISE EXCEPTION 'El correo % ya está registrado en el portal Deblex.', v_clean_email;
    END IF;

    -- Insertar o reciclar registro en estado PENDING_INVITE
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
        created_by = v_caller_id,
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

-- 2. Eliminar la firma sobrecargada anterior de 1 argumento si existiera por separado
DROP FUNCTION IF EXISTS public.reserve_deblex_operator_quota(text);

-- 3. Endurecimiento estricto de privilegios EXECUTE:
-- Revocar a PUBLIC y a anon
REVOKE ALL ON FUNCTION public.reserve_deblex_operator_quota(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_deblex_operator_quota(text, uuid) FROM anon;

-- Solo permitir a authenticated (que valida auth.uid() internamente) y service_role
GRANT EXECUTE ON FUNCTION public.reserve_deblex_operator_quota(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_deblex_operator_quota(text, uuid) TO service_role;

-- 4. Asegurar que los dos administradores oficiales tengan estado ACTIVE e is_active = true
UPDATE public.deblex_portal_users
SET role = 'deblex_admin', is_active = true, status = 'ACTIVE'
WHERE email IN ('juanmacastillo2008@gmail.com', 'ariel.delpino@deblex.com.ar');

COMMIT;

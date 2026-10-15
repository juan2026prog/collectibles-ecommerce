-- ==============================================================================
-- MIGRATION: 20261015110000_deblex_rpc_identity_hardening.sql
-- Description:
--   Corrección Crítica de Seguridad: Eliminación Total de Suplantación de Identidad
--   1. Elimina explícitamente la sobrecarga vulnerable con 2 parámetros:
--      DROP FUNCTION public.reserve_deblex_operator_quota(text, uuid);
--   2. Define exclusivamente la firma segura con un solo parámetro comercial:
--      public.reserve_deblex_operator_quota(p_email text)
--   3. Identidad del solicitante obtenida ÚNICA y EXCLUSIVAMENTE mediante:
--      v_caller_id := auth.uid();
--      Si auth.uid() es NULL, rechazo inmediato.
--   4. Eliminación absoluta de p_admin_user_id y de COALESCE(auth.uid(), p_admin_user_id).
--   5. Validación estricta en base de datos:
--      user_id = v_caller_id AND role = 'deblex_admin' AND is_active = true AND status = 'ACTIVE'
--   6. Privilegios EXECUTE restringidos:
--      REVOKE ALL FROM PUBLIC;
--      REVOKE ALL FROM anon;
--      GRANT EXECUTE TO authenticated;
--      GRANT EXECUTE TO service_role;
-- ==============================================================================

BEGIN;

-- 1. Eliminar explícitamente la sobrecarga vulnerable de dos parámetros (text, uuid)
DROP FUNCTION IF EXISTS public.reserve_deblex_operator_quota(text, uuid);

-- 2. Eliminar cualquier otra posible sobrecarga previa de un parámetro antes de recrear limpiamente
DROP FUNCTION IF EXISTS public.reserve_deblex_operator_quota(text);

-- 3. Crear exclusivamente la firma segura de 1 parámetro (p_email text)
CREATE OR REPLACE FUNCTION public.reserve_deblex_operator_quota(
    p_email text
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
    -- La identidad proviene EXCLUSIVAMENTE del contexto verificado de sesión PostgreSQL / Supabase Auth
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado: Identidad no autenticada o sesión inexistente.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' OR v_clean_email NOT LIKE '%@%' THEN
        RAISE EXCEPTION 'El correo electrónico es inválido o está vacío.';
    END IF;

    -- Comprobación estricta en base de datos:
    -- Requiere obligatoriamente que el usuario autenticado (auth.uid()) tenga:
    -- role = 'deblex_admin', is_active = true Y status = 'ACTIVE'
    -- CERO excepciones por correo electrónico hardcodeado ni parámetros de suplantación.
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

    -- Bloqueo pesimista para evitar carreras entre múltiples administradores
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

    -- Insertar o actualizar registro en estado PENDING_INVITE
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

-- 4. Endurecimiento estricto de privilegios EXECUTE:
REVOKE ALL ON FUNCTION public.reserve_deblex_operator_quota(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_deblex_operator_quota(text) FROM anon;

GRANT EXECUTE ON FUNCTION public.reserve_deblex_operator_quota(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_deblex_operator_quota(text) TO service_role;

-- 5. Asegurar consistencia de los administradores iniciales
UPDATE public.deblex_portal_users
SET role = 'deblex_admin', is_active = true, status = 'ACTIVE'
WHERE email IN ('juanmacastillo2008@gmail.com', 'ariel.delpino@deblex.com.ar');

COMMIT;

-- Recrear la función RPC corrigiendo el nombre de columna id de vendors
CREATE OR REPLACE FUNCTION public.accept_vendor_invitation(p_token VARCHAR)
RETURNS JSON AS $$
DECLARE
    v_invite vendor_invitations%ROWTYPE;
    v_user_id UUID;
    v_vendor_id UUID;
    v_slug VARCHAR;
BEGIN
    -- 1. Buscar la invitación
    SELECT * INTO v_invite 
    FROM vendor_invitations 
    WHERE token = p_token AND status = 'pending' AND expires_at > timezone('utc'::text, now());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitación inválida o expirada';
    END IF;

    -- 2. El usuario actual (que acaba de registrarse o iniciar sesión) asume la invitación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para aceptar la invitación';
    END IF;

    -- 3. Marcar el profile como is_vendor = true
    UPDATE profiles 
    SET is_vendor = true 
    WHERE id = v_user_id;

    -- 4. Crear el registro en vendors si no existe (Corregido: id en lugar de user_id)
    SELECT id INTO v_vendor_id FROM vendors WHERE id = v_user_id;

    IF v_vendor_id IS NULL THEN
        -- Generar slug a partir del store_name
        v_slug := lower(regexp_replace(v_invite.store_name, '[^a-zA-Z0-9]+', '-', 'g'));
        
        -- Evitar duplicados de slug (simplificado)
        IF EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) THEN
            v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
        END IF;

        INSERT INTO vendors (
            id,
            store_name,
            slug,
            status,
            base_commission_rate
        ) VALUES (
            v_user_id,
            v_invite.store_name,
            v_slug,
            v_invite.initial_status,
            v_invite.base_commission_rate
        ) RETURNING id INTO v_vendor_id;
    ELSE
        -- Actualizar datos si ya existía el vendor pero estaba inactivo o desvinculado
        UPDATE vendors 
        SET 
            store_name = v_invite.store_name,
            base_commission_rate = v_invite.base_commission_rate,
            status = v_invite.initial_status
        WHERE id = v_vendor_id;
    END IF;

    -- 5. Marcar la invitación como aceptada
    UPDATE vendor_invitations 
    SET 
        status = 'accepted', 
        accepted_at = timezone('utc'::text, now()),
        vendor_id = v_vendor_id
    WHERE id = v_invite.id;

    RETURN json_build_object('success', true, 'vendor_id', v_vendor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

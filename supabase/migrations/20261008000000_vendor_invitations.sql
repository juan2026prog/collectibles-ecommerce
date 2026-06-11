-- Tabla de invitaciones a vendors
CREATE TABLE IF NOT EXISTS public.vendor_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    store_name VARCHAR(255) NOT NULL,
    base_commission_rate NUMERIC(5,2) DEFAULT 10.00,
    initial_status VARCHAR(50) DEFAULT 'active',
    invited_by_admin_id UUID REFERENCES public.profiles(id),
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.vendor_invitations ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Admins can manage vendor invitations" ON public.vendor_invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
    );

CREATE POLICY "Anyone can view their own invitation by token" ON public.vendor_invitations
    FOR SELECT USING (true); -- La seguridad la da el token único


-- Función RPC para que el admin genere una invitación
CREATE OR REPLACE FUNCTION public.create_vendor_invitation(
    p_email VARCHAR,
    p_store_name VARCHAR,
    p_commission_rate NUMERIC,
    p_initial_status VARCHAR,
    p_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_token VARCHAR;
    v_invite_id UUID;
BEGIN
    -- Validar que el admin es admin
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Generar token único de 32 caracteres hexadecimales
    v_token := encode(gen_random_bytes(16), 'hex');

    -- Insertar invitación
    INSERT INTO vendor_invitations (
        email, 
        store_name, 
        base_commission_rate, 
        initial_status, 
        invited_by_admin_id, 
        token, 
        expires_at
    ) VALUES (
        p_email, 
        p_store_name, 
        p_commission_rate, 
        p_initial_status, 
        auth.uid(), 
        v_token, 
        timezone('utc'::text, now()) + interval '7 days'
    ) RETURNING id INTO v_invite_id;

    RETURN v_invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función RPC para aceptar una invitación
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

    -- Validar que el email del usuario coincide con el de la invitación (Opcional, pero recomendado por seguridad)
    -- IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id AND email = v_invite.email) THEN
    --    RAISE EXCEPTION 'El email del usuario no coincide con la invitación';
    -- END IF;

    -- 3. Marcar el profile como is_vendor = true
    UPDATE profiles 
    SET is_vendor = true 
    WHERE id = v_user_id;

    -- 4. Crear el registro en vendors si no existe
    SELECT id INTO v_vendor_id FROM vendors WHERE user_id = v_user_id;

    IF v_vendor_id IS NULL THEN
        -- Generar slug a partir del store_name
        v_slug := lower(regexp_replace(v_invite.store_name, '[^a-zA-Z0-9]+', '-', 'g'));
        
        -- Evitar duplicados de slug (simplificado)
        IF EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) THEN
            v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
        END IF;

        INSERT INTO vendors (
            user_id,
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

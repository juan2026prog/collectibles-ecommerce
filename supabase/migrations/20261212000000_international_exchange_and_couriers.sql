-- 1. Tabla de Tipos de Cambio Dinámicos
CREATE TABLE IF NOT EXISTS public.site_exchange_rates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    currency_pair text NOT NULL UNIQUE, -- ej: 'USD_UYU'
    rate numeric(10,4) NOT NULL,
    source text NOT NULL, -- ej: 'brou_manual', 'brou_api'
    safety_buffer_percent numeric(4,2) NOT NULL DEFAULT 2.00,
    max_age_hours integer NOT NULL DEFAULT 24,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Configuración Inicial
INSERT INTO public.site_exchange_rates 
(currency_pair, rate, source, safety_buffer_percent, max_age_hours, is_active)
VALUES ('USD_UYU', 42.50, 'brou_manual', 2.00, 24, true)
ON CONFLICT (currency_pair) DO UPDATE 
SET rate = EXCLUDED.rate, source = EXCLUDED.source, safety_buffer_percent = EXCLUDED.safety_buffer_percent, max_age_hours = EXCLUDED.max_age_hours, is_active = EXCLUDED.is_active;

-- 2. Tabla de Couriers
CREATE TABLE IF NOT EXISTS public.international_couriers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL UNIQUE, -- ej: 'urubox', 'usx_cargo', 'puntomio'
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    address_line_1 text NOT NULL,
    address_line_2 text,
    city text NOT NULL,
    state text NOT NULL,
    postal_code text NOT NULL,
    country text NOT NULL DEFAULT 'US',
    phone text,
    suite_format_hint text,
    requires_suite boolean NOT NULL DEFAULT true,
    website_url text,
    tracking_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Insertar Couriers Iniciales
INSERT INTO public.international_couriers 
(code, name, address_line_1, address_line_2, city, state, postal_code, phone, suite_format_hint, requires_suite)
VALUES 
('urubox', 'Urubox', '2030 NW 95th Ave', 'Suite UY', 'Doral', 'FL', '33172', '7863140977', 'UYXXXXX', true),
('usx_cargo', 'USX Cargo', '8400 NW 25th St', 'Suite UY', 'Doral', 'FL', '33122', '3055928880', 'UYXXXXX', true),
('puntomio', 'PuntoMio', '2200 NW 129th Ave', 'Suite UY', 'Miami', 'FL', '33182', '3054772020', 'UYXXXXX', true)
ON CONFLICT (code) DO NOTHING;

-- Registrar "Otro courier" especial
INSERT INTO public.international_couriers 
(code, name, address_line_1, address_line_2, city, state, postal_code, phone, requires_suite, is_active)
VALUES 
('otro', 'Otro Courier (Requiere Aprobación)', 'Dirección pendiente de validación', '', 'Pendiente', 'FL', '00000', '', true, true)
ON CONFLICT (code) DO NOTHING;

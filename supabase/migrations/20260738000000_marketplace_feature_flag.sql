-- Add marketplace feature flag to settings
INSERT INTO public.site_settings (key, value)
VALUES ('marketplace_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.public_site_config (key, value)
VALUES ('marketplace_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

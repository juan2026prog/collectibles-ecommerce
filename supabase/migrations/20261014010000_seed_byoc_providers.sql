-- Migration: Seed UES and SoyDelivery as delivery providers
-- Date: 2026-06-14

INSERT INTO public.delivery_providers (
  provider_key,
  provider_name,
  is_active,
  environment,
  api_url,
  username,
  password_encrypted
) VALUES 
('ues', 'UES', false, 'production', 'https://api.ues.com.uy', '', ''),
('soydelivery', 'SoyDelivery', false, 'production', 'https://soydelivery.com.uy/rest', '', '')
ON CONFLICT (provider_key) DO NOTHING;

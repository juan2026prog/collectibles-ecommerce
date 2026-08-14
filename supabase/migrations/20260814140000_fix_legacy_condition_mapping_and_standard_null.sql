-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260814140000_fix_legacy_condition_mapping_and_standard_null.sql
-- Descripción: Corrección controlada de mapeo legacy "used -> used_complete".
-- Restablece condition = NULL para productos legacy cuya condición era "used" o ambigua.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Restablecer condition = NULL en producto Bonnie (ML payload indicaba "used")
UPDATE public.products 
SET condition = NULL 
WHERE id = 'c66820c2-7228-4e74-ba5e-ad3288ec5ca0';

-- 2. Restablecer condition = NULL en producto Super Skrull (Título indicaba "Loose")
UPDATE public.products 
SET condition = NULL 
WHERE id = '2c0ee182-66e3-4ba7-8964-12e367db73ae';

-- 3. Documentar en logs de auditoría
INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'fix_legacy_condition_mapping',
  'products',
  'c66820c2-7228-4e74-ba5e-ad3288ec5ca0',
  '{"reason": "Hotfix: legacy used cannot be auto-assumed as used_complete. Reset to NULL."}'::jsonb
),
(
  '00000000-0000-0000-0000-000000000000',
  'fix_legacy_condition_mapping',
  'products',
  '2c0ee182-66e3-4ba7-8964-12e367db73ae',
  '{"reason": "Hotfix: title contains Loose, reset to NULL for vendor review."}'::jsonb
);

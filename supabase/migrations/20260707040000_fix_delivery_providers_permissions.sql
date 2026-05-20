-- Migration: Fix Delivery Providers permissions
-- Restore table-level permissions so PostgreSQL SQL check passes, allowing RLS policies to evaluate correctly.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_providers TO authenticated;

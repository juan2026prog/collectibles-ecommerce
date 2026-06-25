-- Migration: Add error_message column to public.shipments table
-- Date: 2026-06-25

ALTER TABLE public.shipments 
  ADD COLUMN IF NOT EXISTS error_message TEXT;

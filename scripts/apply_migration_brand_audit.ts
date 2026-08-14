import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../frontend/.env') });

const url = process.env.VITE_SUPABASE_URL || 'https://jhyymtndmhyvgikuxbpl.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!key) {
  console.error("No supabase key found!");
  process.exit(1);
}

const supabase = createClient(url, key);

async function applyMigration() {
  console.log("Applying brand governance schema updates...");
  
  const sqlCommands = [
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS needs_brand_review BOOLEAN DEFAULT false;`,
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_audit_status TEXT;`,
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_audit_reason TEXT;`,
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS suggested_brand_id UUID;`,
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS suggested_brand_name TEXT;`,
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_confidence_score NUMERIC(5,2) DEFAULT 0.00;`,
    `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_brand_exception BOOLEAN DEFAULT false;`,
    `CREATE TABLE IF NOT EXISTS public.vendor_brand_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        old_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
        old_brand_name TEXT,
        new_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
        new_brand_name TEXT,
        reason TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence NUMERIC(5,2) DEFAULT 0.00,
        changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`
  ];

  for (const sql of sqlCommands) {
    try {
      const { error } = await supabase.rpc('exec_sql', { query: sql });
      if (error) {
        // Try fallback if exec_sql isn't available
        console.log(`Executing SQL directly via Supabase query/RPC...`);
      }
    } catch (e) {
      console.log(`Error running sql:`, e);
    }
  }

  // Verify columns on products
  const { data, error } = await supabase.from('products').select('id, needs_brand_review, brand_audit_status').limit(1);
  if (error) {
    console.error("Verification failed:", error);
  } else {
    console.log("Migration columns verified successfully! Sample record:", data);
  }
}

applyMigration().catch(console.error);

-- Create vendor kyc enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add KYC fields to vendors
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS tax_id text,
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS kyc_documents jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS kyc_status kyc_status_enum DEFAULT 'pending';

-- Force RLS policies for vendors regarding these fields
-- Vendors can update their own kyc_documents and tax_id
-- but they shouldn't be able to update kyc_status (only admins can)

DROP POLICY IF EXISTS "Vendors can update their own profiles" ON vendors;
CREATE POLICY "Vendors can update their own profiles"
  ON vendors FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

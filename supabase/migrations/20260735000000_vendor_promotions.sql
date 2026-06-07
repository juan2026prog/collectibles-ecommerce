-- Add owner_vendor_id to promotions table
-- Add stackable boolean

ALTER TABLE promotions 
ADD COLUMN IF NOT EXISTS owner_vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_stackable boolean DEFAULT false;

-- Allow vendors to create promotions
CREATE POLICY "Vendors can insert their own promotions" ON promotions
FOR INSERT WITH CHECK (owner_vendor_id IN (SELECT id FROM vendors WHERE id = auth.uid()));

CREATE POLICY "Vendors can update their own promotions" ON promotions
FOR UPDATE USING (owner_vendor_id IN (SELECT id FROM vendors WHERE id = auth.uid()));

CREATE POLICY "Vendors can delete their own promotions" ON promotions
FOR DELETE USING (owner_vendor_id IN (SELECT id FROM vendors WHERE id = auth.uid()));

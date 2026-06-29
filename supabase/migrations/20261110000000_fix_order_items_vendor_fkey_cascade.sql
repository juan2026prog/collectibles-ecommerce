-- Fix order_items_vendor_id_fkey to ON DELETE SET NULL to allow deleting vendors
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_vendor_id_fkey;
ALTER TABLE public.order_items 
  ADD CONSTRAINT order_items_vendor_id_fkey 
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) 
  ON DELETE SET NULL;

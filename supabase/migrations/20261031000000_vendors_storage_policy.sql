-- Migration to add RLS policy to public-assets storage bucket,
-- allowing vendors to manage files inside their own vendors/{user.id}/ directory.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
      AND schemaname = 'storage' 
      AND policyname = 'Vendors can manage own assets in public-assets'
  ) THEN
    CREATE POLICY "Vendors can manage own assets in public-assets" ON storage.objects
    FOR ALL
    USING (
      bucket_id = 'public-assets' AND
      auth.uid() IS NOT NULL AND
      (name LIKE 'vendors/' || auth.uid()::text || '/%') AND
      (SELECT COALESCE(is_vendor, false) FROM public.profiles WHERE id = auth.uid())
    )
    WITH CHECK (
      bucket_id = 'public-assets' AND
      auth.uid() IS NOT NULL AND
      (name LIKE 'vendors/' || auth.uid()::text || '/%') AND
      (SELECT COALESCE(is_vendor, false) FROM public.profiles WHERE id = auth.uid())
    );
  END IF;
END $$;

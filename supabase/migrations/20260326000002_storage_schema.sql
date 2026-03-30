-- Create Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('public-assets', 'public-assets', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('user-avatars', 'user-avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('private-videos', 'private-videos', false);

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 1. public-assets Policies
CREATE POLICY "Public Assets are universally readable" ON storage.objects FOR SELECT USING (bucket_id = 'public-assets');
CREATE POLICY "Admins can manage Public Assets" ON storage.objects FOR ALL USING (
  bucket_id = 'public-assets' AND 
  (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);

-- 2. product-images Policies
CREATE POLICY "Product Images are universally readable" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Admins can manage Product Images" ON storage.objects FOR ALL USING (
  bucket_id = 'product-images' AND 
  (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Vendors can insert Product Images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'product-images' AND 
  auth.uid() IS NOT NULL AND 
  (SELECT is_vendor FROM public.profiles WHERE id = auth.uid())
);

-- 3. user-avatars Policies
CREATE POLICY "User Avatars are universally readable" ON storage.objects FOR SELECT USING (bucket_id = 'user-avatars');
CREATE POLICY "Users can manage their own avatar" ON storage.objects FOR ALL USING (
  bucket_id = 'user-avatars' AND 
  auth.uid() = owner
);

-- 4. private-videos Policies
CREATE POLICY "Artists can upload Private Videos" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'private-videos' AND
  (SELECT is_artist FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Admins can manage Private Videos" ON storage.objects FOR ALL USING (
  bucket_id = 'private-videos' AND 
  (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);
-- Note: Customers reading private-videos will rely on short-lived Signed URLs generated via Edge Functions, so explicit SELECT logic on storage.objects is omitted for security.

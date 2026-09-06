-- Migration: 20270906000000_academy_article_images.sql
-- Tabla para overrides de imagen de los artículos hardcodeados de Academy
-- Permite editar las imágenes de portada desde el admin sin tocar el código

CREATE TABLE IF NOT EXISTS public.academy_article_images (
    article_id   text PRIMARY KEY,          -- Coincide con el campo `id` del array ALL_ACADEMY_ARTICLES
    image_url    text NOT NULL,             -- URL pública (Supabase Storage o externa)
    storage_path text,                      -- Path dentro del bucket public-assets (solo si se subió desde admin)
    updated_at   timestamptz DEFAULT now() NOT NULL,
    updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.academy_article_images ENABLE ROW LEVEL SECURITY;

-- Lectura pública (la página de Academy la necesita sin autenticar)
DROP POLICY IF EXISTS "Public can read academy article images" ON public.academy_article_images;
CREATE POLICY "Public can read academy article images"
    ON public.academy_article_images
    FOR SELECT USING (true);

-- Solo admins pueden insertar / actualizar / eliminar
DROP POLICY IF EXISTS "Admins can manage academy article images" ON public.academy_article_images;
CREATE POLICY "Admins can manage academy article images"
    ON public.academy_article_images
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    ));

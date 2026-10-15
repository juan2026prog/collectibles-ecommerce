-- This project has broad default grants. Restrict only the new media registry.
revoke all on table public.media_image_variants from public, anon, authenticated;
grant select on public.media_image_variants to anon, authenticated;
grant insert, update, delete on public.media_image_variants to authenticated;

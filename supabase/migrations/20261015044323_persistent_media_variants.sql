-- Public derivatives of public objects only. Originals and product selections stay unchanged.
create table public.media_image_variants (
  original_url text primary key,
  bucket_id text not null check (bucket_id in ('public-assets', 'product-images')),
  object_path text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  original_bytes bigint not null check (original_bytes > 0),
  variants jsonb not null check (jsonb_typeof(variants) = 'object'),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  check (original_url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/' || bucket_id || '/' || object_path)
);
alter table public.media_image_variants enable row level security;
grant select on public.media_image_variants to anon, authenticated;
grant insert, update, delete on public.media_image_variants to authenticated;
grant all on public.media_image_variants to service_role;
create policy media_variants_public_read on public.media_image_variants for select to anon, authenticated using (true);
create policy media_variants_authorized_write on public.media_image_variants for all to authenticated
using ((select public.is_admin()) or exists (
  select 1 from storage.objects o where o.bucket_id = media_image_variants.bucket_id
    and o.name = media_image_variants.object_path and o.owner_id = (select auth.uid())::text
))
with check ((select public.is_admin()) or exists (
  select 1 from storage.objects o where o.bucket_id = media_image_variants.bucket_id
    and o.name = media_image_variants.object_path and o.owner_id = (select auth.uid())::text
));

create function public.validate_media_image_variants() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; variant_name text;
begin
  for variant_name, item in select key, value from jsonb_each(new.variants) loop
    if jsonb_typeof(item) is distinct from 'object'
      or not (item ?& array['url','width','height','bytes'])
      or variant_name not in ('thumbnail','card','card-2x','detail')
      or coalesce(item->>'url','') not like ('https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/' || new.bucket_id || '/%/_variants/v1/%')
      or (item->>'width')::integer not between 1 and 960
      or (item->>'height')::integer < 1 or (item->>'bytes')::bigint < 1 then
      raise exception 'Invalid public image derivative';
    end if;
  end loop;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.validate_media_image_variants() from public;
create trigger validate_media_image_variants before insert or update on public.media_image_variants
for each row execute function public.validate_media_image_variants();

create function public.get_media_image_variants(urls text[])
returns setof public.media_image_variants language sql stable security invoker set search_path = '' as $$
  select * from public.media_image_variants where original_url = any(urls[1:300]);
$$;
revoke all on function public.get_media_image_variants(text[]) from public;
grant execute on function public.get_media_image_variants(text[]) to anon, authenticated, service_role;

-- Additive: no existing table, policy, function, grant or product is changed.
-- Only the service-side importer may associate a known public CDN URL with an
-- immutable byte-for-byte snapshot already registered in media_image_variants.
create table public.media_image_sources (
  source_url text primary key check (
    source_url ~ '^https://(http2[.]mlstatic[.]com/[A-Za-z0-9_./-]+[.](jpg|jpeg|png|webp)|m[.]media-amazon[.]com/images/I/[A-Za-z0-9_./+-]+[.](jpg|jpeg|png|webp))$'),
  original_url text not null references public.media_image_variants(original_url) on delete cascade,
  created_at timestamptz not null default now()
);
create index media_image_sources_original_idx on public.media_image_sources(original_url);
alter table public.media_image_sources enable row level security;
revoke all on public.media_image_sources from public, anon, authenticated;
grant select on public.media_image_sources to anon, authenticated;
grant all on public.media_image_sources to service_role;
create policy media_image_sources_public_read on public.media_image_sources
  for select to anon, authenticated using (true);

-- Separate endpoint: existing get_media_image_variants and all its callers keep
-- their previous return type, permissions and behavior. No security definer.
create function public.get_catalog_media_variants(urls text[])
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(v) from public.media_image_variants v
    where v.original_url = any(urls[1:300])
  union all
  select to_jsonb(v) || jsonb_build_object('source_url',s.source_url)
    from public.media_image_sources s join public.media_image_variants v using (original_url)
    where s.source_url = any(urls[1:300]);
$$;
revoke all on function public.get_catalog_media_variants(text[]) from public;
grant execute on function public.get_catalog_media_variants(text[]) to anon, authenticated, service_role;

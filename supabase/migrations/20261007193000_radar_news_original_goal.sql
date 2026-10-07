-- Radar / Noticias: restore original editorial objective and remove misleading images.
-- Existing generic stock/marketplace images must not be presented as official product art.

update public.release_events
set official_image_url = null,
    image_match_score = 0,
    updated_at = now()
where official_image_url ilike '%unsplash.com%'
   or official_image_url ilike '%mlstatic.com%';

insert into public.site_settings (key, value, updated_at)
values
  ('radar_auto_refresh_enabled', 'true', now()),
  ('radar_refresh_interval_days', '3', now()),
  ('radar_max_items_per_refresh', '8', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

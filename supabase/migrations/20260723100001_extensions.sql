-- Extensions needed by the LeakZon schema.
-- pgcrypto: gen_random_uuid() for primary keys.
-- postgis: geometry columns for DMA polygons (replacing the Base44 JSON-string
-- lat/lng array), enabling real spatial queries instead of the hand-rolled
-- point-in-polygon math used throughout the original Base44 functions.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

-- Shared trigger to keep updated_at current on every UPDATE, applied to every
-- table below (Base44 tracked created_date/updated_date automatically; we
-- replicate that here).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

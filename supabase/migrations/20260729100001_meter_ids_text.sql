-- Makes the IDs inside meter.additional_ids searchable.
--
-- Meter ID and Account ID are not columns — they are label/value pairs in a
-- jsonb array — so the meter table's search, which runs as ILIKE over real
-- columns in Postgres, could never see them. Searching an account number
-- returned nothing.
--
-- The obvious shortcut, indexing additional_ids::text, would also match the
-- labels: searching "account" would return every meter that has an Account ID
-- rather than the one whose account number contains it. So this extracts the
-- values only.

create or replace function public.meter_ids_text(ids jsonb)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(x->>'value', ' '), '')
  from jsonb_array_elements(coalesce(ids, '[]'::jsonb)) x
$$;

alter table public.meter
  add column if not exists ids_text text
  generated always as (public.meter_ids_text(additional_ids)) stored;

comment on column public.meter.ids_text is
  'Generated: the values (not the labels) from additional_ids, so Meter ID and '
  'Account ID are searchable. Never written to directly — project import strips it.';

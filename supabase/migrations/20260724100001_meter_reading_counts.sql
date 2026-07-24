-- Supports getProjectMeters (ported from Base44): counting consumption
-- readings per meter for a page of meters efficiently via a single grouped
-- query, rather than pulling every reading row into the Edge Function to
-- count client-side (consumption_reading can be in the millions of rows).
create or replace function public.get_meter_reading_counts(meter_ids uuid[])
returns table (meter_id uuid, reading_count bigint)
language sql
stable
as $$
  select cr.meter_id, count(*) as reading_count
  from public.consumption_reading cr
  where cr.meter_id = any(meter_ids)
  group by cr.meter_id;
$$;

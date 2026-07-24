-- Fixes a real data-correctness bug: project_stats.meter_assigned (and
-- dma_enriched.meter_count) were computed from meter.dma_id, a denormalized
-- FK populated only from the original CSV import's dma_name text match.
-- Most meters never got dma_name populated at import time, so these numbers
-- read near-zero on the dashboard even for fully-DMA'd projects — while
-- ProjectDetail.jsx's DmaPanel independently (and correctly) computes the
-- same stat client-side via point-in-polygon against dma.polygon_json.
--
-- dma.polygon_geom (a real PostGIS geometry column with a GIST index) was
-- already scaffolded in the original schema for exactly this purpose but
-- never populated or used anywhere. This migration wires it up: derive it
-- from polygon_json (kept in sync via trigger), backfill existing rows, and
-- rewrite both views to do a live spatial join instead of trusting dma_id.
-- meter.dma_id itself is left alone — this only fixes the two read-side
-- views, not that column's own semantics, to keep this change narrowly
-- scoped to the reported bug.

create or replace function public.dma_polygon_to_geom(poly jsonb)
returns extensions.geometry
language plpgsql
immutable
as $$
declare
  pts text[];
begin
  if poly is null or jsonb_typeof(poly) <> 'array' or jsonb_array_length(poly) < 3 then
    return null;
  end if;

  -- polygon_json points are stored as [lat, lng]; WKT needs "lng lat".
  select array_agg(format('%s %s', (elem->>1)::double precision, (elem->>0)::double precision) order by ord)
  into pts
  from jsonb_array_elements(poly) with ordinality as t(elem, ord);

  if pts[1] <> pts[array_length(pts, 1)] then
    pts := pts || pts[1];
  end if;

  return extensions.st_setsrid(extensions.st_geomfromtext('POLYGON((' || array_to_string(pts, ', ') || '))'), 4326);
exception when others then
  return null;
end;
$$;

create or replace function public.sync_dma_polygon_geom()
returns trigger
language plpgsql
as $$
begin
  new.polygon_geom := public.dma_polygon_to_geom(new.polygon_json);
  return new;
end;
$$;

create trigger sync_polygon_geom
  before insert or update of polygon_json on public.dma
  for each row execute function public.sync_dma_polygon_geom();

-- Backfill existing rows.
update public.dma set polygon_geom = public.dma_polygon_to_geom(polygon_json);

drop materialized view if exists public.project_stats;
drop view if exists public.dma_enriched;

create view public.dma_enriched as
select
  d.*,
  coalesce(mc.meter_count, 0) as meter_count
from public.dma d
left join lateral (
  select count(*) as meter_count
  from public.meter m
  where m.project_id = d.project_id
    and m.is_main = false
    and m.latitude is not null
    and m.longitude is not null
    and d.polygon_geom is not null
    and extensions.st_contains(d.polygon_geom, extensions.st_setsrid(extensions.st_makepoint(m.longitude, m.latitude), 4326))
) mc on true;

create materialized view public.project_stats as
select
  p.id as project_id,
  count(distinct m.id) as meter_total,
  count(distinct m.id) filter (
    where m.is_main = false
      and m.latitude is not null
      and m.longitude is not null
      and exists (
        select 1 from public.dma d
        where d.project_id = p.id
          and d.polygon_geom is not null
          and extensions.st_contains(d.polygon_geom, extensions.st_setsrid(extensions.st_makepoint(m.longitude, m.latitude), 4326))
      )
  ) as meter_assigned,
  count(distinct d.id) as dma_count
from public.project p
left join public.meter m on m.project_id = p.id
left join public.dma d on d.project_id = p.id
group by p.id;

create unique index project_stats_project_id_idx on public.project_stats (project_id);

create or replace function public.refresh_project_stats()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently public.project_stats;
$$;

-- Explicit grants (belt-and-suspenders alongside migration 100008's
-- `alter default privileges` — these objects were dropped and recreated).
grant select on public.dma_enriched to anon, authenticated, service_role;
grant select on public.project_stats to anon, authenticated, service_role;

refresh materialized view public.project_stats;

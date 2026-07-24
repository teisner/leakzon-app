-- Derived/cached data, replacing fields that Base44 stored and manually kept
-- in sync (refreshProjectStats function, Dma.meter_count, Project.num_dma).

-- Dma.meter_count (originally "sub-meters within this DMA") — exposed as a
-- view joining Dma to Meter so it's always live instead of a manually
-- recomputed stored column. Frontend reads from this instead of the raw
-- `dma` table wherever meter_count is needed.
create view public.dma_enriched as
select
  d.*,
  coalesce(m.meter_count, 0) as meter_count
from public.dma d
left join (
  select dma_id, count(*) as meter_count
  from public.meter
  where dma_id is not null and is_main = false
  group by dma_id
) m on m.dma_id = d.id;

-- ProjectStats: originally a Base44 entity manually recomputed every 30 min
-- by the refreshProjectStats function/cron workflow. Implemented as a
-- materialized view for the same "cached rollup" performance characteristic
-- at scale (projects can have 200K+ meters — see calculateConsumptionCompletion
-- / getDashboardStats), refreshed on the same schedule via pg_cron in
-- Phase 4 (recreating the RefreshDashboardStats workflow).
create materialized view public.project_stats as
select
  p.id as project_id,
  count(distinct m.id) as meter_total,
  count(distinct m.id) filter (where m.dma_id is not null and m.is_main = false) as meter_assigned,
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

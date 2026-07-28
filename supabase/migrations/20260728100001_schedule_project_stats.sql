-- Keeps the dashboard's numbers true to the data.
--
-- project_stats is a materialized view, so it only changes when something
-- refreshes it. Base44 ran a "RefreshDashboardStats" workflow every 30 minutes;
-- Phase 4 of the migration was meant to recreate that as a scheduled job and it
-- never happened. Nothing has refreshed it since except the dashboard's manual
-- "force refresh" button, so every project's card drifted from reality — Obion
-- TN was showing 4 meters and 0 assigned against 599 and 594 actually stored,
-- and a project created after the last manual refresh was missing from the view
-- altogether.
create extension if not exists pg_cron;

-- Unschedule first so re-running this is safe (cron.schedule errors on a
-- duplicate job name in older versions).
do $$
begin
  perform cron.unschedule('refresh-project-stats');
exception when others then
  null; -- not scheduled yet
end $$;

-- Every 15 minutes. refresh_project_stats() is SECURITY DEFINER and refreshes
-- CONCURRENTLY against the unique index on project_id, so readers are never
-- blocked while it runs.
select cron.schedule(
  'refresh-project-stats',
  '*/15 * * * *',
  $$select public.refresh_project_stats();$$
);

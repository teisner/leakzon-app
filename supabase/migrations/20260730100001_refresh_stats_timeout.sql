-- The dashboard's "force refresh" button could not work any more.
--
-- refresh_project_stats() does a CONCURRENT refresh of the project_stats
-- materialized view, which now takes about 13 seconds across 24 projects and
-- ~78k meters. PostgREST caps a statement well below that, so the call came
-- back as 57014 "canceling statement due to statement timeout" — reported to
-- the operator as a bare "Internal error".
--
-- A function-local statement_timeout applies for the duration of the call only,
-- so the long refresh is allowed without loosening the timeout for anything
-- else. The pg_cron job was never affected: it runs as a superuser session with
-- no such cap, which is why the scheduled 15-minute refresh kept working and
-- only the button failed.

create or replace function public.refresh_project_stats()
returns void
language sql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $function$
  refresh materialized view concurrently public.project_stats;
$function$;

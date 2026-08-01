-- Consumption readings gain a time, not just a date.
--
-- reading_date is a `date`, so a meter could hold one reading per day and no
-- more: an hourly file collapsed into 24 rows that all looked identical and
-- could not be told apart or ordered. AMI meters report hourly, so this was a
-- ceiling on the data the platform could hold at all.
--
-- reading_at is `timestamp` rather than `timestamptz` on purpose. A meter
-- reading is a wall-clock event — "01/08/2026 00:00" is midnight where the
-- meter is — and projects run in both US and Israeli time zones. Storing it
-- with a zone would shift every reading by the server's idea of local time and
-- silently move readings across day boundaries.
--
-- reading_date is kept and maintained by the trigger below rather than dropped:
-- every chart, export and aggregate in the app groups by it, and a generated
-- column cannot be added over an existing one already holding 1.8M rows.

alter table public.consumption_reading
  add column if not exists reading_at timestamp;

-- Existing readings are dated but not timed, which is exactly midnight.
--
-- The backfill is NOT in this migration. Applied to production it had to run in
-- committed batches driven by pg_cron: 1.8M rows is far more than a single
-- statement can do inside an HTTP request's lifetime, and a function looping
-- internally is one transaction that rolls back the moment the gateway gives
-- up. On a fresh database the table is empty and there is nothing to backfill;
-- to redo it on a populated one, run in batches until it reports zero:
--
--   with b as (select id from consumption_reading
--               where reading_at is null and reading_date is not null limit 250000)
--   update consumption_reading r set reading_at = r.reading_date::timestamp
--     from b where r.id = b.id;

-- Keep the date in step with the timestamp, whoever writes and however. This is
-- what lets every existing query keep working untouched while new data carries
-- a time.
create or replace function public.sync_reading_date()
returns trigger
language plpgsql
as $$
begin
  if new.reading_at is not null then
    new.reading_date := new.reading_at::date;
  elsif new.reading_date is not null then
    -- A writer that only knows about dates still gets a usable timestamp.
    new.reading_at := new.reading_date::timestamp;
  end if;
  return new;
end $$;

drop trigger if exists sync_reading_date on public.consumption_reading;
create trigger sync_reading_date
  before insert or update of reading_at, reading_date
  on public.consumption_reading
  for each row execute function public.sync_reading_date();

-- Reading a meter's series in order is the commonest query in the app, and with
-- hourly data it returns 24x what it used to.
create index if not exists consumption_reading_meter_at_idx
  on public.consumption_reading (meter_id, reading_at);

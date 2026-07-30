-- meter.location_source only allowed 'geocoded' and 'estimated', which were the
-- two ways a position could be set when the column was created. Two more were
-- added in 1.140 — 'manual' for a coordinate typed in or dragged on the map, and
-- 'field' for a Mobile Locator fix taken at the meter — and every one of those
-- saves was rejected by this constraint:
--
--   new row for relation "meter" violates check constraint
--   "meter_location_source_check"
--
-- The save paths discard the error, so the dialog closed as though it had
-- worked. Both are fixed alongside this, but the constraint is what actually
-- blocked the write.
--
-- 'generated' is included for the placeholder mains the LeakZon export invents:
-- it is only ever put in the exported row today, never stored, but a future
-- insert should not be the thing that discovers this list is too narrow.

alter table public.meter drop constraint if exists meter_location_source_check;

alter table public.meter
  add constraint meter_location_source_check
  check (location_source is null or location_source in (
    'geocoded',   -- looked up from the address
    'estimated',  -- interpolated between located meters on the same street
    'manual',     -- typed in, or moved on the map
    'field',      -- located on site with the Mobile Locator
    'generated'   -- invented for an export, not a surveyed position
  ));

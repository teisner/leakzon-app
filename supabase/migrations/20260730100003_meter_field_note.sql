-- A note from whoever went looking for the meter.
--
-- The Mobile Locator could only ever report success: a technician who walked to
-- an address and found no meter, or found it buried, or found the address wrong,
-- had nowhere to put that. The meter stayed on the list and the office learned
-- nothing, so the next person walked the same street again.
--
-- Kept on the meter rather than in a separate log: there is one open question
-- per meter — "why is this not located yet" — and the office wants to see it in
-- the meter table beside everything else. A new note replaces the old one, which
-- is what "the current state of this meter" means.

alter table public.meter
  add column if not exists field_note text,
  add column if not exists field_note_at timestamptz;

comment on column public.meter.field_note is
  'Free text from the field via the Mobile Locator — why the meter could not be '
  'located, or anything the office needs to know. Shown in the meter table.';

-- Finding the meters with an open issue has to be cheap: the table filters on it
-- and the count sits in the toolbar. Partial, so it only covers the rows that
-- have a note rather than all 78k.
create index if not exists meter_field_note_idx
  on public.meter (project_id)
  where field_note is not null;

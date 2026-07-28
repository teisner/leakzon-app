-- The Communication value written for sub-meters in the LeakZon export.
--
-- Mains are always "AMI". Sub-meters vary by utility — on a hybrid project they
-- may be AMR, manual, or a vendor's own term — so it is recorded per project
-- rather than guessed from meter.communication_type, which is blank on 75,975
-- of the 77,861 meters currently stored.
alter table public.project
  add column if not exists sub_meter_communication text;

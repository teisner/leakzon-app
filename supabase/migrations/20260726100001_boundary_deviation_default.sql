-- DMA-focus proximity default moves from 60 ft to 100 ft, matching the new
-- 0–500 ft slider range in Project Settings.
--
-- Only the column default changes: existing projects keep whatever they were
-- set to, since that value is a deliberate per-project choice.
alter table public.project
  alter column boundary_deviation_feet set default 100;

-- The DMA name a meter arrived with in its import file.
--
-- meter.dma_id is the real relationship, but it can only be set once the DMA
-- exists. On a fresh import the DMAs are created *from* these names, so the
-- name has to survive the import to be usable — otherwise the "Auto-Create
-- DMAs" step has nothing to work from, which is exactly what happened: the
-- importer reported "DMA names detected" and the dialog then found none.
--
-- This is provenance, not a denormalized copy of the relationship: it records
-- what the file said, and never changes when a DMA is renamed or reassigned.
alter table public.meter
  add column if not exists import_dma_name text;

create index if not exists meter_import_dma_name_idx
  on public.meter (project_id, import_dma_name)
  where import_dma_name is not null;

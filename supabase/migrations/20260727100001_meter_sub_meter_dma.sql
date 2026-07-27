-- A main meter sits on a boundary: it supplies one DMA (dma.main_meter_id, the
-- "Linked DMA") while physically being a consumer inside a neighbouring one.
-- This records that second relationship, which had nowhere to live before.
--
-- Deliberately a separate column from meter.dma_id: dma_id is where the meter
-- *is* for general assignment/export purposes, while this is an explicit
-- statement that the meter is metered as a sub-meter of that DMA.
alter table public.meter
  add column if not exists sub_meter_dma_id uuid references public.dma (id);

create index if not exists meter_sub_meter_dma_id_idx
  on public.meter (sub_meter_dma_id);

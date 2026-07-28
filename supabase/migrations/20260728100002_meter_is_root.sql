-- Marks a meter as a root of the network.
--
-- Named is_root to sit alongside is_main rather than a bare "root", which reads
-- ambiguously next to the tree/graph language already used by the network
-- design view.
--
-- NOT NULL with a false default: the field is a yes/no answer, and leaving it
-- nullable would reintroduce the third "unknown" state that made meter status
-- render as "N/A" for 16,371 rows before v1.086.
alter table public.meter
  add column if not exists is_root boolean not null default false;

create index if not exists meter_is_root_idx
  on public.meter (project_id) where is_root;

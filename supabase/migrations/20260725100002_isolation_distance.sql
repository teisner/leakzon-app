-- Pairing distance used by the DMA panel's "Find border valves" feature: two
-- valves on opposite sides of a shared DMA boundary are treated as a candidate
-- isolation point when they're within this distance of each other.
--
-- Stored in metres. Deliberately nullable with no default so the application can
-- fall back to a unit-aware default when it hasn't been configured: 60 m for
-- metric projects, 200 ft for imperial ones (see src/lib/isolationDistance.js).
alter table public.project
  add column if not exists isolation_distance_meters numeric;

comment on column public.project.isolation_distance_meters is
  'Valve pairing distance (metres) for "Find border valves". NULL = use the unit-aware default (60 m metric / 200 ft imperial).';

-- Project-scoped entities. Created in dependency order; Meter <-> Dma have a
-- circular relationship (Meter.dma_id / Dma.main_meter_id) so Meter is
-- created first without dma_id, then Dma, then dma_id is added by ALTER.

-- ProjectLayer: ported from base44/entities/ProjectLayer.jsonc.
-- `category` (free text in Base44) becomes layer_type_id, a real FK to the
-- layer_type lookup table. `layer_type` (shp/data) is kept as its own column
-- since it's a distinct field in the original schema (not the same concept
-- as the category lookup) — do not confuse the two.
-- feature_count / geometry_types / properties / bounds are snapshot metadata
-- captured once when the uploaded file was parsed (there is no per-feature
-- table in this schema — the GeoJSON itself lives at file_url), so unlike
-- ProjectStats these are NOT recomputable views; they stay as stored columns.
create table public.project_layer (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  name text not null,
  layer_type_id uuid references public.layer_type (id),
  layer_type text not null check (layer_type in ('shp', 'data')),
  file_url text not null,
  color text,
  icon_url text,
  is_manual boolean not null default false,
  visible boolean not null default true,
  sort_order numeric not null default 0,
  feature_count numeric not null default 0,
  geometry_types text[] not null default '{}',
  properties text[] not null default '{}',
  bounds jsonb,
  altitude_field text,
  altitude_source text check (altitude_source in ('property', 'z_coordinate')),
  altitude_unit text check (altitude_unit in ('m', 'ft')),
  pipe_config jsonb,
  point_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_layer_project_id_idx on public.project_layer (project_id);
create trigger set_updated_at before update on public.project_layer
  for each row execute function public.set_updated_at();

-- Meter: ported from base44/entities/Meter.jsonc. dma_id added after `dma`
-- exists (see below); dma_name (denormalized text) is dropped in favor of it.
create table public.meter (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  uid text not null,
  endpoint_id text,
  additional_ids jsonb not null default '[]',
  is_main boolean not null default false,
  payer_name text,
  address text,
  city text,
  state text,
  country text,
  provider text,
  communication_type text,
  diameter numeric,
  is_active boolean,
  latitude double precision,
  longitude double precision,
  altitude numeric,
  location_source text check (location_source in ('geocoded', 'estimated')),
  source_file_url text,
  layer_id uuid references public.project_layer (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meter_project_id_idx on public.meter (project_id);
create index meter_project_uid_idx on public.meter (project_id, uid);
create trigger set_updated_at before update on public.meter
  for each row execute function public.set_updated_at();

-- Dma: ported from base44/entities/Dma.jsonc. `polygon` keeps the original
-- JSON [[lat,lng],...] shape in polygon_json (so import/export code doesn't
-- need to reshape it) plus a derived PostGIS geometry column for real
-- spatial queries (point-in-polygon, area, etc.) going forward.
-- meter_count is dropped — see project_stats / dma meter count view
-- (migration 5).
create table public.dma (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  name text not null,
  color text,
  transparency numeric not null default 0.3,
  polygon_json jsonb not null,
  polygon_geom extensions.geometry(polygon, 4326),
  main_meter_id uuid references public.meter (id),
  visible boolean not null default true,
  sort_order numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dma_project_id_idx on public.dma (project_id);
create index dma_polygon_geom_idx on public.dma using gist (polygon_geom);
create trigger set_updated_at before update on public.dma
  for each row execute function public.set_updated_at();

alter table public.meter
  add column dma_id uuid references public.dma (id);
create index meter_dma_id_idx on public.meter (dma_id);

-- ConsumptionReading: ported from base44/entities/ConsumptionReading.jsonc.
-- meter_uid (denormalized) dropped in favor of meter_id join.
create table public.consumption_reading (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  meter_id uuid not null references public.meter (id) on delete cascade,
  reading_date date,
  period_label text,
  consumption numeric not null,
  source_file_url text,
  source_file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consumption_reading_project_id_idx on public.consumption_reading (project_id);
create index consumption_reading_meter_id_idx on public.consumption_reading (meter_id);
create trigger set_updated_at before update on public.consumption_reading
  for each row execute function public.set_updated_at();

-- ImportLog: ported from base44/entities/ImportLog.jsonc.
create table public.import_log (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  import_type text not null default 'consumption',
  uid_value text not null,
  row_data jsonb,
  source_file_url text,
  source_file_name text,
  error_message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index import_log_project_id_idx on public.import_log (project_id);
create trigger set_updated_at before update on public.import_log
  for each row execute function public.set_updated_at();

-- NetworkNode: ported from base44/entities/NetworkNode.jsonc.
create table public.network_node (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  node_type text not null check (node_type in ('source', 'dma', 'orphans')),
  dma_id uuid references public.dma (id),
  name text not null,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index network_node_project_id_idx on public.network_node (project_id);
create trigger set_updated_at before update on public.network_node
  for each row execute function public.set_updated_at();

-- NetworkLink: ported from base44/entities/NetworkLink.jsonc.
-- port_config kept as jsonb (was a JSON string in Base44).
create table public.network_link (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  from_node_id uuid not null references public.network_node (id) on delete cascade,
  to_node_id uuid not null references public.network_node (id) on delete cascade,
  port_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index network_link_project_id_idx on public.network_link (project_id);
create trigger set_updated_at before update on public.network_link
  for each row execute function public.set_updated_at();

-- IsolatedPoint: ported from base44/entities/IsolatedPoint.jsonc.
create table public.isolated_point (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  layer_id uuid not null references public.project_layer (id),
  latitude double precision not null,
  longitude double precision not null,
  dma1_id uuid not null references public.dma (id),
  dma2_id uuid not null references public.dma (id),
  feature_properties jsonb,
  color text not null default '#92c141',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index isolated_point_project_id_idx on public.isolated_point (project_id);
create trigger set_updated_at before update on public.isolated_point
  for each row execute function public.set_updated_at();

-- MapNote: ported from base44/entities/MapNote.jsonc.
create table public.map_note (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  note_type text not null check (note_type in ('note', 'arrow')),
  text text,
  start_lat double precision not null,
  start_lng double precision not null,
  end_lat double precision,
  end_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index map_note_project_id_idx on public.map_note (project_id);
create trigger set_updated_at before update on public.map_note
  for each row execute function public.set_updated_at();

-- CustomerAnnotation: ported from base44/entities/CustomerAnnotation.jsonc.
-- `data` kept as jsonb (was a JSON string in Base44).
create table public.customer_annotation (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  annotation_type text not null check (annotation_type in ('comment', 'arrow', 'drawing')),
  data jsonb not null,
  viewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_annotation_project_id_idx on public.customer_annotation (project_id);
create trigger set_updated_at before update on public.customer_annotation
  for each row execute function public.set_updated_at();

-- CustomerViewLink: ported from base44/entities/CustomerViewLink.jsonc.
-- created_by_name (denormalized) dropped in favor of created_by_id.
create table public.customer_view_link (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_by_id uuid references public.system_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_view_link_project_id_idx on public.customer_view_link (project_id);
create trigger set_updated_at before update on public.customer_view_link
  for each row execute function public.set_updated_at();

-- ImageOverlay: ported from base44/entities/ImageOverlay.jsonc.
create table public.image_overlay (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  name text not null,
  file_url text not null,
  bounds jsonb,
  opacity numeric not null default 0.7,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index image_overlay_project_id_idx on public.image_overlay (project_id);
create trigger set_updated_at before update on public.image_overlay
  for each row execute function public.set_updated_at();

-- ProjectProgress: ported from base44/entities/ProjectProgress.jsonc.
-- user_name (denormalized) dropped in favor of user_id. Append-only audit
-- log — no updated_at trigger needed, but the column is kept for consistency.
create table public.project_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  activity_type text not null,
  title text not null,
  description text,
  user_id uuid references public.system_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_progress_project_id_idx on public.project_progress (project_id);

-- VersionUpdate: ported from base44/entities/VersionUpdate.jsonc.
-- submitted_by_name (denormalized) dropped in favor of submitted_by_id.
create table public.version_update (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid references public.project (id) on delete set null,
  request_type text not null check (request_type in ('feature_request', 'update_existing', 'bug_report')),
  title text not null,
  description text not null,
  screenshot_url text,
  submitted_by_id uuid references public.system_user (id),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index version_update_project_id_idx on public.version_update (project_id);
create trigger set_updated_at before update on public.version_update
  for each row execute function public.set_updated_at();

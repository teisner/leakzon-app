-- Ported from base44/entities/Project.jsonc.
-- Denormalized/derived fields dropped: owner_name (join to owner), num_dma
-- (see project_stats view, Phase 1 migration 5), assigned_user_ids array
-- (replaced by the project_assignment join table below for referential
-- integrity), locked_by_name (join to system_user via locked_by_id).

create table public.project (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.owner (id),
  utility_name text not null,
  country text not null,
  city text not null,
  state text,
  latitude double precision,
  longitude double precision,
  water_unit text not null default 'm3' check (water_unit in ('m3', 'Gallons')),
  distance_unit text not null default 'Km' check (distance_unit in ('Km', 'Miles')),
  date_format text not null default 'EU' check (date_format in ('US', 'EU')),
  service_connections numeric not null default 0,
  anomaly_reports_exported boolean not null default false,
  onboarding_complete boolean not null default false,
  locked boolean not null default false,
  locked_by_id uuid references public.system_user (id),
  locked_date timestamptz,
  archived boolean not null default false,
  boundary_deviation_feet numeric not null default 60,
  completion_radius_yards numeric not null default 500,
  -- Free-text label, not a real FK — matches the original entity spec
  -- ("Free-text name... belongs to (e.g. same utility, different locations)").
  parent_project_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.project
  for each row execute function public.set_updated_at();

-- Replaces Project.assigned_user_ids (a denormalized uuid array in Base44)
-- with a real join table so membership is referentially enforced and
-- queryable in both directions.
create table public.project_assignment (
  project_id uuid not null references public.project (id) on delete cascade,
  system_user_id uuid not null references public.system_user (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, system_user_id)
);

-- Meter provider access links: a small per-project credential list (short
-- description, URL, username, password) the operator keeps under Project
-- Settings' Meter Data Permission Request section — e.g. the login for the
-- meter provider's own portal. Capped at 10 per project in the UI, not here.
create table public.project_external_link (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  description text not null,
  url text not null,
  username text,
  password text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_external_link_project_id_idx on public.project_external_link (project_id);
create trigger set_updated_at before update on public.project_external_link
  for each row execute function public.set_updated_at();

comment on table public.project_external_link is
  'Operator-facing external access links per project (e.g. meter provider portal login). Same trust boundary as the rest of the project: visible/editable to anyone with project access, stored in plain text like everything else here.';

alter table public.project_external_link enable row level security;
create policy project_external_link_project_access on public.project_external_link for all to authenticated
  using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));

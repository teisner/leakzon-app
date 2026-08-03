-- Customer signature capture: a quick test page where the customer draws a
-- signature (canvas, not typed text), gated by the same customer_view_link
-- token as the rest of the customer-facing surface (see _shared/customerToken.ts).
-- The operator turns it on per project from Project Settings.

alter table public.project
  add column if not exists signature_page_enabled boolean not null default false;

comment on column public.project.signature_page_enabled is
  'Operator has turned on the customer signature page for this project.';

create table public.customer_signature (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  signature_data text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index customer_signature_project_id_idx on public.customer_signature (project_id);

alter table public.customer_signature enable row level security;
create policy customer_signature_project_access on public.customer_signature for all to authenticated
  using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));

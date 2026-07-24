-- Authorization layer. Base44's exported functions relied almost entirely on
-- `asServiceRole` (a full database bypass) with little or no per-endpoint
-- check — this migration is the fix: every table gets Row Level Security so
-- authorization lives in Postgres itself, not ad-hoc per-function checks that
-- are easy to forget (as several of the original 25 functions did).
--
-- Auth model: system_user.id is minted as the `sub` claim of a Supabase-
-- compatible JWT by the auth-login Edge Function (Phase 1 auth work), so
-- auth.uid() below resolves directly to the calling system_user's id.
-- `user_type` is carried as a custom JWT claim.

create or replace function public.current_system_user_id()
returns uuid
language sql stable
as $$
  select auth.uid();
$$;

create or replace function public.current_user_type()
returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_type';
$$;

create or replace function public.is_admin_or_super()
returns boolean
language sql stable
as $$
  select public.current_user_type() in ('Admin', 'Super User');
$$;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql stable
as $$
  select
    public.is_admin_or_super()
    or exists (
      select 1 from public.project_assignment pa
      where pa.project_id = p_project_id
        and pa.system_user_id = public.current_system_user_id()
    );
$$;

-- system_user: a user can read their own row; Admin/Super User can read and
-- manage everyone. Password fields are only ever written by the auth-login
-- Edge Function via the service-role key (which bypasses RLS), never
-- directly by a client — no UPDATE policy is granted to regular users here
-- on purpose.
alter table public.system_user enable row level security;
create policy system_user_select on public.system_user for select to authenticated
  using (id = public.current_system_user_id() or public.is_admin_or_super());
create policy system_user_admin_write on public.system_user for all to authenticated
  using (public.is_admin_or_super()) with check (public.is_admin_or_super());

-- owner: shared reference directory, readable by any logged-in user.
alter table public.owner enable row level security;
create policy owner_select on public.owner for select to authenticated using (true);
create policy owner_admin_write on public.owner for insert to authenticated
  with check (public.is_admin_or_super());
create policy owner_admin_update on public.owner for update to authenticated
  using (public.is_admin_or_super()) with check (public.is_admin_or_super());
create policy owner_admin_delete on public.owner for delete to authenticated
  using (public.is_admin_or_super());

-- layer_type: shared lookup table, readable by any logged-in user.
alter table public.layer_type enable row level security;
create policy layer_type_select on public.layer_type for select to authenticated using (true);
create policy layer_type_admin_write on public.layer_type for insert to authenticated
  with check (public.is_admin_or_super());
create policy layer_type_admin_update on public.layer_type for update to authenticated
  using (public.is_admin_or_super()) with check (public.is_admin_or_super());
create policy layer_type_admin_delete on public.layer_type for delete to authenticated
  using (public.is_admin_or_super());

-- project: visible/editable to assigned users + Admin/Super User. No DELETE
-- policy is granted — project deletion cascades across 5+ tables and is
-- handled exclusively by the deleteProject Edge Function via service role
-- (Phase 3), not direct client access.
alter table public.project enable row level security;
create policy project_select on public.project for select to authenticated
  using (public.has_project_access(id));
create policy project_insert on public.project for insert to authenticated
  with check (public.is_admin_or_super());
create policy project_update on public.project for update to authenticated
  using (public.has_project_access(id)) with check (public.has_project_access(id));

alter table public.project_assignment enable row level security;
create policy project_assignment_select on public.project_assignment for select to authenticated
  using (public.has_project_access(project_id));
create policy project_assignment_admin_write on public.project_assignment for all to authenticated
  using (public.is_admin_or_super()) with check (public.is_admin_or_super());

-- Project-scoped entities: uniform "has_project_access(project_id)" policy.
-- Business rules beyond identity/authorization (e.g. a locked project
-- blocking writes) are enforced in the Edge Functions/application layer, not
-- here — RLS's job is "does this user belong to this project," not "is this
-- project in a state that allows edits."
do $$
declare
  t text;
begin
  foreach t in array array[
    'project_layer', 'meter', 'dma', 'consumption_reading', 'import_log',
    'network_node', 'network_link', 'isolated_point', 'map_note',
    'customer_annotation', 'customer_view_link', 'image_overlay',
    'project_progress'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_project_access(project_id)) with check (public.has_project_access(project_id))',
      t || '_project_access', t
    );
  end loop;
end $$;

-- version_update: submitters can see their own; project-scoped ones are also
-- visible to that project's team; Admin/Super User see and triage everything.
alter table public.version_update enable row level security;
create policy version_update_select on public.version_update for select to authenticated
  using (
    submitted_by_id = public.current_system_user_id()
    or (project_id is not null and public.has_project_access(project_id))
    or public.is_admin_or_super()
  );
create policy version_update_insert on public.version_update for insert to authenticated
  with check (submitted_by_id = public.current_system_user_id());
create policy version_update_admin_update on public.version_update for update to authenticated
  using (public.is_admin_or_super()) with check (public.is_admin_or_super());

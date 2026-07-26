-- Audit trail for admin "sign in as user" support logins.
--
-- Signing in as another user is deliberately a privileged backdoor (an admin
-- types the target user's email with their OWN pin) so it must leave a record —
-- otherwise there'd be no way to tell a support login from the real user's
-- activity.
create table if not exists public.impersonation_log (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_id uuid not null references public.system_user (id),
  target_id uuid not null references public.system_user (id),
  created_at timestamptz not null default now()
);

create index if not exists impersonation_log_target_idx on public.impersonation_log (target_id);
create index if not exists impersonation_log_admin_idx on public.impersonation_log (admin_id);

-- Written only by the auth-login Edge Function (service role, bypasses RLS).
-- Readable by the privileged user types; never writable from a client.
alter table public.impersonation_log enable row level security;
create policy impersonation_log_admin_select on public.impersonation_log
  for select to authenticated using (public.is_admin_or_super());

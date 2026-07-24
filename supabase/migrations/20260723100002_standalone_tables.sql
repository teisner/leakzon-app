-- Standalone/global entities: no project_id, not owned by any other table.
-- Ported from base44/entities/{LayerType,Owner,SystemUser}.jsonc.
-- (base44/entities/User.jsonc is Base44's own dashboard-role entity, unused
-- by the app's real auth model, and is intentionally not ported.)

create table public.layer_type (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.layer_type
  for each row execute function public.set_updated_at();

create table public.owner (
  id uuid primary key default extensions.gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.owner
  for each row execute function public.set_updated_at();

-- The app's real login identity (PIN-based auth), distinct from Supabase
-- Auth's own user table. id doubles as the `sub` claim in JWTs minted by the
-- auth-login Edge Function (Phase 1 auth work), so auth.uid() resolves to
-- this row's id for RLS.
create table public.system_user (
  id uuid primary key default extensions.gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  country_code text not null default '972',
  country_iso text,
  username text not null unique,
  user_type text not null default 'LeakZon'
    check (user_type in ('LeakZon', 'Super User', 'Project User', 'Admin')),
  -- bcrypt hash of the 6-digit PIN (replacing Base44's static-salt SHA-256 —
  -- see Phase 1 auth hardening decision).
  password_hash text,
  temp_password_hash text,
  temp_password_expires timestamptz,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index system_user_email_key on public.system_user (lower(email));
create trigger set_updated_at before update on public.system_user
  for each row execute function public.set_updated_at();

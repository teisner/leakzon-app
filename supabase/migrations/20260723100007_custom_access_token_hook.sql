-- Custom Access Token Hook: this project uses Supabase's asymmetric (ES256)
-- JWT signing keys, where the private key isn't exposed — so tokens can't be
-- hand-signed with a shared secret. Instead, real Supabase sessions are
-- minted (via the Admin API in the auth-login Edge Function) for a
-- system_user mirrored 1:1 into auth.users (same id), and this hook injects
-- `user_type` as a claim at token issuance/refresh time so RLS's
-- current_user_type() (see migration 20260723100006_rls.sql) can read it
-- from every access token without any extra lookup.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  v_user_type text;
begin
  select su.user_type into v_user_type
  from public.system_user su
  where su.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_type}', to_jsonb(v_user_type));
  event := jsonb_set(event, '{claims}', claims);

  return event;
end;
$$;

-- Per Supabase's Auth Hooks requirements: only the internal auth admin role
-- may execute the hook, and it needs read access to system_user despite RLS.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.system_user to supabase_auth_admin;
create policy system_user_auth_hook_select on public.system_user
  for select to supabase_auth_admin using (true);

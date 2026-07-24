-- RLS policies only filter *rows*; Postgres still requires base table-level
-- GRANTs before a role can touch a table at all. These weren't set up when
-- the tables were created, which silently broke every query from
-- service_role/authenticated (discovered via a live test: PostgREST returned
-- "permission denied for table system_user" for the service_role key even
-- though service_role bypasses RLS).

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- Ensure tables created by future migrations get the same grants
-- automatically, so this class of bug can't recur.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- Per-user default for the projects dashboard country filter.
--
-- NULL means "All Countries" (the previous, and still default, behaviour) so
-- existing users are unaffected. This only seeds the filter on load — the user
-- can still switch countries freely from the dashboard.
alter table public.system_user
  add column if not exists preferred_country text;

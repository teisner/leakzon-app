-- LeakZon is the platform-owner user type — and the default for new users —
-- so it must have global access to every project, same as Admin / Super User.
-- The original RLS port only included 'Admin' and 'Super User' in
-- is_admin_or_super(), so LeakZon users saw no projects at all ("No Projects
-- yet"). Add 'LeakZon' to the privileged set. (The function keeps its name for
-- compatibility with the ~15 policies that reference it.)
create or replace function public.is_admin_or_super()
returns boolean
language sql stable
as $$
  select public.current_user_type() in ('LeakZon', 'Admin', 'Super User');
$$;

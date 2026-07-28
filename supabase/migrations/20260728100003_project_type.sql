-- How the utility's meters are read: fully AMI, or a hybrid of AMI and manual
-- reads. It changes what "missing consumption" means for a project, so it is
-- recorded per project rather than inferred.
--
-- Nullable on purpose: the 23 existing projects predate the field and their type
-- is not known. Defaulting them all to 'AMI' would assert something untrue, so
-- they read as "not set" until someone chooses. New projects must pick one.
alter table public.project
  add column if not exists project_type text
  check (project_type is null or project_type in ('AMI', 'Hybrid'));

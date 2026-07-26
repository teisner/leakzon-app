-- Customer sign-off on the network design.
--
-- The operator turns on approval_requested from the Customer View dialog; the
-- customer then sees an "Approve this design" button in the shared view. On
-- approval the project is locked (reusing project.locked / locked_date) and the
-- approver's name + time are recorded here.
--
-- The approver is a customer, not a system_user, so locked_by_id stays null and
-- the name is free text — the UI falls back to customer_approved_by when
-- locked_by_id is absent.
alter table public.project
  add column if not exists approval_requested boolean not null default false,
  add column if not exists customer_approved_by text,
  add column if not exists customer_approved_at timestamptz;

comment on column public.project.approval_requested is
  'Operator has asked the customer to sign off the network design in the shared customer view.';
comment on column public.project.customer_approved_by is
  'Free-text name the customer gave when approving. NULL = not approved.';

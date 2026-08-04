-- customer_signature grew from a bare test signature pad into a real "Meter
-- Data Permission Request": the customer names the meter provider, their own
-- official name, and the person authorizing access (name + title), alongside
-- the drawn signature. pdf_data holds the generated permission document
-- (base64) so the operator can retrieve it later without regenerating it.

alter table public.customer_signature
  add column if not exists provider_name text not null default '',
  add column if not exists customer_official_name text not null default '',
  add column if not exists signer_name text not null default '',
  add column if not exists signer_title text not null default '',
  add column if not exists pdf_data text;

alter table public.customer_signature alter column provider_name drop default;
alter table public.customer_signature alter column customer_official_name drop default;
alter table public.customer_signature alter column signer_name drop default;
alter table public.customer_signature alter column signer_title drop default;

comment on column public.customer_signature.provider_name is
  'Meter provider company name LeakZon is being granted access to.';
comment on column public.customer_signature.customer_official_name is
  'Customer''s official/legal name, as granting the permission.';
comment on column public.customer_signature.signer_name is
  'Name of the person authorizing access on the customer''s behalf.';
comment on column public.customer_signature.signer_title is
  'Title of the person authorizing access.';
comment on column public.customer_signature.pdf_data is
  'Base64 data URI of the generated permission PDF, for later retrieval.';

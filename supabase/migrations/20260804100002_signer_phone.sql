-- Meter Data Permission Request page now also collects the authorized
-- signer's phone number (shown on the generated PDF alongside name/title).
alter table public.customer_signature
  add column if not exists signer_phone text not null default '';
alter table public.customer_signature alter column signer_phone drop default;

comment on column public.customer_signature.signer_phone is
  'Phone number of the person authorizing access.';

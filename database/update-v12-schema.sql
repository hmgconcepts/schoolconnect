-- =====================================================================
-- School Connect — UPDATE V12 SCHEMA (Enterprise Final v3)
-- Run AFTER earlier migrations. Idempotent.
-- =====================================================================

-- #5: Examination Officer identity (server-synced across devices)
alter table public.school_settings add column if not exists officer_name          text;
alter table public.school_settings add column if not exists officer_signature_url text;

select 'update-v12-schema applied ✔' as status;

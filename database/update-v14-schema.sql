-- =====================================================================
-- School Connect v3 — Schema Update v14
-- =====================================================================
-- This file is IDEMPOTENT. Run it on top of v1..v13 to:
--   1. Ensure profiles.photo_url column exists
--   2. Ensure profiles_self_update RLS policy exists
--   3. Ensure the user can always read their own profile
--   4. Create helpful index for profile lookups by role
-- =====================================================================

-- 1. photo_url column
alter table public.profiles add column if not exists photo_url text;

-- 2. profiles_self_update policy (idempotent)
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. profiles_self_read policy
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select
  using (auth.uid() = id);

-- 4. Allow staff to read all profiles
drop policy if exists "profiles_staff_read" on public.profiles;
create policy "profiles_staff_read" on public.profiles for select
  using (public.is_staff(auth.uid()));

-- 5. Allow admin to read/write all profiles
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles for all
  using (public.is_admin(auth.uid()));

-- 6. Index for fast role-based lookups
create index if not exists profiles_role_idx on public.profiles(role) where status = 'active';
create index if not exists profiles_status_idx on public.profiles(status);

-- 7. Useful RPC: returns current user's profile safely (skip if already exists)
create or replace function public.sc_current_role()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  uid uuid;
  r   jsonb;
begin
  uid := auth.uid();
  if uid is null then return null; end if;
  select jsonb_build_object(
    'id',         p.id,
    'email',      p.email,
    'full_name',  p.full_name,
    'role',       p.role,
    'status',     coalesce(p.status, 'active'),
    'photo_url',  p.photo_url
  )
  into r
  from public.profiles p
  where p.id = uid;
  return r;
end; $$;

grant execute on function public.sc_current_role() to anon, authenticated;

-- 8. v3 — exam-specific fields for the exam_registrations table
alter table public.exam_registrations add column if not exists jamb_reg_no text;
alter table public.exam_registrations add column if not exists jamb_profile_code text;
alter table public.exam_registrations add column if not exists jamb_course text;
alter table public.exam_registrations add column if not exists cambridge_urn text;
alter table public.exam_registrations add column if not exists cambridge_centre_code text;
alter table public.exam_registrations add column if not exists cambridge_syllabus text;
alter table public.exam_registrations add column if not exists ielts_type text;
alter table public.exam_registrations add column if not exists ielts_test_city text;
alter table public.exam_registrations add column if not exists ielts_id_document text;
alter table public.exam_registrations add column if not exists toefl_format text;
alter table public.exam_registrations add column if not exists toefl_reg_no text;
alter table public.exam_registrations add column if not exists toefl_native_lang text;
alter table public.exam_registrations add column if not exists sat_college_board_id text;
alter table public.exam_registrations add column if not exists sat_grad_year int;
alter table public.exam_registrations add column if not exists sat_apply_year int;

-- 9. v5 — exam-specific fields for the exam_registrations table (WAEC, NECO, NABTEB, NCEE)
alter table public.exam_registrations add column if not exists waec_pin text;
alter table public.exam_registrations add column if not exists waec_serial text;
alter table public.exam_registrations add column if not exists waec_biometric text;
alter table public.exam_registrations add column if not exists waec_trade text;
alter table public.exam_registrations add column if not exists waec_cand_type text;
alter table public.exam_registrations add column if not exists waec_sittings text;
alter table public.exam_registrations add column if not exists waec_course text;
alter table public.exam_registrations add column if not exists waec_subjects text;
alter table public.exam_registrations add column if not exists neco_token text;
alter table public.exam_registrations add column if not exists neco_pin text;
alter table public.exam_registrations add column if not exists neco_biometric text;
alter table public.exam_registrations add column if not exists neco_cand_type text;
alter table public.exam_registrations add column if not exists neco_centre_state text;
alter table public.exam_registrations add column if not exists neco_sittings text;
alter table public.exam_registrations add column if not exists neco_subjects text;
alter table public.exam_registrations add column if not exists nabteb_trade text;
alter table public.exam_registrations add column if not exists nabteb_pin text;
alter table public.exam_registrations add column if not exists nabteb_centre text;
alter table public.exam_registrations add column if not exists nabteb_cand_type text;
alter table public.exam_registrations add column if not exists nabteb_school text;
alter table public.exam_registrations add column if not exists nabteb_subjects text;
alter table public.exam_registrations add column if not exists ncee_school text;
alter table public.exam_registrations add column if not exists ncee_centre text;

-- v5 — exam_registrations table (standalone table for exam registrations with WAEC/NECO/NABTEB/NCEE fields)
create table if not exists public.exam_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  student_id uuid,
  exam_type text,                 -- WAEC, NECO, NABTEB, NCEE, JAMB, Cambridge, IELTS, TOEFL, SAT
  exam_year int,
  registration_status text,       -- pending, submitted, approved, completed
  -- WAEC fields
  waec_pin text,
  waec_serial text,
  waec_biometric_centre text,
  waec_trade_subject text,
  waec_candidate_type text,
  waec_sittings text,
  waec_intended_course text,
  waec_subjects text,
  -- NECO fields
  neco_token text,
  neco_pin text,
  neco_biometric text,
  neco_cand_type text,
  neco_centre_state text,
  neco_sittings text,
  neco_subjects text,
  -- NABTEB fields
  nabteb_trade text,
  nabteb_pin text,
  nabteb_centre text,
  nabteb_cand_type text,
  nabteb_school text,
  nabteb_subjects text,
  -- NCEE fields
  ncee_school text,
  ncee_centre text,
  -- Audit
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists exam_registrations_student_idx on public.exam_registrations (student_id);
create index if not exists exam_registrations_school_idx on public.exam_registrations (school_id);
create index if not exists exam_registrations_type_idx on public.exam_registrations (exam_type, exam_year);

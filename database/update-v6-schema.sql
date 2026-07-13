-- =====================================================================
-- School Connect — UPDATE V6 SCHEMA (Enterprise v6)
-- Run AFTER schema.sql (safe to re-run — everything is idempotent).
-- Fixes every "could not find the 'X' column ... in the schema cache"
-- error reported on live client sites, adds the V6 enterprise columns
-- and the high-concurrency CBT indexes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ASSIGNMENTS (issue 16): the app may send a 'teacher' display name.
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists teacher text;
alter table public.assignments add column if not exists posted_by uuid references public.profiles(id) on delete set null;
alter table public.assignments add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. INVENTORY (issue 26): older databases were created before item_name.
-- ---------------------------------------------------------------------
alter table public.inventory add column if not exists item_name text;
alter table public.inventory add column if not exists category text;
alter table public.inventory add column if not exists quantity int default 1;
alter table public.inventory add column if not exists location text;
alter table public.inventory add column if not exists condition text default 'good';

-- ---------------------------------------------------------------------
-- 3. LESSON PLANS (issue 32): posted_by / teacher_id backfill.
-- ---------------------------------------------------------------------
alter table public.lesson_plans add column if not exists posted_by uuid references public.profiles(id) on delete set null;
alter table public.lesson_plans add column if not exists teacher_id uuid references public.profiles(id) on delete set null;
alter table public.lesson_plans add column if not exists teacher text;

-- ---------------------------------------------------------------------
-- 4. MODULE RECORDS (issue 35): audience / recipient for in-app inbox.
-- ---------------------------------------------------------------------
alter table public.module_records add column if not exists audience text default 'private';
alter table public.module_records add column if not exists recipient_id uuid references public.profiles(id) on delete set null;
alter table public.module_records add column if not exists source text default 'manual';
alter table public.module_records add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 5. PAYROLL (issue 27): net_pay must be DATABASE-COMPUTED.
--    If the table still has the old GENERATED ALWAYS column this block
--    leaves it (it works — the app no longer sends net_pay).
--    If net_pay is a plain column, we attach the auto-compute trigger.
-- ---------------------------------------------------------------------
alter table public.payroll add column if not exists staff_name        text;
alter table public.payroll add column if not exists bonus             numeric;
alter table public.payroll add column if not exists overtime          numeric;
alter table public.payroll add column if not exists tax               numeric;
alter table public.payroll add column if not exists pension           numeric;
alter table public.payroll add column if not exists loan_deduction    numeric;
alter table public.payroll add column if not exists other_deductions  numeric;
alter table public.payroll add column if not exists method            text;

create or replace function public.payroll_autonet()
returns trigger language plpgsql as $$
begin
  -- Only fires when net_pay is a normal (non-generated) column.
  new.net_pay := coalesce(new.basic,0)+coalesce(new.allowances,0)+coalesce(new.bonus,0)+coalesce(new.overtime,0)
               - coalesce(new.tax,0)-coalesce(new.pension,0)-coalesce(new.loan_deduction,0)
               - coalesce(new.other_deductions,0)-coalesce(new.deductions,0);
  return new;
end $$;

do $$
begin
  -- attach the trigger ONLY if net_pay is not a generated column
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='payroll'
      and column_name='net_pay' and is_generated='NEVER'
  ) then
    drop trigger if exists trg_payroll_autonet on public.payroll;
    create trigger trg_payroll_autonet before insert or update on public.payroll
      for each row execute function public.payroll_autonet();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. PARENT–CHILD (issue 17): view with created_at + relationship,
--    duplicate-safe linking, easy unlinking (delete policy for admins).
-- ---------------------------------------------------------------------
alter table public.parent_child add column if not exists relationship text default 'parent';
alter table public.parent_child add column if not exists verified boolean default false;
alter table public.parent_child add column if not exists created_at timestamptz default now();

drop view if exists public.parent_child_view cascade;
create view public.parent_child_view as
  select pc.id, pc.created_at, pc.relationship, pc.verified,
         pc.parent_id, pr.full_name as parent_name, pr.email as parent_email,
         pc.student_id, st.full_name as student_name, st.class as student_class
  from public.parent_child pc
  left join public.profiles pr on pr.id = pc.parent_id
  left join public.students st on st.id = pc.student_id;
grant select on public.parent_child_view to authenticated;

-- ---------------------------------------------------------------------
-- 7. COMPLAINTS (issue 22): richer grievance workflow columns.
-- ---------------------------------------------------------------------
alter table public.complaints add column if not exists attachment_link text;
alter table public.complaints add column if not exists assigned_to     text;
alter table public.complaints add column if not exists resolution      text;
alter table public.complaints add column if not exists submitted_by    uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 8. BIRTHDAYS (issue 29): staff & parents birthdays too.
-- ---------------------------------------------------------------------
alter table public.staff    add column if not exists date_of_birth date;
alter table public.parents  add column if not exists date_of_birth date;
alter table public.birthdays add column if not exists type text default 'student';

-- ---------------------------------------------------------------------
-- 9. SCHOOL SETTINGS (issues 9, 10, 36): signature + principal name are
--    stored SERVER-SIDE so every device prints the same documents; the
--    admission prefix drives auto admission numbers (ACRONYM/YYYY/0001).
-- ---------------------------------------------------------------------
create table if not exists public.school_settings (
  id int primary key default 1,
  admission_prefix text default 'SCH',
  admission_next   int  default 1,
  staff_prefix     text default 'STF',
  staff_next       int  default 1,
  signature_url    text,
  principal_name   text,
  terms    jsonb default '["First Term","Second Term","Third Term"]'::jsonb,
  sessions jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);
alter table public.school_settings add column if not exists signature_url  text;
alter table public.school_settings add column if not exists principal_name text;
alter table public.school_settings enable row level security;
drop policy if exists "settings_read"  on public.school_settings;
drop policy if exists "settings_write" on public.school_settings;
create policy "settings_read"  on public.school_settings for select using (auth.role() = 'authenticated');
create policy "settings_write" on public.school_settings for all    using (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- 10. STUDENTS: photo link used by ID cards (issue 19) + promotion audit.
-- ---------------------------------------------------------------------
alter table public.students add column if not exists photo_url text;
alter table public.students add column if not exists status text default 'active';

-- ---------------------------------------------------------------------
-- 11. HIGH-CONCURRENCY CBT (issue 41): indexes that keep 50–200 students
--     submitting simultaneously fast on the Supabase free tier.
-- ---------------------------------------------------------------------
create index if not exists cbt_results_exam_idx    on public.cbt_results (exam_id, created_at desc);
create index if not exists cbt_results_student_idx on public.cbt_results (student_id_ref);
create index if not exists cbt_exams_code_idx      on public.cbt_exams (code);
create index if not exists cbt_exams_open_idx      on public.cbt_exams (is_open);
create index if not exists polls_status_idx        on public.polls (status, created_at desc);
create index if not exists poll_votes_poll_idx     on public.poll_votes (poll_id);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
create index if not exists fee_payments_student_idx  on public.fee_payments (student_id, created_at desc);
create index if not exists students_class_idx        on public.students (class);
create index if not exists module_records_audience_idx on public.module_records (module, audience);

-- ---------------------------------------------------------------------
-- 12. GALLERY (issue 11): ensure preview columns exist.
-- ---------------------------------------------------------------------
alter table public.gallery add column if not exists media_url  text;
alter table public.gallery add column if not exists media_type text default 'image';
alter table public.gallery add column if not exists album      text;
alter table public.gallery add column if not exists caption    text;

-- Done. Re-run schema.sql first if any earlier statement complained about
-- a missing table. This file is safe to run repeatedly.
select 'update-v6-schema applied ✔' as status;

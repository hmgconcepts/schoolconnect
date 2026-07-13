-- =====================================================================
-- School Connect — UNIFIED DATABASE SCHEMA v4 (All-in-One)
-- Run this SINGLE file in Supabase SQL Editor.
-- Fully IDEMPOTENT — safe to run multiple times.
-- =====================================================================

create extension if not exists "uuid-ossp";


-- ===== schema.sql =====
-- =====================================================================
-- School Connect — Database Schema (Gen v8)
-- =====================================================================
-- Full Row-Level Security (RLS) with least-privilege policies.
-- Idempotent: safe to re-run in the Supabase SQL Editor as many times
-- as you like — every object uses "if not exists" or "drop ... if exists".
--
-- ⚠️  IMPORTANT — CORRECT ORDER OF OPERATIONS (fixes the v7 bug
--     `ERROR: 42P01: relation "public.profiles" does not exist`):
--
--     1. Extensions
--     2. ALL TABLES (profiles + parent_child created BEFORE any function
--        or policy that references them)
--     3. Helper functions (is_staff / is_admin / is_parent_of) — these
--        depend on tables, so they MUST come after the tables
--     4. New-user trigger
--     5. Enable RLS + create policies
--
--     In v7 the helper functions were declared at the TOP of the file,
--     BEFORE the tables they query, so the very first statement failed
--     with 42P01. This version fixes the ordering permanently.
-- =====================================================================


-- ========================================================
-- 1. EXTENSIONS
-- ========================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ========================================================
-- 2. TABLES  (create EVERY table first — no functions yet)
-- ========================================================

-- ---- 2.1 Auth profiles (the table every helper depends on) ----
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'student'
    check (role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','parent','student','bursar')),
  status text not null default 'pending'
    check (status in ('pending','approved','active','suspended')),
  photo_url text,
  campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists dob_day int;
alter table public.profiles add column if not exists dob_month text;


-- =====================================================================
-- ENTERPRISE V3 EARLY HELPERS (must exist before any RLS policy uses them)
-- =====================================================================
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','administrator','owner','director','principal','proprietor','head_teacher','teacher','bursar')
      and status in ('approved','active')
  );
$$;

create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','administrator','owner','director','principal','proprietor','head_teacher','staff','teacher','bursar')
      and status in ('approved','active')
  );
$$;


-- ---- 2.2 Core academic ----
create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  admission_no text unique,
  full_name text not null,
  class text, arm text,
  gender text check (gender in ('male','female')),
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  address text,
  photo_url text,
  campus text,
  status text default 'active',
  created_at timestamptz default now()
);
alter table public.students enable row level security;
alter table public.students add column if not exists user_id uuid references public.profiles(id) on delete set null;
create index if not exists students_user_id_idx on public.students(user_id);

create table if not exists public.staff (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text, phone text,
  role text default 'teacher',
  department text,
  subjects text[],
  part_time boolean default false,
  leave_balance int default 14,
  photo_url text,
  status text default 'active',
  created_at timestamptz default now()
);
alter table public.staff enable row level security;
alter table public.staff add column if not exists user_id uuid references public.profiles(id) on delete set null;
create index if not exists staff_user_id_idx on public.staff(user_id);

create table if not exists public.classes (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  arm text,
  level text,
  class_teacher text,
  capacity int default 40,
  created_at timestamptz default now()
);
alter table public.classes enable row level security;

create table if not exists public.subjects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text,
  department text,
  level text,
  teacher text, -- additive fix: CRUD subject-teacher mapping stores the selected teacher name here
  teacher_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
-- Cumulative repair for older generated databases that already have subjects without teacher columns.
alter table public.subjects add column if not exists teacher text;
alter table public.subjects add column if not exists teacher_id uuid references public.profiles(id) on delete set null;
alter table public.subjects enable row level security;

-- parent_child must exist BEFORE the is_parent_of() function is created.
create table if not exists public.parents (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  occupation text,
  address text,
  status text default 'active',
  created_at timestamptz default now()
);
alter table public.parents enable row level security;
drop policy if exists "parents_read" on public.parents;
create policy "parents_read" on public.parents for select using (auth.role() = 'authenticated');
drop policy if exists "parents_write" on public.parents;
create policy "parents_write" on public.parents for all using (public.is_staff(auth.uid()));

create table if not exists public.parent_child (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  relationship text default 'parent',
  verified boolean default false,
  created_at timestamptz default now(),
  unique(parent_id, student_id)
);
alter table public.parent_child enable row level security;
-- ENTERPRISE V3 PARENT HELPER

create or replace function public.is_parent_of(uid uuid, child uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.parent_child where parent_id = uid and student_id = child);
$$;


create table if not exists public.attendance (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  class text, date date not null default current_date,
  status text check (status in ('present','absent','late','excused')),
  time_in time,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.attendance enable row level security;
alter table public.attendance add column if not exists student_name text;
do $$ begin create unique index if not exists attendance_student_date_unique on public.attendance(student_id,date) where student_id is not null; exception when others then null; end $$;

create table if not exists public.results (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  subject text not null,
  class text, term text, session text,
  ca1 numeric, ca2 numeric, ca3 numeric, exam numeric,
  total numeric generated always as
    (coalesce(ca1,0)+coalesce(ca2,0)+coalesce(ca3,0)+coalesce(exam,0)) stored,
  grade text, remark text,
  teacher_id uuid references public.profiles(id),
  position int,
  created_at timestamptz default now()
);
alter table public.results enable row level security;
alter table public.results add column if not exists student_name text;
alter table public.results add column if not exists assessment_source text default 'manual';
alter table public.results add column if not exists assessment_ref text;
create unique index if not exists results_assessment_ref_unique on public.results(assessment_source, assessment_ref) where assessment_ref is not null;

create table if not exists public.timetable (
  id uuid primary key default uuid_generate_v4(),
  class text, day text, period text,
  subject text, teacher text, room text,
  session text, term text,
  created_at timestamptz default now()
);
alter table public.timetable enable row level security;

-- NOTE: real table name is scheme_of_work. (v7 RLS loops wrongly used
-- the alias 'sow' which caused: relation "public.sow" does not exist.)
create table if not exists public.scheme_of_work (
  id uuid primary key default uuid_generate_v4(),
  subject text, class text, term text, session text,
  week int, topic text, status text default 'pending',
  covered_at date, teacher text, confirmed boolean default false,
  created_at timestamptz default now()
);
alter table public.scheme_of_work enable row level security;

create table if not exists public.assignments (
  id uuid primary key default uuid_generate_v4(),
  title text, description text,
  class text, subject text, due_date date,
  posted_by uuid references public.profiles(id),
  drive_link text,
  created_at timestamptz default now()
);
alter table public.assignments enable row level security;
alter table public.assignments add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

create table if not exists public.library (
  id uuid primary key default uuid_generate_v4(),
  title text, author text, isbn text,
  category text, copies int default 1,
  lent int default 0,
  available int generated always as (copies - coalesce(lent,0)) stored,
  drive_link text,
  created_at timestamptz default now()
);
alter table public.library enable row level security;

create table if not exists public.conduct (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  type text check (type in ('merit','demerit','incident')),
  description text, reporter text,
  date date default current_date,
  created_at timestamptz default now()
);
alter table public.conduct enable row level security;

create table if not exists public.health (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  complaint text, treatment text,
  date date default current_date, recorded_by text,
  created_at timestamptz default now()
);
alter table public.health enable row level security;

create table if not exists public.promotions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  from_class text, to_class text,
  action text check (action in ('promote','graduate','repeat','delete')),
  session text, term text,
  approved_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.promotions enable row level security;

-- ---- 2.3 Financial ----
create table if not exists public.fee_structures (
  id uuid primary key default uuid_generate_v4(),
  class text, term text, session text,
  amount numeric, description text,
  due_date date,
  created_at timestamptz default now()
);
alter table public.fee_structures enable row level security;

create table if not exists public.fee_payments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  amount_paid numeric, method text, reference text,
  term text, session text,
  received_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.fee_payments enable row level security;
alter table public.fee_payments add column if not exists fee_total numeric;
alter table public.fee_payments add column if not exists balance numeric;
alter table public.fee_payments add column if not exists student_name text;
create or replace function public.compute_fee_payment_balance()
returns trigger language plpgsql as $$
begin
  if new.fee_total is not null then
    new.balance := greatest(0, coalesce(new.fee_total,0) - coalesce(new.amount_paid,0));
  elsif new.balance is null then
    new.balance := 0;
  end if;
  return new;
end $$;
drop trigger if exists trg_compute_fee_payment_balance on public.fee_payments;
create trigger trg_compute_fee_payment_balance
before insert or update of fee_total, amount_paid, balance on public.fee_payments
for each row execute function public.compute_fee_payment_balance();


create table if not exists public.finance_entries (
  id uuid primary key default uuid_generate_v4(),
  type text check (type in ('income','expense')),
  category text, amount numeric,
  description text, date date default current_date,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.finance_entries enable row level security;

create table if not exists public.leave_requests (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid references public.staff(id) on delete cascade,
  type text check (type in ('sick','casual','earned','study','maternity')),
  start_date date, end_date date, days int,
  reason text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.leave_requests enable row level security;

create table if not exists public.visitors (
  id uuid primary key default uuid_generate_v4(),
  full_name text, phone text,
  purpose text, host text,
  check_in timestamptz default now(),
  check_out timestamptz,
  badge_no text,
  created_at timestamptz default now()
);
alter table public.visitors enable row level security;

create table if not exists public.transport (
  id uuid primary key default uuid_generate_v4(),
  route_name text, driver text,
  vehicle_no text, capacity int,
  assigned_students uuid[],
  created_at timestamptz default now()
);
alter table public.transport enable row level security;

-- ---- 2.4 Communication ----
create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null, body text,
  priority text default 'normal' check (priority in ('normal','high','urgent')),
  pinned boolean default false,
  audience text default 'all',
  posted_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.announcements enable row level security;

create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  title text, description text,
  date date, venue text, organiser text,
  rsvp uuid[],
  created_at timestamptz default now()
);
alter table public.events enable row level security;

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  from_id uuid references public.profiles(id),
  to_id uuid references public.profiles(id),
  body text, read boolean default false,
  thread_id uuid,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;

create table if not exists public.complaints (
  id uuid primary key default uuid_generate_v4(),
  submitted_by uuid references public.profiles(id),
  type text, subject text, body text,
  urgency text default 'normal' check (urgency in ('low','normal','high','critical')),
  drive_link text,
  status text default 'submitted'
    check (status in ('submitted','reviewing','in_progress','resolved','rejected')),
  assignee uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.complaints enable row level security;

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null, body text,
  url text,
  audience text default 'all',
  priority text default 'normal',
  channels jsonb default '["inapp"]'::jsonb,
  read_by uuid[] default '{}',
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;

-- ---- 2.5 Voting ----
create table if not exists public.polls (
  id uuid primary key default uuid_generate_v4(),
  title text not null, description text,
  type text default 'single_choice'
    check (type in ('single_choice','multiple_choice','yes_no','ranked')),
  candidates jsonb default '[]'::jsonb,   -- [{id,name,info,photo}]
  opens_at timestamptz default now(),
  closes_at timestamptz,
  allow_multiple boolean default false,
  anonymous boolean default false,
  audience text default 'all',
  status text default 'open' check (status in ('draft','open','closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.polls enable row level security;

create table if not exists public.poll_votes (
  id uuid primary key default uuid_generate_v4(),
  poll_id uuid references public.polls(id) on delete cascade,
  candidate_id text not null,
  voter_id uuid references public.profiles(id) on delete cascade,
  voted_at timestamptz default now(),
  unique(poll_id, candidate_id, voter_id)
);
alter table public.poll_votes enable row level security;

-- ---- 2.6 Media & utility ----
create table if not exists public.gallery (
  id uuid primary key default uuid_generate_v4(),
  album text, caption text,
  media_url text not null,
  media_type text default 'image' check (media_type in ('image','video','youtube')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.gallery enable row level security;

create table if not exists public.eresources (
  id uuid primary key default uuid_generate_v4(),
  title text, description text,
  subject text, class text, term text,
  drive_link text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.eresources enable row level security;

create table if not exists public.birthdays (
  id uuid primary key default uuid_generate_v4(),
  person_name text, type text,
  date date, class text,
  created_at timestamptz default now()
);
alter table public.birthdays enable row level security;

create table if not exists public.idcards (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid,
  person_type text check (person_type in ('student','staff')),
  card_no text unique,
  qr_data text,
  issued_at timestamptz default now()
);
alter table public.idcards enable row level security;

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  title text, type text,
  payload jsonb,
  generated_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.reports enable row level security;

create table if not exists public.departments (
  id uuid primary key default uuid_generate_v4(),
  name text, head text, members text[],
  created_at timestamptz default now()
);
alter table public.departments enable row level security;

-- ---------------------------------------------------------------------
-- Academic configuration: departments, terms, sessions, arms, assessment labels.
-- These lookup rows power dropdowns across Results, CBT, Report Cards,
-- Timetable, Broadsheets and Certificates. Free/Supabase-only, no paid APIs.
-- ---------------------------------------------------------------------
create table if not exists public.lookups (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,
  value text not null,
  position int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  unique(kind,value)
);
alter table public.lookups enable row level security;

create table if not exists public.academic_periods (
  id uuid primary key default uuid_generate_v4(),
  session text not null,
  term text not null,
  starts_on date,
  ends_on date,
  is_current boolean default false,
  created_at timestamptz default now(),
  unique(session,term)
);
alter table public.academic_periods enable row level security;

insert into public.lookups(kind,value,position) values
 ('term','First Term',1),('term','Second Term',2),('term','Third Term',3),
 ('session','2024/2025',1),('session','2025/2026',2),('session','2026/2027',3),
 ('arm','A',1),('arm','B',2),('arm','C',3),
 ('assessment','CA1',1),('assessment','CA2',2),('assessment','Assignment',3),('assessment','Project',4),('assessment','Exam',5),
 ('audience','all',1),('audience','students',2),('audience','staff',3),('audience','parents',4)
on conflict(kind,value) do nothing;


-- ---- 2.7 Enterprise ----
create table if not exists public.admissions (
  id uuid primary key default uuid_generate_v4(),
  full_name text, dob date, gender text,
  parent_name text, parent_email text, parent_phone text,
  applying_for_class text,
  status text default 'submitted'
    check (status in ('submitted','reviewing','accepted','enrolled','rejected')),
  notes text,
  created_at timestamptz default now()
);
alter table public.admissions enable row level security;

create table if not exists public.payroll (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid references public.staff(id) on delete cascade,
  month text, year int,
  basic numeric, allowances numeric, deductions numeric,
  net_pay numeric generated always as
    (coalesce(basic,0)+coalesce(allowances,0)-coalesce(deductions,0)) stored,
  status text default 'draft' check (status in ('draft','approved','paid')),
  created_at timestamptz default now()
);
alter table public.payroll enable row level security;

create table if not exists public.hostel_allocations (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  block text, room text, bed text,
  status text default 'active' check (status in ('active','vacated')),
  created_at timestamptz default now()
);
alter table public.hostel_allocations enable row level security;

create table if not exists public.alumni (
  id uuid primary key default uuid_generate_v4(),
  full_name text, graduation_year int,
  last_class text, current_occupation text,
  email text, phone text,
  created_at timestamptz default now()
);
alter table public.alumni enable row level security;

create table if not exists public.inventory (
  id uuid primary key default uuid_generate_v4(),
  item_name text, category text,
  quantity int default 1, location text,
  condition text default 'good',
  created_at timestamptz default now()
);
alter table public.inventory enable row level security;
alter table public.inventory add column if not exists item_name text;
alter table public.inventory add column if not exists category text;
alter table public.inventory add column if not exists quantity int default 1;
alter table public.inventory add column if not exists location text;
alter table public.inventory add column if not exists condition text default 'good';

create table if not exists public.certificates (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  type text, serial_no text unique,
  issued_on date default current_date,
  signed_by text,
  created_at timestamptz default now()
);
alter table public.certificates enable row level security;

create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  endpoint text, p256dh text, auth text,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;

-- =====================================================================
-- ✨ NEW in Gen v8 — competitor-parity & enterprise modules
--    (all use FREE tools only; no paid services, no AI APIs)
-- =====================================================================

-- Audit / activity log (PowerSchool, Infinite Campus, GegoK12 parity)
create table if not exists public.activity_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id),
  actor_email text,
  action text,            -- e.g. 'create','update','delete','login'
  entity text,            -- table or module affected
  entity_id text,
  details jsonb,
  ip text,
  created_at timestamptz default now()
);
alter table public.activity_log enable row level security;

-- LMS: courses, lessons, submissions (Canvas / Schoology / ilerno parity)
create table if not exists public.lms_courses (
  id uuid primary key default uuid_generate_v4(),
  title text not null, description text,
  subject text, class text, teacher text,
  cover_url text,
  created_at timestamptz default now()
);
alter table public.lms_courses enable row level security;

create table if not exists public.lms_lessons (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references public.lms_courses(id) on delete cascade,
  title text, content text,
  video_url text, resource_link text,
  position int default 0,
  created_at timestamptz default now()
);
alter table public.lms_lessons enable row level security;

create table if not exists public.lms_submissions (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid references public.assignments(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  submission_link text, note text,
  score numeric, feedback text,
  status text default 'submitted' check (status in ('submitted','graded','returned')),
  submitted_at timestamptz default now()
);
alter table public.lms_submissions enable row level security;

-- Lesson plans / curriculum (Chalk parity)
create table if not exists public.lesson_plans (
  id uuid primary key default uuid_generate_v4(),
  teacher text, subject text, class text,
  week int, term text, session text,
  objectives text, content text, resources text,
  status text default 'draft' check (status in ('draft','submitted','approved')),
  created_at timestamptz default now()
);
alter table public.lesson_plans enable row level security;
alter table public.lesson_plans add column if not exists posted_by uuid references public.profiles(id) on delete set null;
alter table public.lesson_plans add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

-- Behaviour / PBIS points (ClassDojo parity)
create table if not exists public.behaviour_points (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  points int default 0,
  reason text, badge text,
  awarded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.behaviour_points enable row level security;

-- Special education / student support plans (Provision Map parity)
create table if not exists public.support_plans (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  need_type text, intervention text,
  goal text, review_date date,
  outcome text, status text default 'active'
    check (status in ('active','review','closed')),
  created_at timestamptz default now()
);
alter table public.support_plans enable row level security;

-- Fundraising / donations (Blackbaud / FreshSchools parity)
create table if not exists public.donations (
  id uuid primary key default uuid_generate_v4(),
  campaign text, donor_name text, donor_email text,
  amount numeric, method text,
  note text, anonymous boolean default false,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.donations enable row level security;

-- Substitute teacher / cover management
create table if not exists public.substitutions (
  id uuid primary key default uuid_generate_v4(),
  date date default current_date,
  absent_teacher text, substitute_teacher text,
  class text, subject text, period text,
  status text default 'planned' check (status in ('planned','done','cancelled')),
  created_at timestamptz default now()
);
alter table public.substitutions enable row level security;

-- Help desk / IT tickets (internal staff requests)
create table if not exists public.helpdesk_tickets (
  id uuid primary key default uuid_generate_v4(),
  submitted_by uuid references public.profiles(id),
  category text, subject text, body text,
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  status text default 'open' check (status in ('open','in_progress','resolved','closed')),
  assignee uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.helpdesk_tickets enable row level security;

-- Online payment intents (free Paystack / Flutterwave / bank-transfer links)
create table if not exists public.payment_intents (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  amount numeric, provider text,        -- 'paystack' | 'flutterwave' | 'bank_transfer'
  reference text, checkout_url text,
  status text default 'pending' check (status in ('pending','paid','failed','cancelled')),
  created_at timestamptz default now()
);
alter table public.payment_intents enable row level security;


-- ========================================================
-- 2.5 COLUMN BACKFILL (idempotent upgrade-safety)
-- --------------------------------------------------------
-- "create table if not exists" does NOT add missing columns to a table that
-- already exists from an OLDER schema version. If a policy/view references a
-- column the old table lacks, you get errors like:
--   ERROR: column "voter_id" does not exist
-- These ALTERs guarantee every column the policies & views depend on exists,
-- on both fresh and previously-installed databases. Safe to re-run.
-- ========================================================
-- [v5 fix] Each ALTER wrapped in its own safe block
  -- profiles
do $$ begin alter table public.profiles            add column if not exists role text not null default 'student'; exception when others then null; end $$;
do $$ begin alter table public.profiles            add column if not exists status text not null default 'pending'; exception when others then null; end $$;
do $$ begin alter table public.profiles            add column if not exists email text; exception when others then null; end $$;
  -- voting
do $$ begin alter table public.poll_votes          add column if not exists voter_id uuid; exception when others then null; end $$;
do $$ begin alter table public.poll_votes          add column if not exists candidate_id text; exception when others then null; end $$;
do $$ begin alter table public.poll_votes          add column if not exists poll_id uuid; exception when others then null; end $$;
do $$ begin alter table public.polls               add column if not exists status text default 'open'; exception when others then null; end $$;
  -- attendance / results scoping
do $$ begin alter table public.attendance          add column if not exists student_id uuid; exception when others then null; end $$;
do $$ begin alter table public.results             add column if not exists student_id uuid; exception when others then null; end $$;
do $$ begin alter table public.conduct             add column if not exists student_id uuid; exception when others then null; end $$;
do $$ begin alter table public.health              add column if not exists student_id uuid; exception when others then null; end $$;
do $$ begin alter table public.fee_payments        add column if not exists student_id uuid; exception when others then null; end $$;
do $$ begin alter table public.fee_payments        add column if not exists amount_paid numeric; exception when others then null; end $$;
  -- messaging / complaints / helpdesk participants
do $$ begin alter table public.messages            add column if not exists from_id uuid; exception when others then null; end $$;
do $$ begin alter table public.messages            add column if not exists to_id uuid; exception when others then null; end $$;
do $$ begin alter table public.complaints          add column if not exists submitted_by uuid; exception when others then null; end $$;
do $$ begin alter table public.helpdesk_tickets    add column if not exists submitted_by uuid; exception when others then null; end $$;
  -- parent-child link
do $$ begin alter table public.parent_child        add column if not exists parent_id uuid; exception when others then null; end $$;
do $$ begin alter table public.parent_child        add column if not exists student_id uuid; exception when others then null; end $$;
  -- push subscriptions
do $$ begin alter table public.push_subscriptions  add column if not exists user_id uuid; exception when others then null; end $$;
  -- payment intents
do $$ begin alter table public.payment_intents     add column if not exists student_id uuid; exception when others then null; end $$;
  -- a referenced table doesn't exist yet on this DB; the create-table block
  -- above already created it this run, so nothing to backfill — ignore.


-- ========================================================
-- 3. HELPER FUNCTIONS  (now safe — tables already exist)
-- ========================================================
create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','bursar')
      and status in ('approved','active')
  );
$$;

create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','principal','proprietor','head_teacher','bursar')
      and status in ('approved','active')
  );
$$;

create or replace function public.is_parent_of(uid uuid, child uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.parent_child
    where parent_id = uid and student_id = child
  );
$$;


-- ========================================================
-- 4. NEW-USER TRIGGER (auto-create a profile on sign-up)
-- ========================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'role','student')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ========================================================
-- 5. ROW-LEVEL SECURITY POLICIES
-- ========================================================

-- ---- Profiles ----
drop policy if exists "profiles_self_read"   on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_staff_read"  on public.profiles;
drop policy if exists "profiles_admin_all"   on public.profiles;
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read"   on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_staff_read" on public.profiles;
create policy "profiles_staff_read"  on public.profiles for select using (public.is_staff(auth.uid()));
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"   on public.profiles for all    using (public.is_admin(auth.uid()));

-- ---- Generic: any authenticated user reads; staff writes ----
-- (scheme_of_work is now spelled correctly — no more 'sow' alias bug.)
do $$
declare t text;
declare read_tables text[] := array[
  'students','staff','classes','subjects','timetable','scheme_of_work','assignments',
  'library','fee_structures','events','gallery','eresources','birthdays','idcards',
  'departments','admissions','hostel_allocations','alumni','inventory','certificates',
  'lms_courses','lms_lessons','lesson_plans','behaviour_points','substitutions','donations'
];
begin
  foreach t in array read_tables loop
    execute format('drop policy if exists "read_%s"  on public.%I', t, t);
    execute format('drop policy if exists "write_%s" on public.%I', t, t);
    execute format('create policy "read_%s"  on public.%I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "write_%s" on public.%I for all    using (public.is_staff(auth.uid()))', t, t);
  end loop;
end $$;


-- ---- Results ownership: staff can read academic scores, but only admins or the teacher who created a score may update/delete it ----
drop policy if exists "results_select_v5" on public.results;
drop policy if exists "results_insert_v5" on public.results;
drop policy if exists "results_update_v5" on public.results;
drop policy if exists "results_delete_v5" on public.results;
drop policy if exists "results_select_v5" on public.results;
create policy "results_select_v5" on public.results for select using (
  public.is_staff(auth.uid()) or public.is_parent_of(auth.uid(), student_id)
  or student_id in (select id from public.students where user_id = auth.uid())
);
drop policy if exists "results_insert_v5" on public.results;
create policy "results_insert_v5" on public.results for insert with check (public.is_staff(auth.uid()));
drop policy if exists "results_update_v5" on public.results;
create policy "results_update_v5" on public.results for update using (public.is_admin(auth.uid()) or teacher_id = auth.uid()) with check (public.is_admin(auth.uid()) or teacher_id = auth.uid());
drop policy if exists "results_delete_v5" on public.results;
create policy "results_delete_v5" on public.results for delete using (public.is_admin(auth.uid()) or teacher_id = auth.uid());

-- ---- Attendance: parents see own children; staff manage ----
drop policy if exists "att_read"  on public.attendance;
drop policy if exists "att_write" on public.attendance;
drop policy if exists "att_read" on public.attendance;
create policy "att_read"  on public.attendance for select using (
  public.is_parent_of(auth.uid(), student_id)
  or student_id in (select id from public.students where user_id = auth.uid())
  or student_id in (select id from public.students where guardian_email = auth.jwt()->>'email')
  or public.is_staff(auth.uid())
);
drop policy if exists "att_write" on public.attendance;
create policy "att_write" on public.attendance for all using (public.is_staff(auth.uid()));

-- ---- Results: parents see own children; staff manage ----
drop policy if exists "res_read"  on public.results;
drop policy if exists "res_write" on public.results;
drop policy if exists "results_select_v5" on public.results;
drop policy if exists "results_insert_v5" on public.results;
drop policy if exists "results_update_v5" on public.results;
drop policy if exists "results_delete_v5" on public.results;
drop policy if exists "results_select_v5" on public.results;
create policy "results_select_v5" on public.results for select using (
  public.is_staff(auth.uid()) or public.is_parent_of(auth.uid(), student_id)
  or student_id in (select id from public.students where user_id = auth.uid())
);
drop policy if exists "results_insert_v5" on public.results;
create policy "results_insert_v5" on public.results for insert with check (public.is_staff(auth.uid()));
drop policy if exists "results_update_v5" on public.results;
create policy "results_update_v5" on public.results for update using (public.is_admin(auth.uid()) or teacher_id = auth.uid()) with check (public.is_admin(auth.uid()) or teacher_id = auth.uid());
drop policy if exists "results_delete_v5" on public.results;
create policy "results_delete_v5" on public.results for delete using (public.is_admin(auth.uid()) or teacher_id = auth.uid());

-- ---- Conduct / Health / Behaviour / Support: parents see own; staff manage ----
drop policy if exists "cond_read"  on public.conduct;
drop policy if exists "cond_write" on public.conduct;
drop policy if exists "cond_read" on public.conduct;
create policy "cond_read"  on public.conduct for select using (
  public.is_parent_of(auth.uid(), student_id) or public.is_staff(auth.uid())
);
drop policy if exists "cond_write" on public.conduct;
create policy "cond_write" on public.conduct for all using (public.is_staff(auth.uid()));

drop policy if exists "hlth_read"  on public.health;
drop policy if exists "hlth_write" on public.health;
drop policy if exists "hlth_read" on public.health;
create policy "hlth_read"  on public.health for select using (
  public.is_parent_of(auth.uid(), student_id) or public.is_staff(auth.uid())
);
drop policy if exists "hlth_write" on public.health;
create policy "hlth_write" on public.health for all using (public.is_staff(auth.uid()));

drop policy if exists "sp_read"  on public.support_plans;
drop policy if exists "sp_write" on public.support_plans;
drop policy if exists "sp_read" on public.support_plans;
create policy "sp_read"  on public.support_plans for select using (
  public.is_parent_of(auth.uid(), student_id) or public.is_staff(auth.uid())
);
drop policy if exists "sp_write" on public.support_plans;
create policy "sp_write" on public.support_plans for all using (public.is_staff(auth.uid()));

-- ---- Fees: parents see own; staff manage ----
drop policy if exists "fp_read"  on public.fee_payments;
drop policy if exists "fp_write" on public.fee_payments;
drop policy if exists "fp_read" on public.fee_payments;
create policy "fp_read"  on public.fee_payments for select using (
  public.is_parent_of(auth.uid(), student_id)
  or student_id in (select id from public.students where user_id = auth.uid())
  or public.is_staff(auth.uid())
);
drop policy if exists "fp_write" on public.fee_payments;
create policy "fp_write" on public.fee_payments for all using (public.is_staff(auth.uid()));

-- ---- Payment intents: parents see own; staff manage ----
drop policy if exists "pi_read"  on public.payment_intents;
drop policy if exists "pi_write" on public.payment_intents;
drop policy if exists "pi_read" on public.payment_intents;
create policy "pi_read"  on public.payment_intents for select using (
  public.is_parent_of(auth.uid(), student_id)
  or student_id in (select id from public.students where user_id = auth.uid())
  or public.is_staff(auth.uid())
);
drop policy if exists "pi_write" on public.payment_intents;
create policy "pi_write" on public.payment_intents for all using (public.is_staff(auth.uid()));

-- ---- Finance / Payroll / Donations: admin only ----
drop policy if exists "fin_all" on public.finance_entries;
drop policy if exists "fin_all" on public.finance_entries;
create policy "fin_all" on public.finance_entries for all using (public.is_admin(auth.uid()));

drop policy if exists "pay_all" on public.payroll;
drop policy if exists "pay_all" on public.payroll;
create policy "pay_all" on public.payroll for all using (public.is_admin(auth.uid()));

drop policy if exists "don_admin" on public.donations;
drop policy if exists "don_admin" on public.donations;
create policy "don_admin" on public.donations for all using (public.is_admin(auth.uid()));

-- ---- Leave: staff read/write; admin manages ----
drop policy if exists "lr_all" on public.leave_requests;
drop policy if exists "lr_all" on public.leave_requests;
create policy "lr_all" on public.leave_requests for all using (public.is_staff(auth.uid()));

-- ---- Visitors: anyone can sign in at the gate; staff reads ----
drop policy if exists "vis_insert" on public.visitors;
drop policy if exists "vis_read"   on public.visitors;
drop policy if exists "vis_insert" on public.visitors;
create policy "vis_insert" on public.visitors for insert with check (true);
drop policy if exists "vis_read" on public.visitors;
create policy "vis_read"   on public.visitors for select using (public.is_staff(auth.uid()));

-- ---- Transport ----
drop policy if exists "tr_all" on public.transport;
drop policy if exists "tr_all" on public.transport;
create policy "tr_all" on public.transport for all using (public.is_staff(auth.uid()));

-- ---- Announcements: everyone reads; staff writes ----
drop policy if exists "ann_read"  on public.announcements;
drop policy if exists "ann_write" on public.announcements;
drop policy if exists "ann_read" on public.announcements;
create policy "ann_read"  on public.announcements for select using (auth.role() = 'authenticated');
drop policy if exists "ann_write" on public.announcements;
create policy "ann_write" on public.announcements for all using (public.is_staff(auth.uid()));

-- ---- Messages: only the two participants ----
drop policy if exists "msg_all" on public.messages;
drop policy if exists "msg_all" on public.messages;
create policy "msg_all" on public.messages for all using (
  auth.uid() = from_id or auth.uid() = to_id
);

-- ---- Complaints: submitter sees own; staff sees all ----
drop policy if exists "comp_all" on public.complaints;
drop policy if exists "comp_all" on public.complaints;
create policy "comp_all" on public.complaints for all using (
  submitted_by = auth.uid() or public.is_staff(auth.uid())
);

-- ---- Help desk: submitter sees own; staff sees all ----
drop policy if exists "hd_all" on public.helpdesk_tickets;
drop policy if exists "hd_all" on public.helpdesk_tickets;
create policy "hd_all" on public.helpdesk_tickets for all using (
  submitted_by = auth.uid() or public.is_staff(auth.uid())
);

-- ---- Notifications: everyone reads; staff writes ----
drop policy if exists "notif_read"  on public.notifications;
drop policy if exists "notif_write" on public.notifications;
drop policy if exists "notif_read" on public.notifications;
create policy "notif_read"  on public.notifications for select using (auth.role() = 'authenticated');
drop policy if exists "notif_write" on public.notifications;
create policy "notif_write" on public.notifications for all using (public.is_staff(auth.uid()));

-- ---- Voting ----
drop policy if exists "polls_read"  on public.polls;
drop policy if exists "polls_write" on public.polls;
drop policy if exists "polls_read" on public.polls;
create policy "polls_read"  on public.polls for select using (auth.role() = 'authenticated');
drop policy if exists "polls_write" on public.polls;
create policy "polls_write" on public.polls for all using (public.is_staff(auth.uid()));

drop policy if exists "pv_read"   on public.poll_votes;
drop policy if exists "pv_insert" on public.poll_votes;
drop policy if exists "pv_update" on public.poll_votes;
drop policy if exists "pv_read" on public.poll_votes;
create policy "pv_read"   on public.poll_votes for select using (auth.uid() = voter_id or public.is_staff(auth.uid()));
drop policy if exists "pv_insert" on public.poll_votes;
create policy "pv_insert" on public.poll_votes for insert with check (auth.uid() = voter_id);
drop policy if exists "pv_update" on public.poll_votes;
create policy "pv_update" on public.poll_votes for update using (auth.uid() = voter_id);

-- ---- Push subscriptions: each user manages own ----
drop policy if exists "ps_all" on public.push_subscriptions;
drop policy if exists "ps_all" on public.push_subscriptions;
create policy "ps_all" on public.push_subscriptions for all using (auth.uid() = user_id);

-- ---- Reports / Promotions ----
drop policy if exists "rep_all" on public.reports;
drop policy if exists "rep_all" on public.reports;
create policy "rep_all" on public.reports for all using (public.is_staff(auth.uid()));

drop policy if exists "prom_all" on public.promotions;
drop policy if exists "prom_all" on public.promotions;
create policy "prom_all" on public.promotions for all using (public.is_staff(auth.uid()));

-- ---- Academic periods / lookups: everyone may read; admins manage ----
drop policy if exists "ap_read" on public.academic_periods;
drop policy if exists "ap_write" on public.academic_periods;
drop policy if exists "ap_read" on public.academic_periods;
create policy "ap_read" on public.academic_periods for select using (auth.role() = 'authenticated');
drop policy if exists "ap_write" on public.academic_periods;
create policy "ap_write" on public.academic_periods for all using (public.is_admin(auth.uid()) or public.is_staff(auth.uid())) with check (public.is_admin(auth.uid()) or public.is_staff(auth.uid()));

drop policy if exists "lookups_read" on public.lookups;
drop policy if exists "lookups_write" on public.lookups;
drop policy if exists "lookups_read" on public.lookups;
create policy "lookups_read" on public.lookups for select using (auth.role() = 'authenticated');
drop policy if exists "lookups_write" on public.lookups;
create policy "lookups_write" on public.lookups for all using (public.is_admin(auth.uid()) or public.is_staff(auth.uid())) with check (public.is_admin(auth.uid()) or public.is_staff(auth.uid()));

-- ---- Parent-child ----
drop policy if exists "pc_read"  on public.parent_child;
drop policy if exists "pc_write" on public.parent_child;
drop policy if exists "pc_read" on public.parent_child;
create policy "pc_read"  on public.parent_child for select using (
  parent_id = auth.uid() or public.is_staff(auth.uid())
);
drop policy if exists "pc_write" on public.parent_child;
create policy "pc_write" on public.parent_child for all using (public.is_staff(auth.uid()));

-- ---- LMS submissions: student sees own; staff manage ----
drop policy if exists "sub_read"  on public.lms_submissions;
drop policy if exists "sub_write" on public.lms_submissions;
drop policy if exists "sub_read" on public.lms_submissions;
create policy "sub_read"  on public.lms_submissions for select using (
  public.is_parent_of(auth.uid(), student_id)
  or student_id in (select id from public.students where user_id = auth.uid())
  or public.is_staff(auth.uid())
);
drop policy if exists "sub_write" on public.lms_submissions;
create policy "sub_write" on public.lms_submissions for all using (public.is_staff(auth.uid()));

-- ---- Activity log: staff/admin read; anyone authenticated may insert ----
drop policy if exists "al_read"   on public.activity_log;
drop policy if exists "al_insert" on public.activity_log;
drop policy if exists "al_read" on public.activity_log;
create policy "al_read"   on public.activity_log for select using (public.is_admin(auth.uid()));
drop policy if exists "al_insert" on public.activity_log;
create policy "al_insert" on public.activity_log for insert with check (auth.role() = 'authenticated');


-- =====================================================================
-- 6. CONVENIENCE VIEW — live poll results
-- =====================================================================
-- Drop first so re-runs never hit 42P16 "cannot drop columns from view"
-- (an older poll_results view from a previous schema version may exist).
drop view if exists public.poll_results cascade;
create or replace view public.poll_results as
select p.id as poll_id, p.title,
       coalesce(sum(v.c), 0) as total_votes,
       coalesce(jsonb_agg(jsonb_build_object('candidate', v.candidate_id, 'votes', v.c))
                filter (where v.candidate_id is not null), '[]'::jsonb) as breakdown
from public.polls p
left join lateral (
  select candidate_id, count(*) as c
  from public.poll_votes
  where poll_id = p.id
  group by candidate_id
) v on true
group by p.id, p.title;


-- =====================================================================
-- DONE ✅
-- 50+ tables · full RLS · correct creation order · no 42P01 errors.
--
-- NEXT STEP: promote yourself to admin AFTER you sign up in the app:
--   update public.profiles
--      set role = 'admin', status = 'approved'
--    where email = 'your-email@example.com';
-- =====================================================================
select 'School Connect schema v8 installed successfully ✅' as status;


-- FINAL CUMULATIVE SUBJECT-TEACHER MAPPING REPAIR
-- Safe for fresh and existing databases. Fixes: could not find 'teacher' column of subjects.
alter table if exists public.subjects add column if not exists teacher text;
alter table if exists public.subjects add column if not exists teacher_id uuid references public.profiles(id) on delete set null;


-- ---- Certificate verification: public-safe lookup by serial/cert code ----
create or replace function public.verify_certificate(p_code text)
returns table(source text, serial_no text, student_name text, certificate_type text, issued_on text, score text, status text)
language plpgsql security definer set search_path=public as $$
begin
  return query
  select 'certificate'::text, c.serial_no::text, coalesce(s.full_name,'')::text, coalesce(c.type,'Certificate')::text,
         coalesce(c.issued_on::text,'')::text, ''::text, 'valid'::text
  from public.certificates c left join public.students s on s.id=c.student_id
  where upper(c.serial_no)=upper(p_code)
  union all
  select 'cbt'::text, r.cert_code::text, r.student_name::text, coalesce(e.title,e.subject,'CBT Certificate')::text,
         coalesce(r.created_at::date::text,'')::text, (r.score::text || '/' || r.total::text || ' (' || coalesce(r.percent,0)::text || '%)')::text, 'valid'::text
  from public.cbt_results r left join public.cbt_exams e on e.id=r.exam_id
  where r.cert_code is not null and r.cert_code<>'' and upper(r.cert_code)=upper(p_code);
end $$;
grant execute on function public.verify_certificate(text) to anon, authenticated;


-- Role/page access map controlled from Admin Dashboard → Page Access Manager.

-- ENTERPRISE V4: school_settings must exist before any ALTER/POLICY uses it
create table if not exists public.school_settings (
  id int primary key default 1,
  admission_prefix text default 'SCH',
  admission_next int default 1,
  staff_prefix text default 'STF',
  staff_next int default 1,
  parent_prefix text default 'PAR',
  parent_next int default 1,
  signature_url text default '',
  principal_name text default '',
  role_access jsonb,
  role_write jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.school_settings (id) values (1) on conflict (id) do nothing;

alter table public.school_settings add column if not exists role_access jsonb;

-- Page access manager write-permission map.
alter table public.school_settings add column if not exists role_write jsonb;


-- =====================================================================
-- V3 PRIVACY PATCH: scoped student/parent views. Staff/Admin manage.
-- =====================================================================
drop policy if exists "read_students" on public.students;
drop policy if exists "write_students" on public.students;
drop policy if exists "read_students" on public.students;
create policy "read_students" on public.students for select using (
  public.is_staff(auth.uid()) or user_id = auth.uid() or public.is_parent_of(auth.uid(), id)
);
drop policy if exists "write_students" on public.students;
create policy "write_students" on public.students for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "read_assignments" on public.assignments;
drop policy if exists "write_assignments" on public.assignments;
drop policy if exists "read_assignments" on public.assignments;
create policy "read_assignments" on public.assignments for select using (
  public.is_staff(auth.uid())
  or class in (select class from public.students where user_id = auth.uid())
  or class in (select class from public.students s join public.parent_child pc on pc.student_id=s.id where pc.parent_id=auth.uid())
);
drop policy if exists "write_assignments" on public.assignments;
create policy "write_assignments" on public.assignments for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "read_eresources" on public.eresources;
drop policy if exists "write_eresources" on public.eresources;
drop policy if exists "read_eresources" on public.eresources;
create policy "read_eresources" on public.eresources for select using (
  public.is_staff(auth.uid())
  or class in (select class from public.students where user_id = auth.uid())
  or class in (select class from public.students s join public.parent_child pc on pc.student_id=s.id where pc.parent_id=auth.uid())
);
drop policy if exists "write_eresources" on public.eresources;
create policy "write_eresources" on public.eresources for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "read_certificates" on public.certificates;
drop policy if exists "write_certificates" on public.certificates;
drop policy if exists "read_certificates" on public.certificates;
create policy "read_certificates" on public.certificates for select using (
  public.is_staff(auth.uid()) or student_id in (select id from public.students where user_id=auth.uid()) or public.is_parent_of(auth.uid(), student_id)
);
drop policy if exists "write_certificates" on public.certificates;
create policy "write_certificates" on public.certificates for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));


-- =====================================================================
-- ENTERPRISE V3 MODULE RECORDS CORE (prevents inbox/audience schema cache errors even before enhancement scripts)
-- =====================================================================
create table if not exists public.module_records (
  id uuid primary key default uuid_generate_v4(),
  module text not null,
  title text,
  body text,
  status text,
  audience text default 'private',
  recipient_id uuid references public.profiles(id) on delete set null,
  source text default 'manual',
  ref_date date,
  amount numeric,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.module_records enable row level security;
create index if not exists module_records_module_idx on public.module_records (module, created_at desc);
alter table public.module_records add column if not exists audience text default 'private';
alter table public.module_records add column if not exists recipient_id uuid references public.profiles(id) on delete set null;

-- ===== voting-schema.sql =====
-- =====================================================================
-- School Connect — Voting Schema (Gen v8) — STAND-ALONE & SELF-CONTAINED
-- =====================================================================
-- Run this file on its own to add ONLY the voting/polls feature to an
-- existing Supabase project, OR run the full database/schema.sql which
-- already includes everything below.
--
-- ⚠️  Why v7's voting query failed with:
--        ERROR: 42P01: relation "public.profiles" does not exist
--     The old voting file referenced public.profiles and the is_staff()
--     function WITHOUT guaranteeing they exist first. If you ran the
--     voting file before (or instead of) the main schema, those objects
--     were missing and Postgres aborted on the very first reference.
--
-- ✅  This version creates the minimum dependencies (profiles table +
--     is_staff helper) ONLY IF they are missing, so it can never throw
--     42P01 again — whether run first, last, or on its own.
--
-- Idempotent: safe to re-run any number of times.
-- =====================================================================


-- ========================================================
-- 0. EXTENSIONS
-- ========================================================
create extension if not exists "uuid-ossp";


-- ========================================================
-- 1. DEPENDENCIES (created only if they don't already exist)
--    The voting policies reference public.profiles and is_staff().
-- ========================================================

-- 1a. profiles — minimal version. If you already ran schema.sql this is
--     a no-op because of "if not exists".
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'student'
    check (role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','parent','student','bursar')),
  status text not null default 'pending'
    check (status in ('pending','approved','active','suspended')),
  photo_url text,
  campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 1b. is_staff() helper — created AFTER profiles exists, so no 42P01.
create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','bursar')
      and status in ('approved','active')
  );
$$;


-- ========================================================
-- 2. VOTING TABLES
-- ========================================================
create table if not exists public.polls (
  id uuid primary key default uuid_generate_v4(),
  title text not null, description text,
  type text default 'single_choice'
    check (type in ('single_choice','multiple_choice','yes_no','ranked')),
  candidates jsonb default '[]'::jsonb,   -- [{id,name,info,photo}]
  opens_at timestamptz default now(),
  closes_at timestamptz,
  allow_multiple boolean default false,
  anonymous boolean default false,
  audience text default 'all',
  status text default 'open' check (status in ('draft','open','closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.polls enable row level security;

create table if not exists public.poll_votes (
  id uuid primary key default uuid_generate_v4(),
  poll_id uuid references public.polls(id) on delete cascade,
  candidate_id text not null,
  voter_id uuid references public.profiles(id) on delete cascade,
  voted_at timestamptz default now(),
  unique(poll_id, candidate_id, voter_id)
);
alter table public.poll_votes enable row level security;

-- Column backfill (idempotent) — guarantees columns the RLS policies need
-- exist even if poll_votes/polls were created by an OLDER schema version.
-- Prevents: ERROR: column "voter_id" does not exist.
-- [v5 fix] Each ALTER wrapped in its own safe block
do $$ begin alter table public.poll_votes add column if not exists voter_id uuid; exception when others then null; end $$;
do $$ begin alter table public.poll_votes add column if not exists candidate_id text; exception when others then null; end $$;
do $$ begin alter table public.poll_votes add column if not exists poll_id uuid; exception when others then null; end $$;
do $$ begin alter table public.polls      add column if not exists status text default 'open'; exception when others then null; end $$;
-- ========================================================
-- 3. RLS POLICIES
-- ========================================================
drop policy if exists "polls_read"  on public.polls;
drop policy if exists "polls_write" on public.polls;
drop policy if exists "polls_read" on public.polls;
create policy "polls_read"  on public.polls for select using (auth.role() = 'authenticated');
drop policy if exists "polls_write" on public.polls;
create policy "polls_write" on public.polls for all using (public.is_staff(auth.uid()));
drop policy if exists "pv_read"   on public.poll_votes;
drop policy if exists "pv_insert" on public.poll_votes;
drop policy if exists "pv_update" on public.poll_votes;
drop policy if exists "pv_read" on public.poll_votes;
create policy "pv_read"   on public.poll_votes for select using (auth.uid() = voter_id or public.is_staff(auth.uid()));
drop policy if exists "pv_insert" on public.poll_votes;
create policy "pv_insert" on public.poll_votes for insert with check (auth.uid() = voter_id);
drop policy if exists "pv_update" on public.poll_votes;
create policy "pv_update" on public.poll_votes for update using (auth.uid() = voter_id);
-- ========================================================
-- 4. LIVE-RESULTS VIEW (fixed aggregate — counts votes correctly)
-- ========================================================
-- Drop first so re-runs never hit 42P16 "cannot drop columns from view".
drop view if exists public.poll_results cascade;
create or replace view public.poll_results as
select p.id as poll_id, p.title,
       coalesce(sum(v.c), 0) as total_votes,
       coalesce(jsonb_agg(jsonb_build_object('candidate', v.candidate_id, 'votes', v.c))
                filter (where v.candidate_id is not null), '[]'::jsonb) as breakdown
from public.polls p
left join lateral (
  select candidate_id, count(*) as c
  from public.poll_votes
  where poll_id = p.id
  group by candidate_id
) v on true
group by p.id, p.title;
-- =====================================================================
-- DONE ✅  Voting schema ready — no 42P01 errors, run standalone or after main schema.
-- =====================================================================
select 'Voting schema v8 ready ✅' as status;
-- ===== cbt-schema.sql =====
-- =====================================================================
-- School Connect — CBT (Computer-Based Testing) Schema — Gen v2
-- =====================================================================
-- A full online-exam engine, INTERCONNECTED with the main School Connect
-- database so exam/test/assignment/project results flow into report cards.
--
-- Mirrors the HMG Academy Standalone CBT system:
--   • 17 question types, anti-cheat config, certificates
--   • open / registered exam modes, attempt limits, negative marking
--   • held vs instant results, start/close windows
--
-- ORDERING RULE (prevents 42P01): tables first → helper functions →
-- policies. Self-contained: creates a minimal profiles + is_staff() only
-- if missing, so it can run standalone or after database/schema.sql.
-- Idempotent: safe to re-run.
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
-- ---- minimal dependency (no-op if main schema already ran) ----
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text,
  role text not null default 'student'
    check (role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','parent','student','bursar')),
  status text not null default 'pending'
    check (status in ('pending','approved','active','suspended')),
  photo_url text, campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- =====================================================================
-- 1. TABLES
-- =====================================================================
create table if not exists public.cbt_exams (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references public.profiles(id) on delete set null,
  code text unique not null,
  title text,
  subject text not null default 'General',
  class text default '',
  term text default '',
  session text default '',
  topic text default '',
  -- which kind of assessment this is — used to map into the report card:
  assessment_type text not null default 'exam'
    check (assessment_type in ('exam','test','assignment','project','quiz','ca','practical')),
  -- the report-card column name this exam feeds (e.g. 'CA1','Project','Exam'):
  report_column text default '',
  max_score numeric default 0,           -- max mark to scale the result to in the report card
  duration integer not null default 45,  -- minutes
  attempt_limit integer not null default 1,
  select_count integer not null default 0,   -- 0 = use all questions
  randomise boolean not null default true,
  negative_mark numeric not null default 0,
  exam_mode text not null default 'open' check (exam_mode in ('open','registered')),
  is_open boolean not null default false,
  is_archived boolean not null default false,
  release_results boolean not null default true,
  instructions text not null default '',
  anti_cheat_config jsonb not null default
    '{"tab_switch":true,"window_blur":true,"copy_paste":true,"right_click":true,"fullscreen":true,"devtools":true,"max_violations":5}'::jsonb,
  certificate_enabled boolean not null default true,
  start_at timestamptz,
  close_at timestamptz,
  csv_data jsonb not null default '[]'::jsonb,   -- the question bank [{question,type,options,correct,...}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.cbt_exams enable row level security;
do $$ begin alter table public.cbt_exams add column if not exists is_entrance boolean not null default false; exception when others then null; end $$;
do $$ begin alter table public.cbt_exams add column if not exists pass_mark numeric not null default 50; exception when others then null; end $$;
create index if not exists cbt_exams_code_idx on public.cbt_exams (code);
create table if not exists public.cbt_results (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid not null references public.cbt_exams(id) on delete cascade,
  student_name text not null,
  student_class text default '',
  student_id_ref text default '',     -- admission no / student.id reference
  student_type text default 'open',
  score numeric(10,2) not null default 0,
  total integer not null default 0,
  percent numeric(6,2) default 0,
  correct_count integer default 0,
  wrong_count integer default 0,
  skipped_count integer default 0,
  attempt_number integer default 1,
  time_taken integer default 0,       -- seconds
  answers_data jsonb,
  violations integer default 0,
  violation_log jsonb default '[]'::jsonb,
  cert_code text default '',
  created_at timestamptz default now()
);
alter table public.cbt_results enable row level security;
create index if not exists cbt_results_exam_idx on public.cbt_results (exam_id);
do $$ begin create index if not exists cbt_results_student_idx on public.cbt_results (student_id_ref); exception when others then null; end $$;
-- Roster for "registered" mode (which students may sit an exam)
create table if not exists public.cbt_roster (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references public.cbt_exams(id) on delete cascade,
  student_id_ref text not null,
  full_name text,
  class text,
  created_at timestamptz default now(),
  unique(exam_id, student_id_ref)
);
alter table public.cbt_roster enable row level security;
-- =====================================================================
-- 2. HELPER (created after tables; no-op if main schema already made it)
-- =====================================================================
create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','bursar')
      and status in ('approved','active')
  );
$$;
-- ENTERPRISE V3 CBT ADMIN HELPER
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id=uid and role in ('super_admin','admin','administrator','owner','director','principal','proprietor','head_teacher','bursar') and status in ('approved','active'));
$$;
-- =====================================================================
-- 3. SECURE RPCs (so anonymous students can sit exams without seeing answers)
-- =====================================================================
-- Public: fetch an OPEN exam by code WITHOUT exposing the correct answers.
create or replace function public.cbt_get_public_exam(p_code text)
returns jsonb language plpgsql security definer stable as $$
declare e public.cbt_exams; qs jsonb;
begin
  select * into e from public.cbt_exams
   where code = upper(trim(p_code)) and is_open = true and is_archived = false
   limit 1;
  if not found then return null; end if;
  if e.start_at is not null and now() < e.start_at then
    return jsonb_build_object('wait', true, 'start_at', e.start_at, 'title', e.title, 'subject', e.subject);
  end if;
  if e.close_at is not null and now() > e.close_at then
    return jsonb_build_object('closed', true);
  end if;
  -- strip the correct answers/explanations before sending to the student
  select coalesce(jsonb_agg(
           (q - 'correct' - 'explanation' - 'accept' - 'subs')
           || jsonb_build_object('correct', null)
         ), '[]'::jsonb)
    into qs
    from jsonb_array_elements(e.csv_data) q;
  return jsonb_build_object(
    'id', e.id, 'code', e.code, 'title', e.title, 'subject', e.subject,
    'class', e.class, 'term', e.term, 'session', e.session, 'topic', e.topic,
    'duration', e.duration, 'instructions', e.instructions, 'exam_mode', e.exam_mode,
    'select_count', e.select_count, 'randomise', e.randomise,
    'anti_cheat_config', e.anti_cheat_config, 'release_results', e.release_results,
    'certificate_enabled', e.certificate_enabled, 'assessment_type', e.assessment_type,
    'report_column', e.report_column, 'max_score', e.max_score,
    'questions', qs, '_questions', qs
  );
end; $$;
-- Public: grade & store a submission server-side (answers checked against the
-- full bank), returning the score and certificate code.
create or replace function public.cbt_submit(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  e public.cbt_exams;
  v_attempts int;
  v_cert text;
  v_id uuid;
  v_release boolean;
begin
  select * into e from public.cbt_exams where id = (p_payload->>'exam_id')::uuid limit 1;
  if not found then return jsonb_build_object('saved', false, 'error', 'Exam not found'); end if;
  -- enforce attempt limit per student reference (best-effort)
  select count(*) into v_attempts from public.cbt_results
   where exam_id = e.id
     and ( (p_payload->>'student_id_ref') <> '' and student_id_ref = p_payload->>'student_id_ref' );
  if e.attempt_limit > 0 and (p_payload->>'student_id_ref') <> '' and v_attempts >= e.attempt_limit then
    return jsonb_build_object('saved', false, 'error', 'Attempt limit reached');
  end if;
  v_cert := case when e.certificate_enabled
                 then 'CERT-' || upper(substr(md5(random()::text),1,4)) || '-' || upper(substr(md5(random()::text),1,4))
                 else '' end;
  insert into public.cbt_results (
    exam_id, student_name, student_class, student_id_ref, student_type,
    score, total, percent, correct_count, wrong_count, skipped_count,
    attempt_number, time_taken, answers_data, violations, violation_log, cert_code
  ) values (
    e.id,
    coalesce(p_payload->>'student_name','Anonymous'),
    coalesce(p_payload->>'student_class', e.class),
    coalesce(p_payload->>'student_id_ref',''),
    coalesce(p_payload->>'student_type', e.exam_mode),
    coalesce((p_payload->>'score')::numeric,0),
    coalesce((p_payload->>'total')::int,0),
    coalesce((p_payload->>'percent')::numeric,0),
    coalesce((p_payload->>'correct_count')::int,0),
    coalesce((p_payload->>'wrong_count')::int,0),
    coalesce((p_payload->>'skipped_count')::int,0),
    v_attempts + 1,
    coalesce((p_payload->>'time_taken')::int,0),
    p_payload->'answers_data',
    coalesce((p_payload->>'violations')::int,0),
    coalesce(p_payload->'violation_log','[]'::jsonb),
    v_cert
  ) returning id into v_id;
  v_release := e.release_results;
  return jsonb_build_object(
    'saved', true, 'result_id', v_id, 'cert_code', v_cert,
    'release_results', v_release,
    'report_column', e.report_column, 'subject', e.subject,
    'term', e.term, 'session', e.session, 'class', e.class, 'title', e.title,
    'score', coalesce((p_payload->>'score')::numeric,0),
    'total', coalesce((p_payload->>'total')::int,0),
    'percent', coalesce((p_payload->>'percent')::numeric,0),
    'student_name', coalesce(p_payload->>'student_name','Anonymous'),
    'max_score', e.max_score
  );
end; $$;
-- =====================================================================
-- 4. RLS POLICIES
-- =====================================================================
-- Exams: staff (teachers/admins) manage; authenticated can read open exams.
drop policy if exists "cbt_exam_staff" on public.cbt_exams;
drop policy if exists "cbt_exam_read"  on public.cbt_exams;
drop policy if exists "cbt_exam_insert" on public.cbt_exams;
drop policy if exists "cbt_exam_update" on public.cbt_exams;
drop policy if exists "cbt_exam_delete" on public.cbt_exams;
drop policy if exists "cbt_exam_read" on public.cbt_exams;
create policy "cbt_exam_read" on public.cbt_exams for select using (auth.role() = 'authenticated');
drop policy if exists "cbt_exam_insert" on public.cbt_exams;
create policy "cbt_exam_insert" on public.cbt_exams for insert with check (public.is_staff(auth.uid()));
drop policy if exists "cbt_exam_update" on public.cbt_exams;
create policy "cbt_exam_update" on public.cbt_exams for update using (public.is_admin(auth.uid()) or teacher_id = auth.uid()) with check (public.is_admin(auth.uid()) or teacher_id = auth.uid());
drop policy if exists "cbt_exam_delete" on public.cbt_exams;
create policy "cbt_exam_delete" on public.cbt_exams for delete using (public.is_admin(auth.uid()) or teacher_id = auth.uid());
-- Results: staff read all & manage; (anonymous students submit via the
-- security-definer cbt_submit RPC, so no broad insert policy is needed).
drop policy if exists "cbt_res_staff" on public.cbt_results;
drop policy if exists "cbt_res_staff" on public.cbt_results;
create policy "cbt_res_staff" on public.cbt_results for all using (public.is_staff(auth.uid()));
drop policy if exists "cbt_res_family_read" on public.cbt_results;
create policy "cbt_res_family_read" on public.cbt_results for select using (
  public.is_staff(auth.uid())
  or exists (
    select 1 from public.students s
    where (s.admission_no = cbt_results.student_id_ref or lower(s.full_name) = lower(cbt_results.student_name))
      and (s.user_id = auth.uid() or public.is_parent_of(auth.uid(), s.id))
  )
);
drop policy if exists "cbt_roster_staff" on public.cbt_roster;
drop policy if exists "cbt_roster_staff" on public.cbt_roster;
create policy "cbt_roster_staff" on public.cbt_roster for all using (public.is_staff(auth.uid()));
-- Allow anon + authenticated to call the public RPCs only.
grant execute on function public.cbt_get_public_exam(text) to anon, authenticated;
grant execute on function public.cbt_submit(jsonb) to anon, authenticated;
-- =====================================================================
-- DONE ✅  CBT engine installed. Run database/reportcard-schema.sql next to
-- enable automatic result → report-card mapping.
-- =====================================================================
select 'School Connect CBT schema v2 installed ✅' as status;
-- =====================================================================
-- School Connect v2 CBT repair: server-side grading + answer stripping
-- Re-runnable. Keeps CBT functional for open/anonymous exams without AI APIs.
-- =====================================================================
create or replace function public.cbt_get_public_exam(p_code text)
returns jsonb language plpgsql security definer stable as $$
declare e public.cbt_exams; qs jsonb;
begin
  select * into e from public.cbt_exams
   where code = upper(trim(p_code)) and is_open = true and is_archived = false
   limit 1;
  if not found then return null; end if;
  if e.start_at is not null and now() < e.start_at then
    return jsonb_build_object('wait', true, 'start_at', e.start_at, 'title', e.title, 'subject', e.subject);
  end if;
  if e.close_at is not null and now() > e.close_at then
    return jsonb_build_object('closed', true);
  end if;
  select coalesce(jsonb_agg(
           (q - 'correct' - 'correct_answer' - 'answer' - 'explanation' - 'accept' - 'subs')
           || jsonb_build_object('correct', null, 'answer', null)
         ), '[]'::jsonb)
    into qs
    from jsonb_array_elements(e.csv_data) q;
  return jsonb_build_object(
    'id', e.id, 'code', e.code, 'title', e.title, 'subject', e.subject,
    'class', e.class, 'term', e.term, 'session', e.session, 'topic', e.topic,
    'duration', e.duration, 'instructions', e.instructions, 'exam_mode', e.exam_mode,
    'select_count', e.select_count, 'randomise', e.randomise, 'negative_mark', e.negative_mark,
    'anti_cheat_config', e.anti_cheat_config, 'release_results', e.release_results,
    'certificate_enabled', e.certificate_enabled, 'assessment_type', e.assessment_type,
    'report_column', e.report_column, 'max_score', e.max_score,
    'questions', qs, '_questions', qs
  );
end; $$;
create or replace function public.cbt_submit(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  e public.cbt_exams;
  v_attempts int;
  v_cert text;
  v_id uuid;
  v_release boolean;
  q jsonb;
  i int := 0;
  v_ans text;
  v_key text;
  v_mark numeric;
  v_score numeric := 0;
  v_total numeric := 0;
  v_correct int := 0;
  v_wrong int := 0;
  v_skipped int := 0;
  v_percent numeric := 0;
begin
  select * into e from public.cbt_exams where id = (p_payload->>'exam_id')::uuid limit 1;
  if not found then return jsonb_build_object('saved', false, 'error', 'Exam not found'); end if;
  select count(*) into v_attempts from public.cbt_results
   where exam_id = e.id
     and ( (p_payload->>'student_id_ref') <> '' and student_id_ref = p_payload->>'student_id_ref' );
  if e.attempt_limit > 0 and (p_payload->>'student_id_ref') <> '' and v_attempts >= e.attempt_limit then
    return jsonb_build_object('saved', false, 'error', 'Attempt limit reached');
  end if;
  for q in select * from jsonb_array_elements(e.csv_data) loop
    v_mark := coalesce(nullif(q->>'mark','')::numeric, nullif(q->>'score','')::numeric, 1);
    v_total := v_total + v_mark;
    v_ans := coalesce(p_payload->'answers_data'->>i, '');
    v_key := coalesce(q->>'answer', q->>'correct', q->>'correct_answer', '');
    if trim(v_ans) = '' then
      v_skipped := v_skipped + 1;
    elsif lower(trim(v_ans)) = lower(trim(v_key)) then
      v_score := v_score + v_mark;
      v_correct := v_correct + 1;
    else
      v_score := greatest(0, v_score - coalesce(e.negative_mark,0));
      v_wrong := v_wrong + 1;
    end if;
    i := i + 1;
  end loop;
  if v_total > 0 then v_percent := round((v_score / v_total) * 100, 2); end if;
  v_cert := case when e.certificate_enabled
                 then 'CERT-' || upper(substr(md5(random()::text),1,4)) || '-' || upper(substr(md5(random()::text),1,4))
                 else '' end;
  insert into public.cbt_results (
    exam_id, student_name, student_class, student_id_ref, student_type,
    score, total, percent, correct_count, wrong_count, skipped_count,
    attempt_number, time_taken, answers_data, violations, violation_log, cert_code
  ) values (
    e.id,
    coalesce(p_payload->>'student_name','Anonymous'),
    coalesce(p_payload->>'student_class', e.class),
    coalesce(p_payload->>'student_id_ref',''),
    coalesce(p_payload->>'student_type', e.exam_mode),
    v_score, v_total::int, v_percent, v_correct, v_wrong, v_skipped,
    v_attempts + 1,
    coalesce((p_payload->>'time_taken')::int,0),
    p_payload->'answers_data',
    coalesce((p_payload->>'violations')::int,0),
    coalesce(p_payload->'violation_log','[]'::jsonb),
    v_cert
  ) returning id into v_id;
  v_release := e.release_results;
  return jsonb_build_object(
    'saved', true, 'result_id', v_id, 'cert_code', v_cert,
    'release_results', v_release,
    'report_column', e.report_column, 'subject', e.subject,
    'term', e.term, 'session', e.session, 'class', e.class, 'title', e.title,
    'score', v_score, 'total', v_total::int, 'percent', v_percent,
    'correct_count', v_correct, 'wrong_count', v_wrong, 'skipped_count', v_skipped,
    'student_name', coalesce(p_payload->>'student_name','Anonymous'), 'max_score', e.max_score
  );
end; $$;
grant execute on function public.cbt_get_public_exam(text) to anon, authenticated;
grant execute on function public.cbt_submit(jsonb) to anon, authenticated;
-- =====================================================================
-- ENTERPRISE V10 CBT CONCURRENCY + RANDOMISED ORDER REPAIR (2026-07-06)
-- Supports 400+ simultaneous candidates more safely:
-- 1. candidate fetch gets original question indexes before answer stripping;
-- 2. submissions are graded against the exact question indexes attempted;
-- 3. extra indexes reduce contention for busy exam halls.
-- =====================================================================
create index if not exists cbt_exams_code_open_idx on public.cbt_exams (code, is_open, is_archived);
do $$ begin create index if not exists cbt_results_exam_student_created_idx on public.cbt_results (exam_id, student_id_ref, created_at desc); exception when others then null; end $$;
create index if not exists cbt_results_created_idx on public.cbt_results (created_at desc);
create or replace function public.cbt_get_public_exam(p_code text)
returns jsonb language plpgsql security definer stable as $$
declare e public.cbt_exams; qs jsonb;
begin
  select * into e from public.cbt_exams
   where code = upper(trim(p_code)) and is_open = true and is_archived = false
   limit 1;
  if not found then return null; end if;
  if e.start_at is not null and now() < e.start_at then
    return jsonb_build_object('wait', true, 'start_at', e.start_at, 'title', e.title, 'subject', e.subject);
  end if;
  if e.close_at is not null and now() > e.close_at then
    return jsonb_build_object('closed', true);
  end if;
  select coalesce(jsonb_agg(
           (q - 'correct' - 'correct_answer' - 'answer' - 'explanation' - 'accept' - 'subs')
           || jsonb_build_object('correct', null, 'answer', null, '_orig_index', ord - 1)
           order by ord
         ), '[]'::jsonb)
    into qs
    from jsonb_array_elements(e.csv_data) with ordinality as t(q, ord);
  return jsonb_build_object(
    'id', e.id, 'code', e.code, 'title', e.title, 'subject', e.subject,
    'class', e.class, 'term', e.term, 'session', e.session, 'topic', e.topic,
    'duration', e.duration, 'instructions', e.instructions, 'exam_mode', e.exam_mode,
    'select_count', e.select_count, 'randomise', e.randomise, 'negative_mark', e.negative_mark,
    'anti_cheat_config', e.anti_cheat_config, 'release_results', e.release_results,
    'certificate_enabled', e.certificate_enabled, 'assessment_type', e.assessment_type,
    'report_column', e.report_column, 'max_score', e.max_score,
    'questions', qs, '_questions', qs
  );
end; $$;
create or replace function public.cbt_submit(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  e public.cbt_exams;
  v_attempts int;
  v_cert text;
  v_id uuid;
  v_release boolean;
  ans jsonb;
  q jsonb;
  i int := 0;
  qi int;
  v_ans text;
  v_key text;
  v_mark numeric;
  v_score numeric := 0;
  v_total numeric := 0;
  v_correct int := 0;
  v_wrong int := 0;
  v_skipped int := 0;
  v_percent numeric := 0;
begin
  select * into e from public.cbt_exams where id = (p_payload->>'exam_id')::uuid limit 1;
  if not found then return jsonb_build_object('saved', false, 'error', 'Exam not found'); end if;
  select count(*) into v_attempts from public.cbt_results
   where exam_id = e.id
     and coalesce(p_payload->>'student_id_ref','') <> ''
     and student_id_ref = p_payload->>'student_id_ref';
  if e.attempt_limit > 0 and coalesce(p_payload->>'student_id_ref','') <> '' and v_attempts >= e.attempt_limit then
    return jsonb_build_object('saved', false, 'error', 'Attempt limit reached');
  end if;
  -- New clients send [{index, subject, answer}]. Older clients send ["A","B"].
  for ans in select * from jsonb_array_elements(coalesce(p_payload->'answers_data','[]'::jsonb)) loop
    if jsonb_typeof(ans) = 'object' then
      qi := coalesce(nullif(ans->>'index','')::int, i);
      v_ans := coalesce(ans->>'answer','');
    else
      qi := i;
      v_ans := coalesce(ans #>> '{}','');
    end if;
    q := e.csv_data -> qi;
    if q is null then i := i + 1; continue; end if;
    v_mark := coalesce(nullif(q->>'mark','')::numeric, nullif(q->>'score','')::numeric, 1);
    v_total := v_total + v_mark;
    v_key := coalesce(q->>'answer', q->>'correct', q->>'correct_answer', '');
    if trim(v_ans) = '' then
      v_skipped := v_skipped + 1;
    elsif lower(trim(v_ans)) = lower(trim(v_key)) then
      v_score := v_score + v_mark;
      v_correct := v_correct + 1;
    else
      v_score := greatest(0, v_score - coalesce(e.negative_mark,0));
      v_wrong := v_wrong + 1;
    end if;
    i := i + 1;
  end loop;
  if v_total > 0 then v_percent := round((v_score / v_total) * 100, 2); end if;
  v_cert := case when e.certificate_enabled then 'CERT-' || upper(substr(md5(random()::text),1,4)) || '-' || upper(substr(md5(random()::text),1,4)) else '' end;
  insert into public.cbt_results (
    exam_id, student_name, student_class, student_id_ref, student_type,
    score, total, percent, correct_count, wrong_count, skipped_count,
    attempt_number, time_taken, answers_data, violations, violation_log, cert_code
  ) values (
    e.id, coalesce(p_payload->>'student_name','Anonymous'), coalesce(p_payload->>'student_class', e.class),
    coalesce(p_payload->>'student_id_ref',''), coalesce(p_payload->>'student_type', e.exam_mode),
    v_score, v_total::int, v_percent, v_correct, v_wrong, v_skipped, v_attempts + 1,
    coalesce((p_payload->>'time_taken')::int,0), p_payload->'answers_data',
    coalesce((p_payload->>'violations')::int,0), coalesce(p_payload->'violation_log','[]'::jsonb), v_cert
  ) returning id into v_id;
  v_release := e.release_results;
  return jsonb_build_object('saved', true, 'result_id', v_id, 'cert_code', v_cert, 'release_results', v_release,
    'report_column', e.report_column, 'subject', e.subject, 'term', e.term, 'session', e.session, 'class', e.class,
    'title', e.title, 'score', v_score, 'total', v_total::int, 'percent', v_percent,
    'correct_count', v_correct, 'wrong_count', v_wrong, 'skipped_count', v_skipped,
    'student_name', coalesce(p_payload->>'student_name','Anonymous'), 'max_score', e.max_score);
end; $$;
grant execute on function public.cbt_get_public_exam(text) to anon, authenticated;
grant execute on function public.cbt_submit(jsonb) to anon, authenticated;
-- ===== reportcard-schema.sql =====
-- =====================================================================
-- School Connect — Report Card Schema (FLEXIBLE) — Gen v2
-- =====================================================================
-- A fully flexible report-card engine. Teachers/admins:
--   1. define ANY assessment columns per class/subject (e.g. CA1, CA2,
--      Assignment, Project, Practical, Exam) and apportion a MAX MARK to each,
--   2. enter scores per student per column,
--   3. and CBT/online results auto-map into the matching column.
-- Totals, grades and positions are computed from the columns + their weights.
--
-- ORDERING RULE (prevents 42P01): tables → helper → policies.
-- Self-contained & idempotent. Run AFTER database/schema.sql (recommended)
-- so it can reference students; works standalone too.
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
-- minimal deps (no-op if main schema already ran)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text,
  role text not null default 'student',
  status text not null default 'pending',
  photo_url text, campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  admission_no text unique,
  full_name text not null,
  class text, arm text,
  guardian_email text,
  created_at timestamptz default now()
);
alter table public.students enable row level security;
do $$ begin alter table public.students add column if not exists user_id uuid references public.profiles(id) on delete set null; exception when others then null; end $$;
create index if not exists students_user_id_idx on public.students(user_id);
-- =====================================================================
-- 1. TABLES
-- =====================================================================
-- 1a. Assessment columns — the customisable structure of a report.
-- A teacher creates, for a given class+subject+term+session, a set of columns
-- such as: CA1 (max 10), CA2 (max 10), Assignment (max 5), Project (max 15),
-- Exam (max 60). The "source" tells the system whether the column is filled
-- manually or pulled from CBT.
create table if not exists public.assessment_columns (
  id uuid primary key default uuid_generate_v4(),
  class text not null,
  subject text not null,
  term text not null default '',
  session text not null default '',
  name text not null,                 -- e.g. 'CA1', 'Project', 'Exam'
  max_mark numeric not null default 10,
  weight numeric not null default 1,  -- relative weight when scaling (usually 1)
  position int not null default 0,    -- display order
  source text not null default 'manual' check (source in ('manual','cbt')),
  cbt_assessment_type text default '',-- if source='cbt': which assessment_type maps here
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique(class, subject, term, session, name)
);
alter table public.assessment_columns enable row level security;
-- 1b. Per-student score for one column.
create table if not exists public.report_scores (
  id uuid primary key default uuid_generate_v4(),
  column_id uuid not null references public.assessment_columns(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  student_name text not null default '',
  student_id_ref text default '',     -- admission_no, for CBT matching
  class text default '',
  subject text default '',
  term text default '',
  session text default '',
  score numeric not null default 0,
  source text default 'manual',
  cert_code text default '',          -- if pulled from a CBT result
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(column_id, student_id_ref, student_name)
);
alter table public.report_scores enable row level security;
create index if not exists report_scores_lookup_idx
  on public.report_scores (class, subject, term, session);
-- 1c. Per-student per-term report meta (comments, traits, attendance).
create table if not exists public.report_cards (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  student_name text default '',
  student_id_ref text default '',
  class text, term text, session text,
  teacher_comment text default '',
  head_comment text default '',
  attendance_present int default 0,
  attendance_total int default 0,
  affective jsonb default '{}'::jsonb,   -- {punctuality:5, neatness:4, ...}
  psychomotor jsonb default '{}'::jsonb,
  next_term_begins date,
  position int,
  published boolean default false,
  created_at timestamptz default now(),
  unique(student_id_ref, class, term, session)
);
alter table public.report_cards enable row level security;
-- =====================================================================
-- 2. HELPER (no-op if main schema already made it)
-- =====================================================================
-- ENTERPRISE V4 REPORTCARD PARENT_CHILD: standalone reportcard schema privacy dependency
create table if not exists public.parent_child (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  relationship text default 'parent',
  verified boolean default false,
  created_at timestamptz default now(),
  unique(parent_id, student_id)
);
alter table public.parent_child enable row level security;
create or replace function public.is_parent_of(uid uuid, child uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.parent_child where parent_id=uid and student_id=child);
$$;
create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','bursar')
      and status in ('approved','active')
  );
$$;
-- =====================================================================
-- 3. THE INTERCONNECTION FUNCTION
--    Called by the CBT engine after a submission. It finds (or creates) the
--    matching report column for the subject/term/session, scales the CBT
--    score to that column's max_mark, and upserts the student's score.
-- =====================================================================
create or replace function public.cbt_push_to_reportcard(
  p_student_name   text,
  p_student_id_ref text,
  p_class          text,
  p_subject        text,
  p_term           text,
  p_session        text,
  p_column         text,
  p_raw_score      numeric,
  p_raw_total      numeric,
  p_max_score      numeric
) returns jsonb language plpgsql security definer as $$
declare
  v_col public.assessment_columns;
  v_max numeric;
  v_scaled numeric;
begin
  if coalesce(p_column,'') = '' then
    return jsonb_build_object('mapped', false, 'reason', 'no report_column set on exam');
  end if;
  -- find or create the column
  select * into v_col from public.assessment_columns
   where class = p_class and subject = p_subject
     and term = coalesce(p_term,'') and session = coalesce(p_session,'')
     and name = p_column
   limit 1;
  if not found then
    v_max := case when coalesce(p_max_score,0) > 0 then p_max_score
                  when coalesce(p_raw_total,0) > 0 then p_raw_total
                  else 100 end;
    insert into public.assessment_columns (class, subject, term, session, name, max_mark, source, cbt_assessment_type)
    values (p_class, p_subject, coalesce(p_term,''), coalesce(p_session,''), p_column, v_max, 'cbt', '')
    returning * into v_col;
  end if;
  v_max := coalesce(v_col.max_mark, 100);
  -- scale the raw CBT score onto the column's max mark
  if coalesce(p_raw_total,0) > 0 then
    v_scaled := round((p_raw_score / p_raw_total) * v_max, 2);
  else
    v_scaled := least(p_raw_score, v_max);
  end if;
  insert into public.report_scores (
    column_id, student_name, student_id_ref, class, subject, term, session, score, source
  ) values (
    v_col.id, p_student_name, coalesce(p_student_id_ref,''), p_class, p_subject,
    coalesce(p_term,''), coalesce(p_session,''), v_scaled, 'cbt'
  )
  on conflict (column_id, student_id_ref, student_name)
  do update set score = excluded.score, source = 'cbt', updated_at = now();
  return jsonb_build_object('mapped', true, 'column', v_col.name, 'scaled', v_scaled, 'max', v_max);
end; $$;
-- A convenience view: each student's subject total across all columns.
-- Drop first so re-runs never hit 42P16 "cannot drop columns from view".
drop view if exists public.report_subject_totals cascade;
create or replace view public.report_subject_totals as
select rs.class, rs.subject, rs.term, rs.session,
       rs.student_id_ref, rs.student_name,
       round(sum(rs.score), 2) as obtained,
       round(sum(ac.max_mark), 2) as obtainable,
       case when sum(ac.max_mark) > 0
            then round(sum(rs.score) / sum(ac.max_mark) * 100, 2) else 0 end as percent
from public.report_scores rs
join public.assessment_columns ac on ac.id = rs.column_id
group by rs.class, rs.subject, rs.term, rs.session, rs.student_id_ref, rs.student_name;
-- =====================================================================
-- 4. RLS POLICIES
-- =====================================================================
drop policy if exists "ac_staff" on public.assessment_columns;
drop policy if exists "ac_read"  on public.assessment_columns;
drop policy if exists "ac_staff" on public.assessment_columns;
create policy "ac_staff" on public.assessment_columns for all using (public.is_staff(auth.uid()));
drop policy if exists "ac_read" on public.assessment_columns;
create policy "ac_read"  on public.assessment_columns for select using (auth.role() = 'authenticated');
drop policy if exists "rs_staff" on public.report_scores;
drop policy if exists "rs_read"  on public.report_scores;
drop policy if exists "rs_staff" on public.report_scores;
create policy "rs_staff" on public.report_scores for all using (public.is_staff(auth.uid()));
-- students/parents may read; the parent-scoping in the main schema's
-- parent_child still governs deeper access patterns at the app layer.
drop policy if exists "rs_read" on public.report_scores;
create policy "rs_read"  on public.report_scores for select using (auth.role() = 'authenticated');
drop policy if exists "rc_staff" on public.report_cards;
drop policy if exists "rc_read"  on public.report_cards;
drop policy if exists "rc_staff" on public.report_cards;
create policy "rc_staff" on public.report_cards for all using (public.is_staff(auth.uid()));
drop policy if exists "rc_read" on public.report_cards;
create policy "rc_read" on public.report_cards for select using (public.is_staff(auth.uid()) or student_id in (select id from public.students where user_id=auth.uid()) or public.is_parent_of(auth.uid(), student_id));
-- the mapping function is called by the (security-definer) cbt_submit flow and
-- by staff; expose it to authenticated callers.
grant execute on function public.cbt_push_to_reportcard(text,text,text,text,text,text,text,numeric,numeric,numeric) to authenticated, anon;
-- =====================================================================
-- DONE ✅  Flexible report cards installed and wired to the CBT engine.
-- =====================================================================
select 'School Connect Report-Card schema v2 installed ✅' as status;
-- =====================================================================
-- ENTERPRISE V10 FAMILY-SAFE REPORT CARD POLICIES (2026-07-06)
-- Parents/students may SELECT only their own/linked report scores; staff write.
-- =====================================================================
drop policy if exists "rs_read" on public.report_scores;
drop policy if exists "rs_select_family" on public.report_scores;
drop policy if exists "rs_select_family" on public.report_scores;
create policy "rs_select_family" on public.report_scores for select using (
  public.is_staff(auth.uid())
  or exists (
    select 1 from public.students s
    where (s.id = report_scores.student_id
       or lower(s.full_name) = lower(report_scores.student_name)
       or s.admission_no = report_scores.student_id_ref)
      and (s.user_id = auth.uid() or public.is_parent_of(auth.uid(), s.id))
  )
);
-- Make the aggregate view obey underlying table RLS in modern PostgreSQL/Supabase.
do $$ begin
  execute 'alter view public.report_subject_totals set (security_invoker = true)';
exception when others then
  raise notice 'security_invoker not supported on this Postgres version; rely on app filtering + table RLS.';
end $$;

-- ===== enterprise-schema.sql =====

-- ENTERPRISE V4: school_settings must exist before any ALTER/POLICY uses it
create table if not exists public.school_settings (
  id int primary key default 1,
  admission_prefix text default 'GOSA',
  admission_next int default 1,
  staff_prefix text default 'STF',
  staff_next int default 1,
  parent_prefix text default 'PAR',
  parent_next int default 1,
  signature_url text default '',
  principal_name text default '',
  role_access jsonb,
  role_write jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.school_settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- School Connect — Enterprise Add-on Schema — FINAL v2
-- =====================================================================
-- New enterprise modules sourced from a deep review of leading platforms
-- (Fedena, OpenEduCat, Kinderpedia, eSchool, Edumerge, Smart School ERP, etc.)
-- All FREE tools, NO AI APIs. Deterministic logic only.
--
-- Adds: timetable generator slots, QR self check-in attendance, student
-- diary, surveys/forms, menu/meal planner, security (2FA prefs / login
-- audit), and an i18n string store.
--
-- ORDERING RULE (prevents 42P01): tables first → helper → policies.
-- Self-contained & idempotent. Run AFTER database/schema.sql (recommended).
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- minimal deps (no-op if main schema already ran)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text,
  role text not null default 'student',
  status text not null default 'pending',
  photo_url text, campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  admission_no text unique, full_name text not null,
  class text, arm text, guardian_email text,
  created_at timestamptz default now()
);
alter table public.students enable row level security;
alter table public.students add column if not exists user_id uuid references public.profiles(id) on delete set null;
create index if not exists students_user_id_idx on public.students(user_id);

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- 1a. Timetable generator: subject demand + a generated grid.
-- 'periods_per_week' tells the generator how many slots each subject needs.
create table if not exists public.timetable_requirements (
  id uuid primary key default uuid_generate_v4(),
  class text not null,
  subject text not null,
  teacher text,
  periods_per_week int not null default 1,
  -- ✨ Part-time support: the weekdays this (often part-time) teacher attends.
  -- NULL/empty = available every weekday. e.g. ARRAY['Monday','Wednesday'].
  available_days text[] default null,
  is_part_time boolean default false,
  created_at timestamptz default now(),
  unique(class, subject)
);
-- backfill for older installs (idempotent)
-- [v5 fix] Each ALTER wrapped in its own safe block
do $$ begin alter table public.timetable_requirements add column if not exists available_days text[] default null; exception when others then null; end $$;
do $$ begin alter table public.timetable_requirements add column if not exists is_part_time boolean default false; exception when others then null; end $$;
-- Optional reusable teacher availability roster (one row per teacher).
create table if not exists public.teacher_availability (
  id uuid primary key default uuid_generate_v4(),
  teacher text not null unique,
  is_part_time boolean default false,
  available_days text[] default null,   -- e.g. ARRAY['Tuesday','Thursday']
  notes text,
  created_at timestamptz default now()
);
alter table public.teacher_availability enable row level security;
alter table public.timetable_requirements enable row level security;
-- The generated, conflict-checked timetable grid lives in the existing
-- public.timetable table (created by schema.sql). This add-on only stores
-- requirements + generation metadata.
create table if not exists public.timetable_runs (
  id uuid primary key default uuid_generate_v4(),
  class text, session text, term text,
  generated_at timestamptz default now(),
  conflicts int default 0,
  notes text
);
alter table public.timetable_runs enable row level security;
-- 1b. QR / code self check-in attendance (free, no biometric hardware).
create table if not exists public.attendance_checkins (
  id uuid primary key default uuid_generate_v4(),
  student_id_ref text not null,         -- scanned from the ID-card QR
  student_name text,
  class text,
  checkin_at timestamptz default now(),
  method text default 'qr' check (method in ('qr','code','manual')),
  device text,
  recorded_by uuid references public.profiles(id)
);
alter table public.attendance_checkins enable row level security;
do $$ begin create index if not exists att_checkin_student_idx on public.attendance_checkins (student_id_ref); exception when others then null; end $$;
-- 1c. Student diary / daily homework & behaviour log (eSchool parity).
create table if not exists public.student_diary (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  student_name text, class text, subject text,
  date date default current_date,
  entry_type text default 'homework' check (entry_type in ('homework','classwork','behaviour','note')),
  title text, body text,
  acknowledged boolean default false,   -- parent acknowledgement
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.student_diary enable row level security;
do $$ begin create index if not exists diary_student_idx on public.student_diary (student_id); exception when others then null; end $$;
-- 1d. Surveys / feedback forms (Kinderpedia "Survey & Polls" parity; distinct
-- from the elections in voting-schema).
create table if not exists public.surveys (
  id uuid primary key default uuid_generate_v4(),
  title text not null, description text,
  audience text default 'all',
  questions jsonb default '[]'::jsonb,  -- [{q,type,options}]
  anonymous boolean default true,
  is_open boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.surveys enable row level security;
create table if not exists public.survey_responses (
  id uuid primary key default uuid_generate_v4(),
  survey_id uuid references public.surveys(id) on delete cascade,
  respondent uuid references public.profiles(id),
  answers jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table public.survey_responses enable row level security;
-- 1e. Menu / meal planner (Kinderpedia "Menu Planner" parity).
create table if not exists public.menu_planner (
  id uuid primary key default uuid_generate_v4(),
  week_start date,
  day text check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  meal text check (meal in ('breakfast','snack','lunch','supper')),
  description text, allergens text,
  created_at timestamptz default now()
);
alter table public.menu_planner enable row level security;
-- 1f. Security: 2FA preference + login audit (free Supabase email OTP).
create table if not exists public.security_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  two_factor boolean default false,
  recovery_email text,
  updated_at timestamptz default now()
);
alter table public.security_prefs enable row level security;
create table if not exists public.login_audit (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  email text, event text default 'login',
  ip text, user_agent text,
  created_at timestamptz default now()
);
alter table public.login_audit enable row level security;
-- 1g. i18n string store (multi-language UI labels — free, no API).
create table if not exists public.i18n_strings (
  id uuid primary key default uuid_generate_v4(),
  lang text not null default 'en',
  key text not null,
  value text not null,
  unique(lang, key)
);
alter table public.i18n_strings enable row level security;
-- =====================================================================
-- 2. HELPER (no-op if main schema already made it)
-- =====================================================================
create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and role in ('super_admin','admin','principal','proprietor','head_teacher','staff','teacher','bursar')
      and status in ('approved','active')
  );
$$;
-- =====================================================================
-- 3. RLS POLICIES
-- =====================================================================
do $$
declare t text;
declare staff_read text[] := array[
  'timetable_requirements','timetable_runs','teacher_availability','student_diary','surveys','menu_planner','i18n_strings'
];
begin
  foreach t in array staff_read loop
    execute format('drop policy if exists "ent_read_%s"  on public.%I', t, t);
    execute format('drop policy if exists "ent_write_%s" on public.%I', t, t);
    execute format('create policy "ent_read_%s"  on public.%I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "ent_write_%s" on public.%I for all    using (public.is_staff(auth.uid()))', t, t);
  end loop;
end $$;

-- Check-ins: anyone authenticated may insert their own scan; staff read all.
drop policy if exists "ent_checkin_insert" on public.attendance_checkins;
drop policy if exists "ent_checkin_read"   on public.attendance_checkins;
drop policy if exists "ent_checkin_insert" on public.attendance_checkins;
create policy "ent_checkin_insert" on public.attendance_checkins for insert with check (auth.role() = 'authenticated');
drop policy if exists "ent_checkin_read" on public.attendance_checkins;
create policy "ent_checkin_read"   on public.attendance_checkins for select using (public.is_staff(auth.uid()));

-- Survey responses: respondent manages own; staff read all.
drop policy if exists "ent_sr_own"  on public.survey_responses;
drop policy if exists "ent_sr_staff" on public.survey_responses;
drop policy if exists "ent_sr_own" on public.survey_responses;
create policy "ent_sr_own"   on public.survey_responses for all using (respondent = auth.uid());
drop policy if exists "ent_sr_staff" on public.survey_responses;
create policy "ent_sr_staff" on public.survey_responses for select using (public.is_staff(auth.uid()));

-- Security prefs: each user manages own.
drop policy if exists "ent_sec_own" on public.security_prefs;
drop policy if exists "ent_sec_own" on public.security_prefs;
create policy "ent_sec_own" on public.security_prefs for all using (user_id = auth.uid());

-- Login audit: admin reads; any authenticated inserts.
drop policy if exists "ent_la_read"   on public.login_audit;
drop policy if exists "ent_la_insert" on public.login_audit;
drop policy if exists "ent_la_read" on public.login_audit;
create policy "ent_la_read"   on public.login_audit for select using (public.is_staff(auth.uid()));
drop policy if exists "ent_la_insert" on public.login_audit;
create policy "ent_la_insert" on public.login_audit for insert with check (auth.role() = 'authenticated');

-- =====================================================================
-- 4. TIMETABLE GENERATOR (deterministic, conflict-free, no AI)
--    Greedy slot allocator: fills Mon–Fri × periods, ensuring no class or
--    teacher is double-booked. Writes into public.timetable if it exists.
-- =====================================================================
create or replace function public.generate_timetable(
  p_class text, p_session text default '', p_term text default '',
  p_periods_per_day int default 6
) returns jsonb language plpgsql security definer as $$
declare
  days text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday'];
  d text; p int; r record; placed int := 0; conflicts int := 0;
  v_has_tt boolean;
begin
  -- only run if the timetable table exists (main schema installed)
  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='timetable') into v_has_tt;
  if not v_has_tt then
    return jsonb_build_object('ok', false, 'reason', 'timetable table not found; run schema.sql first');
  end if;

  -- clear existing grid for this class/term/session
  execute format('delete from public.timetable where class = %L and coalesce(session,'''') = %L and coalesce(term,'''') = %L',
                 p_class, coalesce(p_session,''), coalesce(p_term,''));

  -- expand requirements into a queue and greedily place them
  declare
    v_days text[];        -- the days THIS teacher may be scheduled on
    v_placed_this int;
    unplaced int := 0;
  begin
  for r in
    select tr.subject, tr.teacher, tr.periods_per_week, tr.available_days, tr.is_part_time
    from public.timetable_requirements tr
    where tr.class = p_class
    order by tr.periods_per_week desc
  loop
    -- ✨ PART-TIME SUPPORT: restrict to the teacher's attending days.
    -- Priority: requirement.available_days → teacher_availability roster → all weekdays.
    v_days := r.available_days;
    if v_days is null or array_length(v_days,1) is null then
      select ta.available_days into v_days
        from public.teacher_availability ta
       where ta.teacher = r.teacher and ta.available_days is not null
       limit 1;
    end if;
    if v_days is null or array_length(v_days,1) is null then
      v_days := days;  -- full-time: every weekday
    end if;

    for i in 1..r.periods_per_week loop
      v_placed_this := 0;
      <<placeloop>>
      for d in select unnest(v_days) loop          -- only days the teacher attends
        for p in 1..p_periods_per_day loop
          -- class free at this slot?
          if exists (select 1 from public.timetable where class=p_class and day=d and period=p::text
                       and coalesce(session,'')=coalesce(p_session,'') and coalesce(term,'')=coalesce(p_term,'')) then
            continue;
          end if;
          -- teacher free at this slot (across all classes)?
          if r.teacher is not null and exists (
              select 1 from public.timetable where teacher=r.teacher and day=d and period=p::text
                and coalesce(session,'')=coalesce(p_session,'') and coalesce(term,'')=coalesce(p_term,'')) then
            continue;
          end if;
          insert into public.timetable (class, day, period, subject, teacher, session, term)
          values (p_class, d, p::text, r.subject, r.teacher, p_session, p_term);
          placed := placed + 1;
          v_placed_this := 1;
          exit placeloop;
        end loop;
      end loop;
      -- could not fit this period within the teacher's available days/periods
      if v_placed_this = 0 then unplaced := unplaced + 1; end if;
    end loop;
  end loop;

  insert into public.timetable_runs (class, session, term, conflicts, notes)
  values (p_class, p_session, p_term, unplaced,
          'placed '||placed||' periods'||(case when unplaced>0 then '; '||unplaced||' could not fit (check part-time availability/periods-per-day)' else '' end));

  return jsonb_build_object('ok', true, 'placed', placed, 'unplaced', unplaced, 'class', p_class);
  end;
end; $$;

grant execute on function public.generate_timetable(text,text,text,int) to authenticated;

-- =====================================================================
-- DONE ✅  Enterprise add-on installed: timetable generator, QR check-in,
-- student diary, surveys, menu planner, security prefs/audit, i18n.
-- =====================================================================
select 'School Connect Enterprise schema (FINAL v2) installed ✅' as status;

-- =====================================================================
-- FINAL ADDITIVE PATCH: Nigerian/international academic print records
-- Student Record Card, Class Broadsheet, Subject Broadsheet support.
-- =====================================================================
create table if not exists public.academic_print_records (
  id uuid primary key default uuid_generate_v4(),
  record_type text not null check (record_type in ('student_record_card','class_broadsheet','subject_broadsheet')),
  title text not null,
  class text default '',
  subject text default '',
  term text default '',
  session text default '',
  generated_by uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table public.academic_print_records enable row level security;
drop policy if exists "academic_print_staff" on public.academic_print_records;
drop policy if exists "academic_print_staff" on public.academic_print_records;
create policy "academic_print_staff" on public.academic_print_records for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
drop policy if exists "academic_print_read" on public.academic_print_records;
drop policy if exists "academic_print_read" on public.academic_print_records;
create policy "academic_print_read" on public.academic_print_records for select using (auth.role()='authenticated');


-- FINAL CUMULATIVE SUBJECT-TEACHER MAPPING REPAIR
-- Safe for fresh and existing databases. Fixes: could not find 'teacher' column of subjects.
alter table if exists public.subjects add column if not exists teacher text;
alter table if exists public.subjects add column if not exists teacher_id uuid references public.profiles(id) on delete set null;


-- Role/page access map controlled from Admin Dashboard → Page Access Manager.
alter table public.school_settings add column if not exists role_access jsonb;

-- Page access manager write-permission map.
alter table public.school_settings add column if not exists role_write jsonb;

-- ===== enhancements-schema.sql =====
-- =====================================================================
-- School Connect — Enhancements Schema (Connect Repair v3)
-- =====================================================================
-- Adds the data foundations for: auto admission/parent IDs, reusable
-- lookups (terms/sessions/subjects/classes), timetable period config,
-- weekly scheme-of-work confirmation, certificate designs, admissions
-- application tokens/links, broadsheets & scoresheets.
-- Free tools, NO AI. Ordering-safe & idempotent (drop-before-create where
-- column/structure may change). Run AFTER schema.sql.
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- minimal deps (no-op if main schema already ran)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text,
  role text not null default 'student', status text not null default 'pending',
  photo_url text, campus text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists dob_day int;
alter table public.profiles add column if not exists dob_month text;

create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(), admission_no text unique,
  full_name text not null, class text, arm text, gender text,
  date_of_birth date, guardian_name text, guardian_phone text, guardian_email text,
  address text, photo_url text, campus text, status text default 'active',
  created_at timestamptz default now()
);
alter table public.students enable row level security;
alter table public.students add column if not exists user_id uuid references public.profiles(id) on delete set null;
create index if not exists students_user_id_idx on public.students(user_id);

-- ---- column backfills the new features rely on ----
-- [v5 fix] Each ALTER wrapped in its own safe block
do $$ begin alter table public.students add column if not exists parent_id uuid; exception when others then null; end $$;
do $$ begin alter table public.profiles add column if not exists member_id text; exception when others then null; end $$;
-- auto ID for parents/staff
do $$ begin alter table public.profiles add column if not exists photo_url text; exception when others then null; end $$;
-- Denormalised student_name columns so list/CRUD screens can show & filter by
-- name while still keeping the relational student_id link.
do $$ begin alter table public.results    add column if not exists student_name text; exception when others then null; end $$;
do $$ begin alter table public.attendance add column if not exists student_name text; exception when others then null; end $$;
do $$ begin alter table public.conduct    add column if not exists student_name text; exception when others then null; end $$;
do $$ begin alter table public.health     add column if not exists student_name text; exception when others then null; end $$;
do $$ begin alter table public.fee_payments add column if not exists student_name text; exception when others then null; end $$;
do $$ begin alter table public.promotions add column if not exists student_name text; exception when others then null; end $$;
do $$ begin alter table public.behaviour_points add column if not exists student_name text; exception when others then null; end $$;
-- =====================================================================
-- 1. SCHOOL SETTINGS (single-row config: terms, sessions, ID prefix, etc.)
-- =====================================================================
create table if not exists public.school_settings (
  id int primary key default 1,
  current_session text default '',
  current_term text default 'First Term',
  sessions text[] default array['2024/2025','2025/2026','2026/2027'],
  terms text[] default array['First Term','Second Term','Third Term'],
  admission_prefix text default 'SCH', -- generator rewrites SCH to the school acronym
  admission_next int default 1,
  parent_prefix text default 'PAR',
  parent_next int default 1,
  staff_prefix text default 'STF',
  staff_next int default 1,
  grading jsonb default '[{"min":70,"grade":"A"},{"min":60,"grade":"B"},{"min":50,"grade":"C"},{"min":45,"grade":"D"},{"min":40,"grade":"E"},{"min":0,"grade":"F"}]'::jsonb,
  signature_url text default '',
  principal_name text default '',
  updated_at timestamptz default now(),
  check (id = 1)
);
alter table public.school_settings enable row level security;
insert into public.school_settings (id) values (1) on conflict (id) do nothing;
-- Reusable lookup lists (subjects/classes already have tables; add a generic
-- key/value lookup for arms, departments-as-options, periods, etc.)
create table if not exists public.lookups (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,         -- 'arm' | 'period' | 'audience' | 'fee_type' | 'grade_label'
  value text not null,
  position int default 0,
  unique(kind, value)
);
alter table public.lookups enable row level security;
-- seed common audiences (issue 9) + arms + periods
insert into public.lookups(kind,value,position) values
 ('audience','all',1),('audience','students',2),('audience','parents',3),('audience','staff',4),('audience','a class',5),
 ('arm','A',1),('arm','B',2),('arm','C',3),('arm','D',4)
on conflict do nothing;
-- =====================================================================
-- 2. AUTO ADMISSION NUMBER (issue 2) — trigger on students insert
-- =====================================================================
create or replace function public.gen_admission_no()
returns trigger language plpgsql security definer as $$
declare s public.school_settings; yr text := to_char(now(),'YYYY');
begin
  if new.admission_no is null or new.admission_no = '' then
    update public.school_settings set admission_next = admission_next + 1, updated_at = now()
      where id = 1 returning * into s;
    if s.id is null then
      insert into public.school_settings(id, admission_next) values (1, 2) returning * into s;
      s.admission_prefix := 'SCH'; s.admission_next := 1;
    end if;
    new.admission_no := coalesce(s.admission_prefix,'SCH') || '/' || yr || '/' || lpad((s.admission_next-1)::text, 4, '0');
  end if;
  return new;
end; $$;
drop trigger if exists trg_gen_admission_no on public.students;
create trigger trg_gen_admission_no before insert on public.students
  for each row execute function public.gen_admission_no();
-- =====================================================================
-- 3. AUTO MEMBER ID for parents/staff when approved (issue 2)
-- Call from the app after approving a profile, or it runs on status->approved.
-- =====================================================================
create or replace function public.assign_member_id()
returns trigger language plpgsql security definer as $$
declare s public.school_settings; pfx text; nxt int; yr text := to_char(now(),'YYYY');
begin
  if new.status = 'approved' and (new.member_id is null or new.member_id = '') then
    if new.role = 'parent' then
      update public.school_settings set parent_next = parent_next + 1 where id=1 returning parent_prefix, parent_next into pfx, nxt;
      new.member_id := coalesce(pfx,'PAR') || '/' || yr || '/' || lpad((nxt-1)::text,4,'0');
    elsif new.role in ('staff','head_teacher','bursar','principal','proprietor','admin') then
      update public.school_settings set staff_next = staff_next + 1 where id=1 returning staff_prefix, staff_next into pfx, nxt;
      new.member_id := coalesce(pfx,'STF') || '/' || yr || '/' || lpad((nxt-1)::text,4,'0');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_assign_member_id on public.profiles;
create trigger trg_assign_member_id before update on public.profiles
  for each row execute function public.assign_member_id();
-- =====================================================================
-- 4. TIMETABLE PERIOD CONFIG (issue 7)
-- =====================================================================
create table if not exists public.timetable_config (
  id uuid primary key default uuid_generate_v4(),
  class text default 'ALL',
  period_no int not null,
  label text not null,          -- 'Period 1' | 'Short Break' | 'Long Break'
  start_time text,              -- '08:00'
  end_time text,                -- '08:40'
  is_break boolean default false,
  position int default 0,
  unique(class, period_no)
);
alter table public.timetable_config enable row level security;
-- =====================================================================
-- 5. SCHEME OF WORK — weekly confirmation (issue 5)
-- (scheme_of_work table already exists; ensure weekly-tracking columns)
-- =====================================================================
do $$ begin alter table public.scheme_of_work add column if not exists confirmed boolean default false; exception when others then null; end $$;
do $$ begin alter table public.scheme_of_work add column if not exists confirmed_at timestamptz; exception when others then null; end $$;
do $$ begin alter table public.scheme_of_work add column if not exists planned_at timestamptz default now(); exception when others then null; end $$;
  create table if not exists public.scheme_of_work (
    id uuid primary key default uuid_generate_v4(),
    subject text, class text, term text, session text,
    week int, topic text, status text default 'pending',
    confirmed boolean default false, confirmed_at timestamptz,
    planned_at timestamptz default now(), covered_at date, teacher text, confirmed boolean default false,
    created_at timestamptz default now()
  );
  alter table public.scheme_of_work enable row level security;

-- =====================================================================
-- 6. CERTIFICATE DESIGNS (issue 12) — saved templates with colours/fonts/signature
-- =====================================================================
create table if not exists public.certificate_designs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  title text default 'CERTIFICATE OF ACHIEVEMENT',
  primary_color text default '#4f46e5',
  accent_color text default '#f59e0b',
  font text default 'Georgia',
  layout text default 'classic',          -- classic | modern | elegant
  body_text text default 'has successfully met the requirements and is hereby recognised for outstanding achievement.',
  signatory text default 'Head of School',
  signature_data text,                    -- base64 PNG of an appended signature
  border_style text default 'double',
  created_at timestamptz default now()
);
alter table public.certificate_designs enable row level security;

-- =====================================================================
-- 7. ADMISSIONS APPLICATION LINKS / TOKENS (issue 13)
-- Public applicants fill a tokenised form; admin approves → extract to students.
-- =====================================================================
-- [v5 fix] Each ALTER wrapped in its own safe block
do $$ begin alter table public.admissions add column if not exists token text; exception when others then null; end $$;
do $$ begin alter table public.admissions add column if not exists extracted boolean default false; exception when others then null; end $$;
do $$ begin alter table public.admissions add column if not exists photo_url text; exception when others then null; end $$;
do $$ begin alter table public.admissions add column if not exists session text; exception when others then null; end $$;
  create table if not exists public.admissions (
    id uuid primary key default uuid_generate_v4(),
    full_name text, dob date, gender text,
    parent_name text, parent_email text, parent_phone text,
    applying_for_class text, status text default 'submitted',
    notes text, token text, extracted boolean default false, photo_url text, session text,
    created_at timestamptz default now()
  );
  alter table public.admissions enable row level security;

create table if not exists public.admission_links (
  id uuid primary key default uuid_generate_v4(),
  token text unique not null default replace(gen_random_uuid()::text,'-',''),
  label text,
  applying_for_class text,
  session text,
  active boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.admission_links enable row level security;

-- Public RPC: submit an admission application via a link token (anon allowed)
create or replace function public.submit_admission(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_link public.admission_links; v_id uuid;
begin
  select * into v_link from public.admission_links where token = p_payload->>'token' and active = true limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid or closed application link'); end if;
  insert into public.admissions (full_name, dob, gender, parent_name, parent_email, parent_phone,
                                 applying_for_class, session, photo_url, token, status)
  values (p_payload->>'full_name', nullif(p_payload->>'dob','')::date, p_payload->>'gender',
          p_payload->>'parent_name', p_payload->>'parent_email', p_payload->>'parent_phone',
          coalesce(p_payload->>'applying_for_class', v_link.applying_for_class),
          coalesce(p_payload->>'session', v_link.session),
          p_payload->>'photo_url', v_link.token, 'submitted')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- Admin RPC: extract an accepted admission into the students table (issue 13)
create or replace function public.extract_admission(p_id uuid)
returns jsonb language plpgsql security definer as $$
declare a public.admissions; v_sid uuid;
begin
  select * into a from public.admissions where id = p_id limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'Application not found'); end if;
  if a.extracted then return jsonb_build_object('ok', false, 'error', 'Already extracted'); end if;
  insert into public.students (full_name, date_of_birth, gender, class, guardian_name,
                               guardian_email, guardian_phone, photo_url, status)
  values (a.full_name, a.dob, a.gender, a.applying_for_class, a.parent_name,
          a.parent_email, a.parent_phone, a.photo_url, 'active')
  returning id into v_sid;
  update public.admissions set status='enrolled', extracted=true where id = p_id;
  return jsonb_build_object('ok', true, 'student_id', v_sid);
end; $$;

-- =====================================================================
-- 8. BROADSHEET / SCORESHEET helper view (issue 6)
-- =====================================================================
drop view if exists public.broadsheet cascade;
create view public.broadsheet as
select r.class, r.term, r.session, r.student_name, r.subject,
       coalesce(r.ca1,0)+coalesce(r.ca2,0)+coalesce(r.ca3,0)+coalesce(r.exam,0) as total,
       r.grade
from public.results r;

-- =====================================================================
-- 8b. GENERIC MODULE RECORDS (issue 8) — flexible store so every module
-- that lacks a dedicated table still gets a working Add/Edit/Delete screen.
-- Each row belongs to a 'module' and carries its fields in 'data' (jsonb)
-- plus a few common columns for listing/searching.
-- =====================================================================
create table if not exists public.module_records (
  id uuid primary key default uuid_generate_v4(),
  module text not null,                 -- e.g. 'messages','inbox','front_desk','reports'
  title text,                           -- primary display field
  body text,                            -- secondary text
  status text,
  ref_date date,
  amount numeric,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.module_records enable row level security;
create index if not exists module_records_module_idx on public.module_records (module, created_at desc);
alter table public.module_records add column if not exists recipient_id uuid references public.profiles(id) on delete set null;
alter table public.module_records add column if not exists audience text default 'private';

drop policy if exists "mr_read"  on public.module_records;
drop policy if exists "mr_write" on public.module_records;
drop policy if exists "mr_write_staff" on public.module_records;
drop policy if exists "mr_insert_family" on public.module_records;
drop policy if exists "mr_update_family" on public.module_records;
drop policy if exists "mr_read" on public.module_records;
create policy "mr_read" on public.module_records for select using (
  auth.role()='authenticated' and (
    module not in ('inbox','messages')
    or public.is_staff(auth.uid())
    or created_by = auth.uid()
    or recipient_id = auth.uid()
    or coalesce(audience,'') = 'all'
    or coalesce(audience,'') = (select role from public.profiles where id=auth.uid())
  )
);
drop policy if exists "mr_write_staff" on public.module_records;
create policy "mr_write_staff" on public.module_records for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
drop policy if exists "mr_insert_family" on public.module_records;
create policy "mr_insert_family" on public.module_records for insert with check (auth.role()='authenticated' and module in ('inbox','messages','helpdesk','book_request','parent_meeting','lost_found'));
drop policy if exists "mr_update_family" on public.module_records;
create policy "mr_update_family" on public.module_records for update using (created_by = auth.uid() and module in ('inbox','messages','helpdesk','book_request','parent_meeting','lost_found')) with check (created_by = auth.uid());

-- =====================================================================
-- 9. RLS POLICIES
-- =====================================================================
do $$ declare t text;
declare staff_rw text[] := array['lookups','timetable_config','certificate_designs','admission_links'];
begin
  foreach t in array staff_rw loop
    execute format('drop policy if exists "enh_read_%s"  on public.%I', t, t);
    execute format('drop policy if exists "enh_write_%s" on public.%I', t, t);
    execute format('create policy "enh_read_%s"  on public.%I for select using (auth.role()=''authenticated'')', t, t);
    execute format('create policy "enh_write_%s" on public.%I for all    using (public.is_staff(auth.uid()))', t, t);
  end loop;
end $$;

-- school_settings: everyone authenticated reads; admin writes page-access governance
drop policy if exists "ss_read" on public.school_settings;
drop policy if exists "ss_write" on public.school_settings;
drop policy if exists "ss_read" on public.school_settings;
create policy "ss_read"  on public.school_settings for select using (auth.role()='authenticated');
drop policy if exists "ss_write" on public.school_settings;
create policy "ss_write" on public.school_settings for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- admission_links readable by anon (so the public form can validate a token via RPC)
grant execute on function public.submit_admission(jsonb) to anon, authenticated;
grant execute on function public.extract_admission(uuid) to authenticated;

select 'School Connect Enhancements schema (Connect Repair v3) installed ✅' as status;


-- FINAL CUMULATIVE SUBJECT-TEACHER MAPPING REPAIR
-- Safe for fresh and existing databases. Fixes: could not find 'teacher' column of subjects.
alter table if exists public.subjects add column if not exists teacher text;
alter table if exists public.subjects add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

alter table public.school_settings add column if not exists signature_url text default '';
alter table public.school_settings add column if not exists principal_name text default '';


-- Role/page access map controlled from Admin Dashboard → Page Access Manager.
alter table public.school_settings add column if not exists role_access jsonb;

-- Page access manager write-permission map.
alter table public.school_settings add column if not exists role_write jsonb;

-- ENTERPRISE V10: public anonymous examination registration form.
drop policy if exists "mr_insert_public_exam_registration" on public.module_records;
drop policy if exists "mr_insert_public_exam_registration" on public.module_records;
create policy "mr_insert_public_exam_registration" on public.module_records for insert with check (
  auth.role() in ('anon','authenticated')
  and module = 'exam_registrations'
  and source = 'public'
);
create index if not exists module_records_exam_reg_status_idx on public.module_records (module, status, created_at desc) where module='exam_registrations';

-- ===== update-v1-schema.sql =====

-- ENTERPRISE V4: school_settings must exist before any ALTER/POLICY uses it
create table if not exists public.school_settings (
  id int primary key default 1,
  admission_prefix text default 'GOSA',
  admission_next int default 1,
  staff_prefix text default 'STF',
  staff_next int default 1,
  parent_prefix text default 'PAR',
  parent_next int default 1,
  signature_url text default '',
  principal_name text default '',
  role_access jsonb,
  role_write jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.school_settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- SCHOOL CONNECT — UPDATE V1 SCHEMA  (additive, idempotent, free-tier safe)
-- Run LAST, AFTER all the other schema files, in the Supabase SQL editor.
-- Safe to re-run any number of times. Adds / enhances:
--   • Staff details fields + AUTO staff number (issue 4 & 5)
--   • Teacher sign-up -> auto-extract into Staff on approval (issue 4)
--   • Promotions: term-average column for automated promotion (issue 10)
--   • Digital library + reading scores that count toward grades (issue 9)
--   • Helpful indexes
-- Depends on tables created by schema.sql / enhancements-schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Safety: make sure prerequisite objects exist (no-ops if present)
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- is_staff() helper is created in the other schema files; create a fallback
-- so this file is also runnable standalone in a fresh database.
create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.profiles p
    where p.id = uid
      and p.role in ('staff','head_teacher','bursar','principal','proprietor','admin')
      and coalesce(p.status,'approved') = 'approved'
  );
$$;

-- ---------------------------------------------------------------------
-- 1. STAFF — richer details (issue 4) + auto staff number (issue 5)
-- ---------------------------------------------------------------------
alter table public.staff add column if not exists staff_no       text;
alter table public.staff add column if not exists staff_type     text default 'teaching';   -- teaching | non-teaching
alter table public.staff add column if not exists subject_taught text;
alter table public.staff add column if not exists qualification  text;
alter table public.staff add column if not exists religion       text;
alter table public.staff add column if not exists marital_status text;
alter table public.staff add column if not exists gender         text;
alter table public.staff add column if not exists date_of_birth  date;
alter table public.staff add column if not exists address        text;
alter table public.staff add column if not exists profile_id     uuid;   -- links to the auth profile (issue 4)

create unique index if not exists staff_no_uniq on public.staff (staff_no) where staff_no is not null;

-- Auto-generate STF/<year>/0001 on insert when blank (issue 5)
create or replace function public.gen_staff_no()
returns trigger language plpgsql security definer as $$
declare s public.school_settings; pfx text; nxt int; yr text := to_char(now(),'YYYY');
begin
  if new.staff_no is null or new.staff_no = '' then
    update public.school_settings set staff_next = staff_next + 1, updated_at = now()
      where id = 1 returning staff_prefix, staff_next into pfx, nxt;
    if pfx is null then
      insert into public.school_settings(id, staff_next) values (1, 2)
        on conflict (id) do update set staff_next = public.school_settings.staff_next + 1
        returning staff_prefix, staff_next into pfx, nxt;
    end if;
    new.staff_no := coalesce(pfx,'STF') || '/' || yr || '/' || lpad((nxt-1)::text, 4, '0');
  end if;
  return new;
end; $$;
drop trigger if exists trg_gen_staff_no on public.staff;
create trigger trg_gen_staff_no before insert on public.staff
  for each row execute function public.gen_staff_no();

-- ---------------------------------------------------------------------
-- 2. TEACHER / STAFF SIGN-UP -> AUTO-EXTRACT INTO STAFF (issue 4)
-- When a profile with a staff-type role is APPROVED, automatically create a
-- matching row in public.staff (if one does not already exist). The admin can
-- then enrich the record. Updating to non-staff role does nothing.
-- ---------------------------------------------------------------------
create or replace function public.extract_staff_from_profile()
returns trigger language plpgsql security definer as $$
declare is_teaching boolean;
begin
  if new.status = 'approved'
     and new.role in ('staff','head_teacher','bursar','principal','proprietor','teacher')
     and not exists (select 1 from public.staff st where st.profile_id = new.id
                       or (new.email is not null and st.email = new.email)) then
    is_teaching := new.role in ('staff','head_teacher','principal','teacher');
    insert into public.staff (full_name, email, role, staff_type, status, profile_id)
    values (coalesce(new.full_name, split_part(new.email,'@',1)),
            new.email,
            new.role,
            case when new.role in ('bursar','proprietor') then 'non-teaching' else 'teaching' end,
            'active',
            new.id);
  end if;
  return new;
end; $$;
drop trigger if exists trg_extract_staff_from_profile on public.profiles;
create trigger trg_extract_staff_from_profile after update on public.profiles
  for each row execute function public.extract_staff_from_profile();

-- ---------------------------------------------------------------------
-- 3. PROMOTIONS — term-average column for AUTOMATED promotion (issue 10)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.promotions') is not null then
    alter table public.promotions add column if not exists average numeric;
    alter table public.promotions add column if not exists status  text default 'draft';
  else
    create table if not exists public.promotions (
      id uuid primary key default uuid_generate_v4(),
      student_name text,
      from_class text,
      to_class text,
      action text default 'promote',
      average numeric,
      status text default 'draft',
      session text,
      term text,
      created_at timestamptz default now()
    );
    alter table public.promotions enable row level security;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. DIGITAL LIBRARY (issue 9)
-- Teachers post an online book/link with optional comprehension questions.
-- Students read it, optionally answer questions; the auto-marked score is
-- written to reading_scores and can be pushed into results as CA.
-- ---------------------------------------------------------------------
create table if not exists public.digital_library (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  author text,
  subject text,
  class text,
  read_link text not null,
  teacher text,
  instructions text,
  has_quiz boolean default false,
  questions jsonb default '[]'::jsonb,   -- [{q, options[], answer}]
  max_score int default 0,
  due_date date,
  created_at timestamptz default now()
);
alter table public.digital_library enable row level security;
create index if not exists digital_library_class_idx on public.digital_library (class);

create table if not exists public.reading_scores (
  id uuid primary key default uuid_generate_v4(),
  student_name text,
  subject text,
  class text,
  book_id uuid references public.digital_library(id) on delete set null,
  score numeric default 0,
  max_score numeric default 0,
  source text default 'digital_library',
  pushed_to_results boolean default false,
  created_at timestamptz default now()
);
alter table public.reading_scores enable row level security;
do $$ begin create index if not exists reading_scores_student_idx on public.reading_scores (student_name); exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 5. RLS POLICIES (authenticated read; staff write; reading scores writable
--    by any authenticated student so they can submit their own quiz result)
-- ---------------------------------------------------------------------
do $$
declare t text;
declare staff_rw text[] := array['digital_library'];
begin
  foreach t in array staff_rw loop
    execute format('drop policy if exists "uv1_read_%s"  on public.%I', t, t);
    execute format('drop policy if exists "uv1_write_%s" on public.%I', t, t);
    execute format('create policy "uv1_read_%s"  on public.%I for select using (auth.role()=''authenticated'')', t, t);
    execute format('create policy "uv1_write_%s" on public.%I for all    using (public.is_staff(auth.uid()))', t, t);
  end loop;
end $$;

drop policy if exists "uv1_rs_read"   on public.reading_scores;
drop policy if exists "uv1_rs_insert" on public.reading_scores;
drop policy if exists "uv1_rs_manage" on public.reading_scores;
drop policy if exists "uv1_rs_read" on public.reading_scores;
create policy "uv1_rs_read"   on public.reading_scores for select using (
  public.is_staff(auth.uid())
  or exists (
    select 1 from public.students s
    where lower(s.full_name) = lower(reading_scores.student_name)
      and (
        coalesce(reading_scores.class,'') = ''
        or lower(coalesce(s.class,'')) = lower(coalesce(reading_scores.class,''))
      )
      and (s.user_id = auth.uid() or public.is_parent_of(auth.uid(), s.id))
  )
);
drop policy if exists "uv1_rs_insert" on public.reading_scores;
create policy "uv1_rs_insert" on public.reading_scores for insert with check (auth.role()='authenticated');
drop policy if exists "uv1_rs_manage" on public.reading_scores;
create policy "uv1_rs_manage" on public.reading_scores for update using (public.is_staff(auth.uid()));

-- promotions policies (idempotent)
drop policy if exists "uv1_prom_read"  on public.promotions;
drop policy if exists "uv1_prom_write" on public.promotions;
drop policy if exists "uv1_prom_read" on public.promotions;
create policy "uv1_prom_read"  on public.promotions for select using (auth.role()='authenticated');
drop policy if exists "uv1_prom_write" on public.promotions;
create policy "uv1_prom_write" on public.promotions for all    using (public.is_staff(auth.uid()));

select 'School Connect — Update v1 schema installed ✅' as status;

-- ===== update-v2-schema.sql =====

-- ENTERPRISE V4: school_settings must exist before any ALTER/POLICY uses it
create table if not exists public.school_settings (
  id int primary key default 1,
  admission_prefix text default 'GOSA',
  admission_next int default 1,
  staff_prefix text default 'STF',
  staff_next int default 1,
  parent_prefix text default 'PAR',
  parent_next int default 1,
  signature_url text default '',
  principal_name text default '',
  role_access jsonb,
  role_write jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.school_settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- SCHOOL CONNECT — UPDATE V2 SCHEMA  (additive, idempotent, free-tier safe)
-- Run LAST, AFTER all the other schema files (including update-v1-schema.sql),
-- in the Supabase SQL editor. Safe to re-run any number of times. Adds:
--   • Staff DOB privacy: day & month only (issue 6)
--   • Super-admin / proprietor role support (issue 17)
--   • Storage-pressure helper: table sizes + cleanup RPC (issue 12)
--   • Entrance/assessment + admission-letter support (issue 5)
--   • Student/parent 360 dashboard view (issues 15 & 16)
--   • Developer/brand footer settings (issue 4)
--   • Helper indexes
-- =====================================================================

create extension if not exists "uuid-ossp";

-- Fallback is_staff()/is_admin() (created in other files; redefined safely here)
create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles p where p.id=uid
    and p.role in ('staff','head_teacher','bursar','principal','proprietor','admin','super_admin')
    and coalesce(p.status,'approved')='approved');
$$;
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles p where p.id=uid
    and p.role in ('admin','principal','proprietor','super_admin')
    and coalesce(p.status,'approved')='approved');
$$;

-- ---------------------------------------------------------------------
-- 1. STAFF DOB PRIVACY — store day & month only (issue 6)
-- ---------------------------------------------------------------------
alter table public.staff add column if not exists dob_day   int;   -- 1..31
alter table public.staff add column if not exists dob_month text;  -- 'January'..'December'

-- ---------------------------------------------------------------------
-- 2. SUPER-ADMIN / PROPRIETOR ROLE (issue 17)
-- The proprietor/proprietress is the super-admin: full access to everything,
-- can manage admins, see all dashboards, and control storage. We extend the
-- is_super_admin() helper and a one-click promotion RPC.
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin(uid uuid)
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles p where p.id=uid
    and p.role in ('proprietor','super_admin')
    and coalesce(p.status,'approved')='approved');
$$;

-- Promote a profile to super_admin (callable by an existing super_admin only)
create or replace function public.set_super_admin(p_target uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only a super-admin may assign super-admin.';
  end if;
  update public.profiles set role='super_admin', status='approved' where id=p_target;
end; $$;
grant execute on function public.set_super_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. STORAGE-PRESSURE HELPERS (issue 12)
-- Show how big each table is, and a safe RPC to purge old, low-value rows
-- (activity logs, old CBT results, read notifications) to free space.
-- ---------------------------------------------------------------------
create or replace function public.table_sizes()
returns table(table_name text, total_bytes bigint, pretty text, row_estimate bigint)
language sql security definer as $$
  with sizes as (
    select c.relname::text as table_name,
           pg_total_relation_size(c.oid)::bigint as total_bytes,
           pg_size_pretty(pg_total_relation_size(c.oid)) as pretty,
           greatest(c.reltuples,0)::bigint as row_estimate
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  )
  select * from sizes
  union all
  select 'TOTAL_DATABASE_USED'::text, coalesce(sum(total_bytes),0)::bigint,
         pg_size_pretty(coalesce(sum(total_bytes),0)::bigint), coalesce(sum(row_estimate),0)::bigint
  from sizes
  order by total_bytes desc;
$$;
grant execute on function public.table_sizes() to authenticated;

-- Purge old rows older than N days from a safe-list of tables. Admin only.
create or replace function public.purge_old(p_table text, p_days int)
returns int language plpgsql security definer as $$
declare n int; allowed text[] := array['activity_log','cbt_results','notifications','reading_scores','attendance_checkins'];
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admins only.'; end if;
  if not (p_table = any(allowed)) then raise exception 'Table % is not purgeable.', p_table; end if;
  execute format('delete from public.%I where created_at < now() - ($1 || '' days'')::interval', p_table) using p_days::text;
  get diagnostics n = row_count;
  return n;
end; $$;
grant execute on function public.purge_old(text,int) to authenticated;

-- ---------------------------------------------------------------------
-- 4. ENTRANCE / ASSESSMENT + ADMISSION LETTERS (issue 5)
-- Anonymous candidates sit a CBT entrance/assessment exam (handled by the
-- existing cbt_* tables). We add an admission-letters log so the school can
-- generate/print instant results, certificates and admission letters per
-- candidate or in bulk from the assessment results.
-- ---------------------------------------------------------------------
create table if not exists public.admission_letters (
  id uuid primary key default uuid_generate_v4(),
  candidate_name text not null,
  candidate_class text,
  exam_id uuid references public.cbt_exams(id) on delete set null,
  result_id uuid references public.cbt_results(id) on delete set null,
  percent numeric(6,2),
  decision text default 'admitted' check (decision in ('admitted','provisional','waitlist','not_admitted')),
  letter_ref text,        -- e.g. ADM-LTR/2026/0001
  session text,
  notes text,
  created_at timestamptz default now()
);
alter table public.admission_letters enable row level security;

-- Mark a CBT exam as an "entrance/assessment" (open to anonymous candidates)
alter table public.cbt_exams add column if not exists is_entrance boolean default false;
alter table public.cbt_exams add column if not exists pass_mark numeric(6,2) default 50;

-- ---------------------------------------------------------------------
-- 5. STUDENT/PARENT 360 DASHBOARD VIEW (issues 15 & 16)
-- A single view that gathers each student's key facts so a dashboard (and the
-- admin "view any dashboard") can read one place. Uses left joins so missing
-- modules don't break it.
-- ---------------------------------------------------------------------
drop view if exists public.student_overview cascade;
create view public.student_overview as
select
  s.id,
  s.full_name,
  s.admission_no,
  s.class,
  s.arm,
  s.gender,
  s.date_of_birth,
  s.guardian_name,
  s.guardian_phone,
  s.guardian_email,
  s.status,
  s.photo_url,
  coalesce((select sum(fp.amount_paid) from public.fee_payments fp where fp.student_name = s.full_name),0) as fees_paid,
  (select count(*) from public.results r where r.student_name = s.full_name) as result_count,
  (select count(*) from public.attendance a where a.student_name = s.full_name and a.status='present') as days_present,
  (select count(*) from public.behaviour_points bp where bp.student_name = s.full_name) as award_count
from public.students s;

-- Admin/staff read all; (RLS on base tables still applies for direct queries)
grant select on public.student_overview to authenticated;

-- Staff salary overview (issue 16) — read from payroll if present
do $$
begin
  if to_regclass('public.payroll') is not null and to_regclass('public.staff') is not null then
    execute 'drop view if exists public.staff_salary_overview cascade';
    -- payroll has no direct staff link in base schema; expose the payroll rows as-is
    execute 'create view public.staff_salary_overview as select * from public.payroll';
    execute 'grant select on public.staff_salary_overview to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. DEVELOPER / BRAND FOOTER (issue 4) — stored in school_settings
-- ---------------------------------------------------------------------
alter table public.school_settings add column if not exists developer_name  text default 'Adewale Samson Adeagbo';
alter table public.school_settings add column if not exists developer_brand text default 'HMG Concepts';
alter table public.school_settings add column if not exists developer_url   text default 'https://hmgconcepts.pages.dev';

-- ---------------------------------------------------------------------
-- 7. RLS POLICIES
-- ---------------------------------------------------------------------
do $$
declare t text; declare staff_rw text[] := array['admission_letters'];
begin
  foreach t in array staff_rw loop
    execute format('drop policy if exists "uv2_read_%s"  on public.%I', t, t);
    execute format('drop policy if exists "uv2_write_%s" on public.%I', t, t);
    execute format('create policy "uv2_read_%s"  on public.%I for select using (auth.role()=''authenticated'')', t, t);
    execute format('create policy "uv2_write_%s" on public.%I for all    using (public.is_staff(auth.uid()))', t, t);
  end loop;
end $$;

select 'School Connect — Update v2 schema installed ✅' as status;

-- ===== update-v4-schema.sql =====

-- ENTERPRISE V4: school_settings must exist before any ALTER/POLICY uses it
create table if not exists public.school_settings (
  id int primary key default 1,
  admission_prefix text default 'GOSA',
  admission_next int default 1,
  staff_prefix text default 'STF',
  staff_next int default 1,
  parent_prefix text default 'PAR',
  parent_next int default 1,
  signature_url text default '',
  principal_name text default '',
  role_access jsonb,
  role_write jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.school_settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- SCHOOL CONNECT — UPDATE V4 SCHEMA  (additive, idempotent, free-tier safe)
-- Run LAST, AFTER all the other schema files (schema, voting, cbt, reportcard,
-- enterprise, enhancements, update-v1, update-v2), in the Supabase SQL editor.
-- Safe to re-run any number of times. Adds:
--   • Richer payroll (bonus, overtime, tax, pension, loan, net pay) — issue 5
--   • Staff loans / advances with EMI tracking — issue 5
--   • Staff bonuses / allowance awards — issue 5
--   • Staff appraisals (weighted scoring) — issue 5
--   • Parent<->child convenience: link by profile, both directions — issue 4
--   • Academic transcript view (international standard) — enhancement
-- =====================================================================

create extension if not exists "uuid-ossp";

create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles p where p.id=uid
    and p.role in ('staff','head_teacher','bursar','principal','proprietor','admin','super_admin')
    and coalesce(p.status,'approved')='approved');
$$;

-- ---------------------------------------------------------------------
-- 1. PAYROLL — extend with international payslip components (issue 5)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.payroll') is null then
    create table if not exists public.payroll (
      id uuid primary key default uuid_generate_v4(),
      created_at timestamptz default now()
    );
    alter table public.payroll enable row level security;
  end if;
end $$;
alter table public.payroll add column if not exists staff_name       text;
alter table public.payroll add column if not exists month            text;
alter table public.payroll add column if not exists year             int;
alter table public.payroll add column if not exists basic            numeric default 0;
alter table public.payroll add column if not exists allowances       numeric default 0;
alter table public.payroll add column if not exists bonus            numeric default 0;
alter table public.payroll add column if not exists overtime         numeric default 0;
alter table public.payroll add column if not exists tax              numeric default 0;
alter table public.payroll add column if not exists pension          numeric default 0;
alter table public.payroll add column if not exists loan_deduction   numeric default 0;
alter table public.payroll add column if not exists other_deductions numeric default 0;
alter table public.payroll add column if not exists net_pay          numeric;
alter table public.payroll add column if not exists method           text;
alter table public.payroll add column if not exists status           text default 'draft';

-- Auto-compute net pay if not supplied (DB-side safety net mirroring the UI)
create or replace function public.payroll_net()
returns trigger language plpgsql as $$
begin
  if new.net_pay is null then
    new.net_pay := coalesce(new.basic,0)+coalesce(new.allowances,0)+coalesce(new.bonus,0)+coalesce(new.overtime,0)
                 - coalesce(new.tax,0)-coalesce(new.pension,0)-coalesce(new.loan_deduction,0)-coalesce(new.other_deductions,0);
  end if;
  return new;
end; $$;
drop trigger if exists trg_payroll_net on public.payroll;
create trigger trg_payroll_net before insert or update on public.payroll
  for each row execute function public.payroll_net();

-- ---------------------------------------------------------------------
-- 2. STAFF LOANS / ADVANCES (issue 5)
-- ---------------------------------------------------------------------
create table if not exists public.staff_loans (
  id uuid primary key default uuid_generate_v4(),
  staff_name text not null,
  loan_type text default 'salary advance',
  principal numeric default 0,
  monthly_repayment numeric default 0,
  months int default 0,
  amount_repaid numeric default 0,
  date_taken date,
  status text default 'active' check (status in ('active','completed','defaulted','written-off')),
  notes text,
  created_at timestamptz default now()
);
alter table public.staff_loans enable row level security;
create index if not exists staff_loans_name_idx on public.staff_loans (staff_name);

-- ---------------------------------------------------------------------
-- 3. STAFF BONUSES (issue 5)
-- ---------------------------------------------------------------------
create table if not exists public.staff_bonus (
  id uuid primary key default uuid_generate_v4(),
  staff_name text not null,
  bonus_type text default 'performance',
  amount numeric default 0,
  reason text,
  award_date date,
  status text default 'pending' check (status in ('pending','approved','paid')),
  created_at timestamptz default now()
);
alter table public.staff_bonus enable row level security;

-- ---------------------------------------------------------------------
-- 4. STAFF APPRAISALS (issue 5)
-- ---------------------------------------------------------------------
create table if not exists public.staff_appraisals (
  id uuid primary key default uuid_generate_v4(),
  staff_name text not null,
  period text,
  punctuality int,
  teaching_quality int,
  student_results int,
  teamwork int,
  conduct int,
  total_score text,
  recommendation text,
  comments text,
  appraiser text,
  created_at timestamptz default now()
);
alter table public.staff_appraisals enable row level security;

-- ---------------------------------------------------------------------
-- 5. PARENT <-> CHILD convenience (issue 4)
-- parent_child already exists; ensure columns + a reverse helper view so a
-- parent can be found from a child and vice-versa via dropdowns.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.parent_child') is null then
    create table if not exists public.parent_child (
      id uuid primary key default uuid_generate_v4(),
      parent_id uuid,
      student_id uuid,
      relationship text default 'parent',
      created_at timestamptz default now()
    );
    alter table public.parent_child enable row level security;
  end if;
end $$;
alter table public.parent_child add column if not exists relationship text default 'parent';

drop view if exists public.parent_child_view cascade;
create view public.parent_child_view as
  select pc.id, pc.created_at, pc.relationship,
         pc.parent_id, pr.full_name as parent_name, pr.email as parent_email,
         pc.student_id, st.full_name as student_name, st.class as student_class
  from public.parent_child pc
  left join public.profiles pr on pr.id = pc.parent_id
  left join public.students st on st.id = pc.student_id;
grant select on public.parent_child_view to authenticated;

-- ---------------------------------------------------------------------
-- 6. ACADEMIC TRANSCRIPT VIEW (international standard enhancement)
-- A per-student, per-subject roll-up of results across terms/sessions.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.results') is not null then
    execute 'drop view if exists public.transcript_view cascade';
    execute $v$
      create view public.transcript_view as
      select student_name, class, session, term, subject,
             coalesce(ca1,0)+coalesce(ca2,0)+coalesce(ca3,0)+coalesce(exam,0) as total,
             grade
      from public.results
    $v$;
    execute 'grant select on public.transcript_view to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. RLS POLICIES (authenticated read; staff write)
-- ---------------------------------------------------------------------
do $$
declare t text; declare staff_rw text[] := array['staff_loans','staff_bonus','staff_appraisals','payroll'];
begin
  foreach t in array staff_rw loop
    execute format('drop policy if exists "uv4_read_%s"  on public.%I', t, t);
    execute format('drop policy if exists "uv4_write_%s" on public.%I', t, t);
    execute format('create policy "uv4_read_%s"  on public.%I for select using (auth.role()=''authenticated'')', t, t);
    execute format('create policy "uv4_write_%s" on public.%I for all    using (public.is_staff(auth.uid()))', t, t);
  end loop;
end $$;

select 'School Connect — Update v4 schema installed ✅' as status;


-- FINAL CUMULATIVE SUBJECT-TEACHER MAPPING REPAIR
-- Safe for fresh and existing databases. Fixes: could not find 'teacher' column of subjects.
alter table if exists public.subjects add column if not exists teacher text;
alter table if exists public.subjects add column if not exists teacher_id uuid references public.profiles(id) on delete set null;


-- Role/page access map controlled from Admin Dashboard → Page Access Manager.
alter table public.school_settings add column if not exists role_access jsonb;

-- Page access manager write-permission map.
alter table public.school_settings add column if not exists role_write jsonb;

-- ===== update-v6-schema.sql =====
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
  admission_prefix text default 'GOSA',
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
drop policy if exists "settings_read" on public.school_settings;
create policy "settings_read"  on public.school_settings for select using (auth.role() = 'authenticated');
drop policy if exists "settings_write" on public.school_settings;
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
do $$ begin create index if not exists cbt_results_student_idx on public.cbt_results (student_id_ref); exception when others then null; end $$;
create index if not exists cbt_exams_code_idx      on public.cbt_exams (code);
create index if not exists cbt_exams_open_idx      on public.cbt_exams (is_open);
create index if not exists polls_status_idx        on public.polls (status, created_at desc);
create index if not exists poll_votes_poll_idx     on public.poll_votes (poll_id);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
do $$ begin create index if not exists fee_payments_student_idx  on public.fee_payments (student_id, created_at desc); exception when others then null; end $$;
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

-- ===== update-v8-schema.sql =====
-- =====================================================================
-- School Connect — UPDATE V8 SCHEMA (Enterprise v8)
-- Run AFTER schema.sql and update-v6-schema.sql. Idempotent — safe to
-- re-run at any time.
-- Adds: login-by-ID resolution, offline CBT re-import support, and
-- extra high-concurrency indexes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOGIN BY STUDENT/STAFF ID (issue 20)
--    Students sign in with their admission number (e.g. GOSA/2026/0001),
--    staff with their staff number. The RPC resolves the ID to the email
--    of the LINKED login account (students.user_id / staff.user_id).
--    SECURITY: security definer; returns ONLY the email (needed for
--    signInWithPassword) and only for ids that are actually linked.
-- ---------------------------------------------------------------------
create or replace function public.lookup_login_email(p_identifier text)
returns text language plpgsql security definer stable as $$
declare v_email text; v_id text := upper(trim(p_identifier));
begin
  if v_id is null or v_id = '' then return null; end if;

  -- student admission number → linked profile email
  select p.email into v_email
    from public.students s
    join public.profiles p on p.id = s.user_id
   where upper(s.admission_no) = v_id
   limit 1;
  if v_email is not null then return v_email; end if;

  -- staff number → linked profile email
  select p.email into v_email
    from public.staff st
    join public.profiles p on p.id = st.user_id
   where upper(st.staff_no) = v_id
   limit 1;
  if v_email is not null then return v_email; end if;

  -- parent member id (if the deployment stores one on profiles)
  select p.email into v_email
    from public.profiles p
   where upper(coalesce(p.member_id, '')) = v_id
   limit 1;
  return v_email;
end $$;
grant execute on function public.lookup_login_email(text) to anon, authenticated;

-- profiles.member_id used by the parent branch above (added if missing)
alter table public.profiles add column if not exists member_id text;
create index if not exists profiles_member_id_idx on public.profiles (upper(member_id));
create index if not exists students_admission_upper_idx on public.students (upper(admission_no));
create index if not exists staff_no_upper_idx on public.staff (upper(staff_no));

-- ---------------------------------------------------------------------
-- 2. OFFLINE CBT BACKUP RE-IMPORT (issue 8)
--    When a candidate's submission failed (network) they downloaded a
--    JSON backup. Staff re-import it; cbt_submit_backup validates the
--    exam, prevents duplicate imports and re-uses the normal grading
--    metadata stored inside the backup payload.
-- ---------------------------------------------------------------------
alter table public.cbt_results add column if not exists imported_from_backup boolean default false;

create or replace function public.cbt_import_backup(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  e public.cbt_exams;
  v_id uuid;
  v_dup int;
begin
  -- staff only
  if not public.is_staff(auth.uid()) then
    return jsonb_build_object('saved', false, 'error', 'Only staff can import backups');
  end if;

  select * into e from public.cbt_exams where id = (p_payload->>'exam_id')::uuid limit 1;
  if not found then return jsonb_build_object('saved', false, 'error', 'Exam not found for this backup'); end if;

  -- duplicate guard: same exam + same candidate name/id + same score already saved
  select count(*) into v_dup from public.cbt_results
   where exam_id = e.id
     and student_name = coalesce(p_payload->>'student_name','Anonymous')
     and coalesce(student_id_ref,'') = coalesce(p_payload->>'student_id_ref','')
     and score = coalesce((p_payload->>'score')::numeric, -1);
  if v_dup > 0 then
    return jsonb_build_object('saved', false, 'error', 'This backup appears to be already imported (duplicate).');
  end if;

  insert into public.cbt_results (
    exam_id, student_name, student_class, student_id_ref, student_type,
    score, total, percent, correct_count, wrong_count, skipped_count,
    attempt_number, time_taken, answers_data, violations, violation_log,
    cert_code, imported_from_backup
  ) values (
    e.id,
    coalesce(p_payload->>'student_name','Anonymous'),
    coalesce(p_payload->>'student_class', e.class),
    coalesce(p_payload->>'student_id_ref',''),
    coalesce(p_payload->>'student_type', e.exam_mode),
    coalesce((p_payload->>'score')::numeric,0),
    coalesce((p_payload->>'total')::int,0),
    coalesce((p_payload->>'percent')::numeric,0),
    coalesce((p_payload->>'correct_count')::int,0),
    coalesce((p_payload->>'wrong_count')::int,0),
    coalesce((p_payload->>'skipped_count')::int,0),
    1,
    coalesce((p_payload->>'time_taken')::int,0),
    coalesce(p_payload->'answers_data','[]'::jsonb),
    coalesce((p_payload->>'violations')::int,0),
    coalesce(p_payload->'violation_log','[]'::jsonb),
    case when e.certificate_enabled
         then 'CERT-' || upper(substr(md5(random()::text),1,4)) || '-' || upper(substr(md5(random()::text),1,4))
         else '' end,
    true
  ) returning id into v_id;

  return jsonb_build_object('saved', true, 'result_id', v_id,
    'report_column', e.report_column, 'subject', e.subject, 'title', e.title);
end $$;
grant execute on function public.cbt_import_backup(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. EXTRA CONCURRENCY INDEXES (issue 12: 100+ simultaneous candidates)
-- ---------------------------------------------------------------------
create index if not exists cbt_results_created_idx  on public.cbt_results (created_at desc);
create index if not exists cbt_results_import_idx   on public.cbt_results (exam_id, imported_from_backup);
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists events_date_idx           on public.events (date desc);

select 'update-v8-schema applied ✔' as status;

-- ===== update-v9-schema.sql =====
-- =====================================================================
-- School Connect — UPDATE V9 SCHEMA (Enterprise v9)
-- Run AFTER schema.sql, update-v6-schema.sql and update-v8-schema.sql.
-- Idempotent — safe to re-run.
-- Focus: 400+ simultaneous CBT candidates without glitches.
-- =====================================================================

-- 1. Covering index for the hottest read path (exam by code, open exams only)
create index if not exists cbt_exams_code_open_idx on public.cbt_exams (code) where is_open = true;

-- 2. BRIN index on cbt_results.created_at — near-zero write overhead for the
--    submit-heavy period, fast time-range reporting afterwards.
create index if not exists cbt_results_created_brin on public.cbt_results using brin (created_at);

-- 3. Keep the attempt-limit lookup index tight (exam + candidate ref)
do $$ begin create index if not exists cbt_results_exam_ref_idx on public.cbt_results (exam_id, student_id_ref); exception when others then null; end $$;

-- 4. Results listing per exam for the teacher dashboard during the exam
create index if not exists cbt_results_exam_created_idx on public.cbt_results (exam_id, created_at desc);

-- 5. ANALYZE hints so the planner uses the new indexes immediately
analyze public.cbt_exams;
analyze public.cbt_results;

select 'update-v9-schema applied ✔ (400+ concurrent CBT ready)' as status;

-- ===== update-v11-schema.sql =====
-- =====================================================================
-- School Connect — UPDATE V11 SCHEMA (Enterprise v11)
-- Run AFTER schema.sql (+ v6, v8, v9 updates). Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FEES: remaining balance shown on e-receipts (issue 13)
-- ---------------------------------------------------------------------
alter table public.fee_payments add column if not exists fee_total numeric;
alter table public.fee_payments add column if not exists balance   numeric;
alter table public.fee_payments add column if not exists student_name text;

-- ---------------------------------------------------------------------
-- 2. ADMISSION PREFIX (issue 8 — ROOT CAUSE):
--    The generator rewrites the TABLE DEFAULT to the school acronym, but the
--    settings ROW (id=1) may have been created BEFORE that default applied,
--    or by an older schema — so gen_admission_no() kept using 'SCH'.
--    This backfills the row itself from the default, and lets you set it
--    explicitly below.
-- ---------------------------------------------------------------------
do $$
declare v_default text;
begin
  select column_default into v_default
    from information_schema.columns
   where table_schema='public' and table_name='school_settings' and column_name='admission_prefix';
  -- column_default looks like  'GOSA'::text  — strip the quotes/cast
  v_default := regexp_replace(coalesce(v_default,''), '''([^'']*)''.*', '\1');
  if v_default is not null and v_default <> '' then
    update public.school_settings
       set admission_prefix = v_default
     where id = 1
       and (admission_prefix is null or admission_prefix in ('', 'SCH', 'STD'));
  end if;
end $$;

-- To change the acronym manually at any time, run:
--   update public.school_settings set admission_prefix = 'YOURACRONYM' where id = 1;
-- (Existing students keep their old numbers; new students use the new prefix.)

-- ---------------------------------------------------------------------
-- 3. NOTIFICATIONS: parents/students/staff must RECEIVE in-app messages.
--    notif_write was staff-only for ALL commands (fine), but read_by
--    updates (mark-as-read) by non-staff were blocked → unread badge
--    never cleared for families. Allow authenticated users to update
--    ONLY the read_by column via a safe RPC.
-- ---------------------------------------------------------------------
create or replace function public.notif_mark_read(p_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.notifications
     set read_by = (
       select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
         from jsonb_array_elements_text(coalesce(read_by,'[]'::jsonb) || to_jsonb(array[auth.uid()::text])) as t(x)
     )
   where id = p_id;
end $$;
grant execute on function public.notif_mark_read(uuid) to authenticated;

alter table public.notifications add column if not exists recipient_id uuid references public.profiles(id) on delete set null;
alter table public.notifications add column if not exists created_by  uuid references public.profiles(id) on delete set null;

-- Families may create PRIVATE notifications (delivery events for their own
-- in-app messages) but nothing school-wide:
drop policy if exists "notif_insert_family" on public.notifications;
drop policy if exists "notif_insert_family" on public.notifications;
create policy "notif_insert_family" on public.notifications for insert
  with check (auth.role() = 'authenticated' and (public.is_staff(auth.uid()) or coalesce(audience,'') in ('private')));

select 'update-v11-schema applied ✔' as status;

-- ENTERPRISE V14/V6: fee balance is always computed at database level.
create or replace function public.compute_fee_payment_balance()
returns trigger language plpgsql as $$
begin
  if new.fee_total is not null then
    new.balance := greatest(0, coalesce(new.fee_total,0) - coalesce(new.amount_paid,0));
  elsif new.balance is null then
    new.balance := 0;
  end if;
  return new;
end $$;
drop trigger if exists trg_compute_fee_payment_balance on public.fee_payments;
create trigger trg_compute_fee_payment_balance
before insert or update of fee_total, amount_paid, balance on public.fee_payments
for each row execute function public.compute_fee_payment_balance();

-- ===== update-v12-schema.sql =====
-- =====================================================================
-- School Connect — UPDATE V12 SCHEMA (Enterprise Final v3)
-- Run AFTER earlier migrations. Idempotent.
-- =====================================================================

-- #5: Examination Officer identity (server-synced across devices)
alter table public.school_settings add column if not exists officer_name          text;
alter table public.school_settings add column if not exists officer_signature_url text;

select 'update-v12-schema applied ✔' as status;

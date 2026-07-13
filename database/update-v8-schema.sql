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

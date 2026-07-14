-- =====================================================================
-- School Connect v2 — Schema Update v13
-- =====================================================================
-- This file is IDEMPOTENT. Run it once on top of your existing
-- v1..v12 schema. It adds:
--
--   1. sc_current_role() SECURITY-DEFINER RPC
--      Returns the authenticated user's role + full_name + status +
--      photo_url. This is the SOURCE OF TRUTH for the role displayed
--      in the topbar — no more "guest" mystery.
--   2. photo_url column on profiles (if not already there)
--   3. Helper index on notifications(audience, created_at DESC)
--   4. cbt_repair_tabs(p_exam_id) — re-derives subject_breakdown
--      from the per-question section/subject metadata on csv_data.
--      Call this from the cbt.html UI to retroactively fix old exams.
--   5. cbt_get_public_exam is REPLACED with a v2 version that
--      returns the inferred subject_breakdown even for old exams.
-- =====================================================================

-- 1. profiles.photo_url (if missing)
alter table public.profiles add column if not exists photo_url text;

-- 2. sc_current_role() — the v2 source of truth for the user role
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

-- 3. cbt_repair_tabs(p_exam_id) — retroactively fix an old exam
create or replace function public.cbt_repair_tabs(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  e   public.cbt_exams;
  qs  jsonb;
  bd  jsonb;
  bd_count int;
  i   int;
  cur text;
  start_idx int;
  count_in_block int;
  cfg jsonb;
begin
  select * into e from public.cbt_exams where id = p_exam_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Exam not found'); end if;
  qs := e.csv_data;
  if qs is null or jsonb_typeof(qs) <> 'array' or jsonb_array_length(qs) < 1 then
    return jsonb_build_object('ok', false, 'error', 'Exam has no questions');
  end if;
  bd := '[]'::jsonb;
  cur := null;
  start_idx := 0;
  count_in_block := 0;
  bd_count := 0;
  for i in 0..jsonb_array_length(qs) - 1 loop
    declare q jsonb; sec text;
    begin
      q := jsonb_array_element(qs, i);
      sec := coalesce(q->>'section', q->>'subject', q->>'subject_section', q->>'exam_subject', '');
      if sec is null or sec = '' then sec := 'General'; end if;
      if cur is null then
        cur := sec; start_idx := i; count_in_block := 1;
      elsif sec = cur then
        count_in_block := count_in_block + 1;
      else
        bd := bd || jsonb_build_array(jsonb_build_object('name', cur, 'start', start_idx, 'count', count_in_block, 'end', start_idx + count_in_block - 1));
        bd_count := bd_count + 1;
        cur := sec; start_idx := i; count_in_block := 1;
      end if;
    end;
  end loop;
  if cur is not null then
    bd := bd || jsonb_build_array(jsonb_build_object('name', cur, 'start', start_idx, 'count', count_in_block, 'end', start_idx + count_in_block - 1));
    bd_count := bd_count + 1;
  end if;
  cfg := coalesce(e.anti_cheat_config, '{}'::jsonb);
  cfg := cfg || jsonb_build_object(
    'subject_breakdown', bd,
    'subjects', (select jsonb_agg(distinct value) from jsonb_array_elements(bd) cross join lateral (select value->>'name' as value) v),
    'multi_subject', (bd_count > 1)
  );
  update public.cbt_exams
     set anti_cheat_config = cfg,
         subject = case when bd_count > 1 and (e.subject is null or e.subject = '') then 'MULTI-SUBJECT' else e.subject end,
         updated_at = now()
   where id = p_exam_id;
  return jsonb_build_object('ok', true, 'subjects', bd_count, 'breakdown', bd);
end; $$;

grant execute on function public.cbt_repair_tabs(uuid) to anon, authenticated;

-- 4. Updated cbt_get_public_exam that always returns subject_breakdown
create or replace function public.cbt_get_public_exam(p_code text)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  e   public.cbt_exams;
  qs  jsonb;
  bd  jsonb := '[]'::jsonb;
  i   int;
  cur text;
  start_idx int;
  count_in_block int;
  sec text;
  cfg jsonb;
  bd_count int;
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
  -- strip correct answers/explanations
  select coalesce(jsonb_agg(
           (q - 'correct' - 'explanation' - 'accept' - 'subs')
           || jsonb_build_object('correct', null)
         ), '[]'::jsonb)
    into qs
    from jsonb_array_elements(e.csv_data) q;
  -- v2: ALWAYS infer subject_breakdown (or use existing)
  cfg := coalesce(e.anti_cheat_config, '{}'::jsonb);
  if cfg ? 'subject_breakdown' and jsonb_typeof(cfg->'subject_breakdown') = 'array'
     and jsonb_array_length(cfg->'subject_breakdown') > 1 then
    bd := cfg->'subject_breakdown';
  else
    -- infer from per-question section/subject
    cur := null;
    start_idx := 0;
    count_in_block := 0;
    bd_count := 0;
    if qs is not null and jsonb_typeof(qs) = 'array' and jsonb_array_length(qs) > 0 then
      for i in 0..jsonb_array_length(qs) - 1 loop
        sec := coalesce(jsonb_array_element(qs, i)->>'section',
                        jsonb_array_element(qs, i)->>'subject',
                        jsonb_array_element(qs, i)->>'subject_section',
                        jsonb_array_element(qs, i)->>'exam_subject', 'General');
        if cur is null then
          cur := sec; start_idx := i; count_in_block := 1;
        elsif sec = cur then
          count_in_block := count_in_block + 1;
        else
          bd := bd || jsonb_build_array(jsonb_build_object('name', cur, 'start', start_idx, 'count', count_in_block, 'end', start_idx + count_in_block - 1));
          bd_count := bd_count + 1;
          cur := sec; start_idx := i; count_in_block := 1;
        end if;
      end loop;
      if cur is not null then
        bd := bd || jsonb_build_array(jsonb_build_object('name', cur, 'start', start_idx, 'count', count_in_block, 'end', start_idx + count_in_block - 1));
        bd_count := bd_count + 1;
      end if;
    end if;
  end if;
  cfg := cfg || jsonb_build_object('subject_breakdown', bd, 'multi_subject', (jsonb_array_length(bd) > 1));
  return jsonb_build_object(
    'id', e.id, 'code', e.code, 'title', e.title, 'subject', e.subject,
    'class', e.class, 'term', e.term, 'session', e.session, 'topic', e.topic,
    'duration', e.duration, 'instructions', e.instructions, 'exam_mode', e.exam_mode,
    'select_count', e.select_count, 'randomise', e.randomise,
    'anti_cheat_config', cfg, 'release_results', e.release_results,
    'certificate_enabled', e.certificate_enabled, 'assessment_type', e.assessment_type,
    'report_column', e.report_column, 'max_score', e.max_score,
    'questions', qs, '_questions', qs
  );
end; $$;

grant execute on function public.cbt_get_public_exam(text) to anon, authenticated;

-- 5. performance: index on notifications for the dropdown query
create index if not exists notif_audience_created_idx on public.notifications(audience, created_at desc);

-- 6. RLS: ensure profiles can be updated by the owner (needed for the photo URL)
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

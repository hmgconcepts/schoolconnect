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
create index if not exists cbt_results_exam_ref_idx on public.cbt_results (exam_id, student_id_ref);

-- 4. Results listing per exam for the teacher dashboard during the exam
create index if not exists cbt_results_exam_created_idx on public.cbt_results (exam_id, created_at desc);

-- 5. ANALYZE hints so the planner uses the new indexes immediately
analyze public.cbt_exams;
analyze public.cbt_results;

select 'update-v9-schema applied ✔ (400+ concurrent CBT ready)' as status;

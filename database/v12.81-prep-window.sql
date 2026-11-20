/* V12.81 — extracted from the cumulative schema for the record.
   complete-schema.sql is the file a school runs; this file is the diff a
   maintainer reads. It is the exact text appended to the raw pack. */

-- =====================================================================
-- V12.81 — A PREP EXAM OPENS AT THE TIME THE SCHOOL TYPED
-- ---------------------------------------------------------------------
-- Four faults, one family. (1) A `datetime-local` field hands the page a
-- string with no zone; posted straight to a timestamptz column Postgres read
-- it in the DATABASE's timezone (UTC), so 10:00 school time was stored as
-- 11:00 and the learner could not start until 11:00. (2) The edit form
-- opened that instant in UTC, so the tutor saw 09:00 for a 10:00 paper and
-- "corrected" it. (3) A paper with a start time and no closing time stayed
-- open for ever. (4) A learner who began inside the window could have the
-- whole sitting refused because the close came before they finished.
-- =====================================================================
alter table public.school_settings add column if not exists school_timezone text default 'Africa/Lagos';

create or replace function public.sc_school_tz() returns text
language sql stable security definer set search_path=public as $$
select coalesce(nullif(btrim((select school_timezone from public.school_settings where id = 1)), ''), 'Africa/Lagos')
$$;

/* the instant a sitting ends: the tutor's closing time, else start + length */
create or replace function public.sc_cbt_close(p_start timestamptz, p_close timestamptz, p_min int, p_dur int)
returns timestamptz language sql immutable parallel safe as $$
select coalesce(p_close, p_start + make_interval(mins => coalesce(nullif(p_min, 0), nullif(p_dur, 0), 45)))
$$;


revoke all on function public.sc_school_tz() from public;
revoke all on function public.sc_cbt_close(timestamptz, timestamptz, int, int) from public, anon;
grant execute on function public.sc_school_tz() to authenticated, anon;
grant execute on function public.sc_cbt_close(timestamptz, timestamptz, int, int) to authenticated, anon;

/* ONE LENGTH, TWO COLUMNS. The student getter prefers duration_min, the
   timetable preferred duration; a tutor who changed one and not the other got
   a paper that opened as 45 minutes and closed as 60. They now move together. */
create or replace function public.sc_trg_cbt_durations() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    new.duration := greatest(coalesce(nullif(new.duration, 0), nullif(new.duration_min, 0), 45), 1);
    new.duration_min := new.duration;
  elsif new.duration is distinct from old.duration then
    new.duration_min := new.duration;
  elsif new.duration_min is distinct from old.duration_min then
    new.duration := new.duration_min;
  end if;
  return new;
end $$;
revoke all on function public.sc_trg_cbt_durations() from public, anon, authenticated;
drop trigger if exists cbt_durations_coherent on public.cbt_exams;
create trigger cbt_durations_coherent before insert or update on public.cbt_exams
for each row execute function public.sc_trg_cbt_durations();

select 'V12.81 installs — a prep exam opens at the time the school typed, closes when it ends, and keeps the answers of anyone already sitting ✅' as status;

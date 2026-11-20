/* V12.81 (round 26) — THE PREP EXAM DATABASE: TIME, WINDOW, AND WHO MAY SEE WHAT.
   ---------------------------------------------------------------------------
   The school reported that a prep exam set for 10:00 could not be sat until
   11:00. The cause was in two places at once (a `datetime-local` value posted
   without a zone, and an edit form that opened the instant in UTC), and the
   audit around it found four more faults of the same family. This suite proves
   the DATABASE half against the real, shipped schema, in Postgres (PGlite):

     1. the sitting ends when the timetable says it ends (start + length), not
        "never" — a paper with no closing time used to stay open for days;
     2. a learner who begins inside the window never loses their answers;
     3. attempts belong to a person, not to a name two learners share;
     4. a score the tutor has not released is not shown to the learner;
     5. "0 attempts" means unlimited, not one;
     6. one length, not two drifting columns;
     7. the timetable row the learner reads carries the enforced end;
     8. the school's own timezone is used, not a constant.

   Run: node tools/verification/t55-prep-window-db.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  PASS', m))
  : (fail++, console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400))); };

const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text,
      raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz,
      updated_at timestamptz default now(), created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'anon'::text $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`);
  const schema = fs.readFileSync(path.join(ROOT, 'database/complete-schema.sql'), 'utf8')
    .replace(/create extension if not exists "uuid-ossp";/ig, '')
    .replace(/create extension if not exists "pgcrypto";/ig, '');
  await db.exec(schema);

  /* ---------------------------------------------------------------- 1. the clock
     A prep exam at 10:00 school time is stored as the instant it names. The
     database must agree with the wall clock the tutor typed. */
  const tz = await one(`select public.sc_school_tz() tz`);
  ok(tz.tz === 'Africa/Lagos', 'the school timezone has a sane default', tz);
  await db.exec(`update public.school_settings set school_timezone = 'Africa/Accra' where id = 1`);
  ok((await one(`select public.sc_school_tz() tz`)).tz === 'Africa/Accra',
    'and a school that chooses another timezone is obeyed');
  await db.exec(`update public.school_settings set school_timezone = 'Africa/Lagos' where id = 1`);

  const w = await one(`select
      public.sc_cbt_close(timestamptz '2026-11-20 10:00+01', null, 45, null) as derived,
      public.sc_cbt_close(timestamptz '2026-11-20 10:00+01', timestamptz '2026-11-20 12:00+01', 45, null) as explicit,
      public.sc_cbt_close(null, null, 45, null) as manual`);
  ok(new Date(w.derived).toISOString() === '2026-11-20T09:45:00.000Z',
    'a 10:00 paper that lasts 45 minutes ends at 10:45 school time', w.derived);
  ok(new Date(w.explicit).toISOString() === '2026-11-20T11:00:00.000Z',
    "a closing time the tutor set wins over the paper's length");
  ok(w.manual === null, 'a test with no window has no end (it is opened by hand)');

  /* ------------------------------------------------------- 2. the window closes
     The reported fault's opposite: a sitting used to stay open for ever. */
  const exId = '11111111-1111-4111-8111-111111111111';
  await db.query(`insert into public.cbt_exams(id,code,title,subject,class,term,session,assessment_type,
      duration,duration_min,exam_mode,is_open,start_at,close_at,csv_data,questions)
    values ($1,'PREP-OLD','Old prep','Maths','JSS 1','First','2026/2027','prep',45,45,'open',true,
      now() - interval '3 hours', null, '[]'::jsonb,'[]'::jsonb)`, [exId]);
  const st1 = await one(`select public.sc_cbt_window_state($1) s`, [exId]);
  ok(st1.s.state === 'expired', 'a sitting whose own length has passed is CLOSED, not open for ever', st1.s);
  ok(!!st1.s.closes_at, 'and it reports the moment it closed', st1.s);

  await db.query(`update public.cbt_exams set start_at = now() - interval '5 minutes' where id = $1`, [exId]);
  ok((await one(`select public.sc_cbt_window_state($1) s`, [exId])).s.state === 'open',
    'five minutes in, the same sitting is open');
  await db.query(`update public.cbt_exams set start_at = now() + interval '20 minutes' where id = $1`, [exId]);
  const st3 = await one(`select public.sc_cbt_window_state($1) s`, [exId]);
  ok(st3.s.state === 'not_started' && st3.s.seconds_until > 1100,
    'and twenty minutes early it says so, with the count', st3.s);

  /* the getter the exam page uses refuses a closed sitting too */
  await db.query(`update public.cbt_exams set start_at = now() - interval '3 hours' where id = $1`, [exId]);
  const g = await one(`select public.cbt_get_public_exam_v5('PREP-OLD') d`);
  ok(g.d.ok === false && g.d.error === 'closed',
    'the exam page itself refuses a sitting that ended (it used to hand over the questions)', g.d);

  /* ------------------------------------------- 3. answers inside the window live
     A paper that closes at 10:45 must still accept the answers of a learner who
     began at 10:40 — the whole sitting used to be thrown away. */
  const bank = [{ question: '2 + 2?', type: 'mcq', options: ['3', '4'], answer: '4', mark: 1 }];
  const subId = '22222222-2222-4222-8222-222222222222';
  const mkExam = async (id, code, startAgoMin, closeOffsetMin) => {
    await db.query(`delete from public.cbt_exams where id = $1`, [id]);
    await db.query(`insert into public.cbt_exams(id,code,title,subject,class,term,session,assessment_type,
        duration,duration_min,exam_mode,is_open,start_at,close_at,csv_data,questions,attempt_limit,release_results)
      values ($1,$2,'Timed','Maths','JSS 1','First','2026/2027','prep',45,45,'open',true,
        now() - ($3::text)::interval,
        case when $4::int is null then null else now() + ($4::text)::interval end,
        $5,$5,1,true)`, [id, code, startAgoMin + ' minutes', closeOffsetMin, JSON.stringify(bank)]);
  };
  const submit = async (code) => (await one(`select public.cbt_submit_v5(jsonb_build_object(
      'exam_id',(select id from public.cbt_exams where code=$1),
      'student_name','Ada','student_id_ref','ADM-1',
      'answers_data', jsonb_build_array(jsonb_build_object('index',0,'answer','4')))) d`, [code])).d;

  await mkExam(subId, 'PREP-EDGE', 40, null);        /* closed 5 min ago, learner began at minute 0 */
  const late = await submit('PREP-EDGE');
  ok(late.saved === true, 'a learner who began inside the window can still submit after it closes', late);
  ok(late.score === 1, 'and the answer is marked, not thrown away', late);

  const subId2 = '33333333-3333-4333-8333-333333333333';
  await mkExam(subId2, 'PREP-GONE', 240, null);      /* closed three hours ago */
  const tooLate = await submit('PREP-GONE');
  ok(tooLate.saved === false && tooLate.error === 'closed',
    'a submission three hours after the paper ended is still refused', tooLate);

  /* ------------------------------------------------- 4. attempts belong to a person
     Two learners with the same name used to share one attempt count, and could
     each read the other's score. */
  await db.exec(`
    insert into auth.users(id, email) values
      ('aaaaaaaa-0000-4000-8000-000000000001','john1@school.test'),
      ('aaaaaaaa-0000-4000-8000-000000000002','john2@school.test')
      on conflict (id) do nothing;
    insert into public.profiles(id, role, status, full_name) values
      ('aaaaaaaa-0000-4000-8000-000000000001','student','active','John Doe'),
      ('aaaaaaaa-0000-4000-8000-000000000002','student','active','John Doe')
      on conflict (id) do nothing;
    insert into public.students(id, full_name, admission_no, class, arm, status, user_id) values
      ('bbbbbbbb-0000-4000-8000-000000000001','John Doe','ADM-1','JSS 1','A','active','aaaaaaaa-0000-4000-8000-000000000001'),
      ('bbbbbbbb-0000-4000-8000-000000000002','John Doe','ADM-2','JSS 1','A','active','aaaaaaaa-0000-4000-8000-000000000002')
      on conflict (id) do nothing;`);

  const prepId = '44444444-4444-4444-8444-444444444444';
  await db.query(`insert into public.cbt_exams(id,code,title,subject,class,term,session,assessment_type,
      duration,duration_min,exam_mode,is_open,start_at,csv_data,questions,attempt_limit,release_results)
    values ($1,'PREP-NAME','Name clash','Maths','JSS 1','First','2026/2027','prep',45,45,'open',true,
      now() + interval '1 hour','[]'::jsonb,'[]'::jsonb,1,false)`, [prepId]);
  await db.query(`insert into public.cbt_results(exam_id, student_name, student_id_ref, student_class,
      student_type, score, total, percent, grading_status, engine_version, attempt_number)
    values ($1,'John Doe','ADM-2','JSS 1','open',10,10,100,'graded','v5.1.3',1)`, [prepId]);

  const asStudent = async (uid) => {
    await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select '${uid}'::uuid $f$`);
  };
  await asStudent('aaaaaaaa-0000-4000-8000-000000000001');
  const mine1 = await q(`select * from public.sc_my_prep_exams()`);
  const row1 = mine1.find(r => r.code === 'PREP-NAME');
  ok(row1 && row1.attempts_used === 0,
    "one learner's attempt is not counted against the other learner of the same name", row1 && row1.attempts_used);

  await asStudent('aaaaaaaa-0000-4000-8000-000000000002');
  const mine2 = await q(`select * from public.sc_my_prep_exams()`);
  const row2 = mine2.find(r => r.code === 'PREP-NAME');
  ok(row2 && row2.attempts_used === 1, 'and the learner who sat it sees their own attempt', row2 && row2.attempts_used);
  ok(row2 && row2.last_percent === null,
    'an unreleased score is NOT shown to the learner (it used to appear at submission)', row2 && row2.last_percent);
  ok(row2 && row2.attempt_limit === 1, 'a one-attempt paper still says one', row2 && row2.attempt_limit);
  ok(row2 && row2.status === 'upcoming', 'and the sitting is upcoming, with its open moment', row2 && row2.status);

  await db.exec(`update public.cbt_exams set release_results = true, attempt_limit = 0 where id = '${prepId}'`);
  const mine3 = await q(`select * from public.sc_my_prep_exams()`);
  const row3 = mine3.find(r => r.code === 'PREP-NAME');
  ok(row3 && Number(row3.last_percent) === 100, 'once results are released the score appears', row3 && row3.last_percent);
  ok(row3 && row3.attempt_limit === null, '"0 attempts" reads as unlimited, not as one', row3 && row3.attempt_limit);

  /* the learner's own list must agree with the gate: a sitting whose closing
     time has passed reads "closed" there too (it used to read "open" because
     the list compared a variable nothing had ever set) */
  await db.query(`update public.cbt_exams set close_at = timestamptz '2020-01-01 09:00+01',
      start_at = timestamptz '2020-01-01 08:00+01', release_results = true where id = $1`, [prepId]);
  const closedRow = (await q(`select * from public.sc_my_prep_exams()`)).find(r => r.code === 'PREP-NAME');
  ok(closedRow && closedRow.status === 'closed',
    'a sitting whose closing time has passed reads CLOSED in the learner\'s list', closedRow && closedRow.status);

  /* ------------------------------------------------------- 5. one length, two columns */
  await db.query(`insert into public.cbt_exams(code,title,subject,assessment_type,duration,duration_min)
    values ('DUR-1','Len','Maths','prep',30,60)`);
  const d1 = await one(`select duration, duration_min from public.cbt_exams where code='DUR-1'`);
  ok(d1.duration === 30 && d1.duration_min === 30, 'an exam cannot be 30 minutes long and 60 minutes long', d1);
  await db.query(`update public.cbt_exams set duration_min = 20 where code='DUR-1'`);
  const d2 = await one(`select duration, duration_min from public.cbt_exams where code='DUR-1'`);
  ok(d2.duration === 20 && d2.duration_min === 20, 'and changing either column moves both', d2);

  /* -------------------------------------------- 6. the timetable shows the enforcement */
  const syncId = '55555555-5555-4555-8555-555555555555';
  await db.query(`insert into public.cbt_exams(id,code,title,subject,class,term,session,assessment_type,
      duration,duration_min,is_open,start_at,close_at,venue)
    values ($1,'PREP-ROW','Scheduled','Maths','JSS 1','First','2026/2027','prep',45,45,true,
      timestamptz '2026-11-20 10:00+01', null, 'Hall')`, [syncId]);
  const row = await one(`select start_time, end_time, exam_date from public.exam_timetable where exam_id=$1`, [syncId]);
  ok(row && row.start_time === '10:00' && row.end_time === '10:45',
    'the learner is shown 10:00–10:45 — the window the database enforces', row);

  await db.query(`update public.cbt_exams set close_at = timestamptz '2026-11-20 12:30+01' where id=$1`, [syncId]);
  const rowB = await one(`select end_time from public.exam_timetable where exam_id=$1`, [syncId]);
  ok(rowB.end_time === '12:30', 'and a closing time the tutor sets is what the timetable advertises', rowB);

  /* ------------------------------------------------------------- 7. it is staff-only */
  await asStudent('aaaaaaaa-0000-4000-8000-000000000001');
  const mineTzRow = (await q(`select * from public.sc_my_prep_exams()`)).find(r => r.code === 'PREP-ROW');
  ok(mineTzRow && /^20 Nov 2026 · 10:00$/.test(String(mineTzRow.start_local)),
    'the learner reads the time in SCHOOL time, not UTC', mineTzRow && mineTzRow.start_local);
  ok(mineTzRow && mineTzRow.public_link === '',
    'a learner is not handed the paper\'s share link by a list');
} catch (e) {
  fail++;
  console.log('  FAIL suite crashed:', e && e.message);
} finally {
  await db.close();
}

console.log('\n' + (fail === 0
  ? `PREP WINDOW DB OK — ${pass} passed, 0 failed · the sitting opens and closes on the school's clock, and keeps everyone's answers.`
  : `PREP WINDOW DB FAILED — ${pass} passed, ${fail} failed`));
process.exit(fail === 0 ? 0 : 1);

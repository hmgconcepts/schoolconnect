/* V12.78 — A PREP EXAM SET FOR A CLASS REACHES THE LEARNER, AND ARRIVES WITH A
   TIMETABLE ROW
   ---------------------------------------------------------------------------
   Round 22, item 2. The requirement, in the user's words: "whenever the prep
   exam is set for a class it should automatically appear on the portals of the
   students of that class with the date and time ... each class prep exam is
   arranged according to the date and time ... the timetable for the prep exam
   is automatically created based on the pre-existing prep exam."

   This proves, against the real schema in a real Postgres:
     1. saving a prep exam for a class writes its sitting into exam_timetable
        (date, start, end = start + duration, class, subject, term, session,
        venue) — no second data entry;
     2. re-saving is idempotent (one row), and a change of time/venue/class MOVES
        that row rather than adding a second one;
     3. a non-prep exam writes nothing, and archiving a prep exam takes its
        sitting away again;
     4. the school's clock is used (a 18:30 UTC sitting is 19:30 in Lagos);
     5. sc_my_prep_exams() gives a student their own class's papers in date
        order, hides another class's papers, gives a parent their children's,
        gives staff everything, and gives a signed-out visitor nothing;
     6. status is derived from the clock (upcoming / open / closed), and attempts
        and the last percentage come from cbt_results;
     7. the door is locked: anon cannot execute the portal function, and the
        repair function refuses a non-staff caller.
   Run: node tools/verification/t45-prep-schedule.mjs
   ========================================================================== */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { schemaText } from './schema-loader.mjs';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const q = async (s, p) => (await db.query(s, p)).rows;
const j = v => JSON.parse(JSON.stringify(v));
/* a DATE column comes back as a JS Date in this driver; compare calendar days */
const ymd = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const HERE = new URL('.', import.meta.url).pathname;

await db.exec(readFileSync(HERE + 'pglite-boot.sql', 'utf8'));
try { await db.exec(schemaText(HERE + '../../database/complete-schema.sql')); }
catch (e) { console.log('SCHEMA FAILED', e.message); process.exit(1); }
await db.exec(`create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
const asUser = async (id) => db.exec(`select set_config('request.jwt.claim.sub','${id}',false)`);

const SCHOOL = '11111111-1111-1111-1111-111111111111';
const STUDENT_U = '22222222-2222-2222-2222-222222222222';
const PARENT_U  = '33333333-3333-3333-3333-333333333333';
const STAFF_U   = '44444444-4444-4444-4444-444444444444';
await db.exec(`
  insert into auth.users(id,email) values
    ('${SCHOOL}','s@x.test'),('${STUDENT_U}','stu@x.test'),('${PARENT_U}','par@x.test'),('${STAFF_U}','staff@x.test')
  on conflict (id) do nothing;
  insert into public.profiles(id,email,full_name,role,status) values
    ('${STUDENT_U}','stu@x.test','Olatunbosun Faith Oladunni','student','approved'),
    ('${PARENT_U}','par@x.test','Mrs Olatunbosun','parent','approved'),
    ('${STAFF_U}','staff@x.test','Mr Bello','staff','approved')
  on conflict (id) do update set role=excluded.role, full_name=excluded.full_name, status='approved';
  insert into public.students(id,full_name,class,arm,admission_no,user_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','Olatunbosun Faith Oladunni','SSS 1','A','GOSA/2026/0005','${STUDENT_U}'),
         ('aaaaaaaa-0000-0000-0000-000000000002','Ade Other','SSS 2','A','GOSA/2026/0006',null)
  on conflict (id) do nothing;
  insert into public.parent_child(parent_id,student_id) values ('${PARENT_U}','aaaaaaaa-0000-0000-0000-000000000001')
  on conflict do nothing;
`);

/* ---------------------------------------------------------------- 1 & 2 ---- */
console.log('\n=== 1. saving a prep exam schedules its sitting ===');
const mk = async (code, extra = '') => (await db.query(`
  insert into public.cbt_exams(code,title,subject,class,term,session,assessment_type,exam_mode,
    start_at,close_at,duration,duration_min,is_open,venue,teacher_id)
  values ('${code}','${code} trial','Mathematics','SSS 1','First Term','2026/2027','prep','open',
    '2026-11-20 18:30:00+00','2026-11-20 20:00:00+00',45,45,true,'Main Hall','${STAFF_U}')
  ${extra} returning id`)).rows;

const ex1 = (await mk('PREP001'))[0].id;
let rows = await q(`select * from public.exam_timetable where exam_id = $1`, [ex1]);
ok(rows.length === 1, 'one sitting appears in exam_timetable, written by the exam itself', rows.length);
const r1 = rows[0] || {};
ok(r1.class === 'SSS 1', 'the sitting carries the class', r1.class);
ok(ymd(r1.exam_date) === '2026-11-20', 'the sitting carries the date', r1.exam_date);
ok(r1.start_time === '19:30', "the start time is the SCHOOL's clock (18:30 UTC = 19:30 Lagos)", r1.start_time);
/* V12.81 — the row must end when the paper really ends. A tutor's closing time
   wins; the paper's length is the fallback. This fixture sets a closing time of
   20:00Z, so the learner is shown 19:30-21:00 Lagos — which is exactly what the
   database enforces. It used to claim 20:15 while the gate accepted sittings
   until 21:00, and for ever when no closing time was set. */
ok(r1.end_time === '21:00', 'the end time is the end the database enforces (closing time, else start + duration)', r1.end_time);
ok(r1.venue === 'Main Hall', 'the venue is carried across', r1.venue);
ok(r1.source === 'prep' && r1.paper === 'PREP EXAM', 'the row says where it came from', [r1.source, r1.paper]);
ok(r1.term === 'First Term' && r1.session === '2026/2027', 'term and session are carried, so a class filter finds it', [r1.term, r1.session]);
ok(/PREP001/.test(r1.notes || ''), 'the note carries the exam code a learner needs', r1.notes);

console.log('\n=== 2. re-saving moves the sitting, never duplicates it ===');
await db.exec(`update public.cbt_exams set start_at='2026-11-21 07:00:00+00', venue='Hall B' where id='${ex1}'`);
rows = await q(`select * from public.exam_timetable where exam_id = $1`, [ex1]);
ok(rows.length === 1, 'still exactly one sitting after an edit', rows.length);
ok(ymd(rows[0].exam_date) === '2026-11-21' && rows[0].start_time === '08:00',
   'the sitting moved to the new date and time', [rows[0].exam_date, rows[0].start_time]);
ok(rows[0].venue === 'Hall B', 'the venue moved with it', rows[0].venue);

/* ---------------------------------------------------------------- 3 ------- */
console.log('\n=== 3. only prep exams are scheduled, and archiving removes the sitting ===');
const term = (await db.query(`insert into public.cbt_exams(code,title,subject,class,assessment_type,start_at,duration_min)
  values ('TERM001','Terminal paper','Mathematics','SSS 1','exam','2026-12-01 08:00:00+00',90) returning id`)).rows[0].id;
ok((await q(`select 1 from public.exam_timetable where exam_id=$1`, [term])).length === 0,
   'a terminal exam writes nothing (the timetable is the school’s to build)');
await db.exec(`update public.cbt_exams set is_archived = true where id='${ex1}'`);
ok((await q(`select 1 from public.exam_timetable where exam_id=$1`, [ex1])).length === 0,
   'archiving the prep exam takes its sitting away again');
await db.exec(`update public.cbt_exams set is_archived = false where id='${ex1}'`);
ok((await q(`select 1 from public.exam_timetable where exam_id=$1`, [ex1])).length === 1,
   'un-archiving brings it back');

/* ---------------------------------------------------------------- 5 & 6 --- */
console.log('\n=== 5. what does each portal see? ===');
const ex2 = (await db.query(`insert into public.cbt_exams(code,title,subject,class,term,session,assessment_type,
   start_at,duration_min,is_open) values ('PREP002','SSS 2 rehearsal','English','SSS 2','First Term','2026/2027','prep',
   '2026-11-22 09:00:00+00',60,true) returning id`)).rows[0].id;
/* a rehearsal in the past that is open now, and one that has closed */
const ex3 = (await db.query(`insert into public.cbt_exams(code,title,subject,class,assessment_type,start_at,close_at,
   duration_min,is_open) values ('PREP003','Live rehearsal','Biology','SSS 1','prep',
   now() - interval '30 minutes', now() + interval '2 hours', 60, true) returning id`)).rows[0].id;
const ex4 = (await db.query(`insert into public.cbt_exams(code,title,subject,class,assessment_type,start_at,close_at,
   duration_min,is_open) values ('PREP004','Finished rehearsal','Chemistry','SSS 1','prep',
   now() - interval '3 days', now() - interval '2 days', 60, false) returning id`)).rows[0].id;

await asUser(STUDENT_U);
const mine = j(await q(`select * from public.sc_my_prep_exams()`));
const codes = mine.map(r => r.code);
ok(codes.includes('PREP001'), 'the SSS 1 student sees their class’s prep exam', codes);
ok(!codes.includes('PREP002'), 'and does NOT see another class’s paper', codes);
ok(codes.includes('PREP003') && codes.includes('PREP004'), 'open and closed papers are listed (with their status)');
const st = Object.fromEntries(mine.map(r => [r.code, r.status]));
ok(st.PREP001 === 'upcoming', 'a future paper reads "upcoming"', st);
ok(st.PREP003 === 'open', 'a paper whose window is open reads "open"', st);
ok(st.PREP004 === 'closed', 'a paper whose window has passed reads "closed"', st);
const ordered = mine.map(r => r.start_at);
ok(JSON.stringify(ordered) === JSON.stringify([...ordered].sort()), 'the list is arranged by date and time', ordered);

/* a sitting that has been taken reports the attempt */
await db.exec(`insert into public.cbt_results(exam_id,student_id,student_id_ref,student_name,student_class,score,total,percent)
  values ('${ex3}','aaaaaaaa-0000-0000-0000-000000000001','GOSA/2026/0005','Olatunbosun Faith Oladunni','SSS 1',42,60,70)`);
const after = j(await q(`select * from public.sc_my_prep_exams()`)).find(r => r.code === 'PREP003');
ok(after.attempts_used === 1 && Number(after.last_percent) === 70,
   'attempts and the last score come from cbt_results', [after.attempts_used, after.last_percent]);

await asUser(PARENT_U);
const parent = j(await q(`select * from public.sc_my_prep_exams()`));
ok(parent.some(r => r.code === 'PREP001') && !parent.some(r => r.code === 'PREP002'),
   'a parent sees their child’s class and nothing else', parent.map(r => r.code));
ok((parent.find(r => r.code === 'PREP001') || {}).for_student === 'Olatunbosun Faith Oladunni',
   'the parent row names which child it belongs to');

await asUser(STAFF_U);
const staff = j(await q(`select * from public.sc_my_prep_exams()`));
ok(staff.some(r => r.code === 'PREP002'), 'staff see every class', staff.map(r => r.code));
ok(j(await q(`select * from public.sc_my_prep_exams('SSS 2')`)).every(r => r.class === 'SSS 2'),
   'staff can narrow to one class');

await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
ok(j(await q(`select * from public.sc_my_prep_exams()`)).length === 0,
   'a signed-out visitor gets no list at all (an exam is reached by its code)');

/* ---------------------------------------------------------------- 7 ------- */
console.log('\n=== 7. the door is locked ===');
ok(j(await q(`select has_function_privilege('anon','public.sc_my_prep_exams(text,text)','execute') h`))[0].h === false,
   'anon cannot execute the portal function');
ok(j(await q(`select has_function_privilege('anon','public.sc_prep_sync_exam(uuid,text)','execute') h`))[0].h === false,
   'anon cannot execute the scheduler');
await asUser(STUDENT_U);
const refused = j(await q(`select public.sc_prep_sync_all() r`))[0].r;
ok(refused.ok === false, 'a student cannot reschedule the school’s exams');

/* ------------------------------------------------ the repair path ---------- */
console.log('\n=== the repair path ===');
await asUser(STAFF_U);
await db.exec(`delete from public.exam_timetable where source='prep'`);
const repaired = j(await q(`select public.sc_prep_sync_all() r`))[0].r;
ok(repaired.ok === true && repaired.scheduled >= 3, 'one call rebuilds every missing prep sitting', repaired);
ok((await q(`select 1 from public.exam_timetable where source='prep'`)).length === repaired.scheduled,
   'and the count matches the rows that now exist');

if (fail) { console.error(`\nPREP SCHEDULE FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nPREP SCHEDULE OK — ${pass} passed, 0 failed · a prep exam set for a class IS a timetable row, and every learner sees theirs in date order.`);

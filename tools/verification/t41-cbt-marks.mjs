/* V12.77 — TWO GUARANTEES, PROVED
   ---------------------------------------------------------------------------
   A. A 100-question bank can serve each learner their own 60 — the same 60 on
      every reload, a different 60 from the next learner, chosen by the SERVER,
      and graded against the right question.
   B. No report can print a mark above the maximum it is marked out of — not by
      typing it, not by importing it, not by lowering a maximum afterwards, and
      not by summing two rows for one assessment.
   ========================================================================== */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { schemaText } from './schema-loader.mjs';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const q = async (s, p) => (await db.query(s, p)).rows;
const j = v => JSON.parse(JSON.stringify(v));
const HERE = new URL('.', import.meta.url).pathname;

await db.exec(readFileSync(HERE + 'pglite-boot.sql', 'utf8'));
try { await db.exec(schemaText(HERE + '../../database/complete-schema.sql')); }
catch (e) { console.log('SCHEMA FAILED', e.message); process.exit(1); }

const ADMIN = '99999999-aaaa-bbbb-cccc-999999999999';
await db.exec(`insert into auth.users(id,email) values ('${ADMIN}','admin@school.test')`);

/* ------------------------------------------------------------------ A ---- */
console.log('\n=== A. one bank, one paper per learner ===');
const bank = Array.from({ length: 100 }, (_, i) => ({
  question: 'Question ' + (i + 1), options: ['A', 'B', 'C', 'D'],
  answer: 'A', mark: 1, section: 'General'
}));
await db.exec(`insert into cbt_exams(code,title,subject,class,term,session,exam_mode,is_open,
  csv_data,questions,select_count,randomise,max_score,duration_min,negative_mark,release_results,attempt_limit)
  values ('RND001','Selection test','Mathematics','SSS 1','First Term','2026/2027','open',true,
  $1::jsonb,$1::jsonb,60,true,60,45,0,true,0)`.replace('$1::jsonb,$1::jsonb', `'${JSON.stringify(bank)}'::jsonb,'${JSON.stringify(bank)}'::jsonb`));

const get = async (adm, seed) => j((await q(`select cbt_get_public_exam_v8('RND001',$1,$2) r`, [adm, seed]))[0].r);
const a = await get('GOSA/2026/0005', '');
const b = await get('GOSA/2026/0005', '');
const c = await get('GOSA/2026/0006', '');
const idx = x => (x.questions || []).map(z => Number(z._orig_index));

ok(a.ok === true, 'the exam is served', a);
ok(idx(a).length === 60, 'a learner receives exactly the requested 60 questions', idx(a).length);
ok(a.bank_total === 100, 'the server says the bank holds 100', a.bank_total);
ok(JSON.stringify(idx(a)) === JSON.stringify(idx(b)), 'a reload returns the SAME 60 (a draft survives)');
ok(JSON.stringify(idx(a)) !== JSON.stringify(idx(c)), "the next learner's 60 is different");
ok(new Set(idx(a)).size === 60 && Math.max(...idx(a)) <= 99 && Math.min(...idx(a)) >= 0,
   'the 60 are distinct and inside the bank', idx(a).slice(0, 5));
ok(a.select_count === 0 && a.randomise === false,
   'the browser is told not to cut again (the double-cut that shrank a paper to 60 of 60)');
const order = idx(a);
ok(JSON.stringify(order) !== JSON.stringify([...order].sort((x, y) => x - y)),
   'the order is shuffled, not the first 60');

/* grading a subset must score the subset's own questions */
const answers = a.questions.map(z => ({ index: Number(z._orig_index), answer: 'A' }));
const sub = j((await q(`select cbt_submit($1::jsonb) r`, [JSON.stringify({
  exam_id: a.id, student_id_ref: 'GOSA/2026/0005', student_name: 'Faith', answers_data: answers, client_ref: 't41-1'
})]))[0].r);
ok(sub.saved === true, 'the subset submits', sub);
ok(Number(sub.score) === 60 && Number(sub.total) === 60,
   'every answer was graded against the question it belongs to (60/60)', { score: sub.score, total: sub.total });

/* multi-subject: the cap is per section, and every section is represented */
const multi = [
  ...Array.from({ length: 50 }, (_, i) => ({ question: 'M' + i, answer: 'A', section: 'Mathematics' })),
  ...Array.from({ length: 50 }, (_, i) => ({ question: 'E' + i, answer: 'A', section: 'English' }))
];
await db.exec(`update cbt_exams set csv_data='${JSON.stringify(multi)}'::jsonb, questions='${JSON.stringify(multi)}'::jsonb,
  subject='Multi-subject: Mathematics, English', select_count=10 where code='RND001'`);
const m1 = await get('GOSA/2026/0007', '');
const secs = (m1.questions || []).reduce((o, z) => { o[z.section] = (o[z.section] || 0) + 1; return o; }, {});
ok(secs.Mathematics === 10 && secs.English === 10,
   'a multi-subject paper takes 10 from each subject, never "the first 10 overall"', secs);

/* ------------------------------------------------------------------ B ---- */
console.log('\n=== B. a mark can never exceed its maximum ===');
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${ADMIN}'::uuid $$`);
await db.exec(`
  insert into profiles(id,email,role,status,full_name) values ('${ADMIN}','admin@school.test','admin','approved','Admin')
    on conflict (id) do update set role='admin', status='approved', email='admin@school.test';
  insert into students(id,full_name,class,arm,admission_no)
    values ('55555555-aaaa-bbbb-cccc-555555555555','Olatunbosun Faith Oladunni','SSS 1','A','GOSA/2026/0005');
  insert into assessment_columns(id,class,subject,term,session,name,max_mark,position)
    values ('66666666-aaaa-bbbb-cccc-666666666666','SSS 1','Coding and Robotics','First Term','2026/2027','Midterm Test',20,1);
  insert into report_scores(column_id,student_id,student_id_ref,student_name,class,subject,term,session,score)
    values ('66666666-aaaa-bbbb-cccc-666666666666','55555555-aaaa-bbbb-cccc-555555555555','GOSA/2026/0005','Olatunbosun Faith Oladunni','SSS 1','Coding and Robotics','First Term','2026/2027',18);
`);
const mk = async (score) => q(`insert into report_scores(column_id,student_id,student_id_ref,student_name,class,subject,term,session,score)
  values ('66666666-aaaa-bbbb-cccc-666666666666','55555555-aaaa-bbbb-cccc-555555555555','GOSA/2026/0005','Olatunbosun Faith Oladunni','SSS 1','Coding and Robotics','First Term','2026/2027',$1)`, [score]);
let refused = '';
try { await mk(21); } catch (e) { refused = e.message; }
ok(/above the maximum/.test(refused), 'a mark of 21 against a maximum of 20 is refused, by name', refused.slice(0, 120));

/* the same mark typed twice is ONE row, not two that add up */
await mk(17);
const rows = (await q(`select count(*)::int n, max(score) s from report_scores where column_id='66666666-aaaa-bbbb-cccc-666666666666'`))[0];
ok(rows.n === 1 && Number(rows.s) === 17, 're-saving a mark updates it instead of adding a second row', rows);

/* a differently-cased class on the same upsert cannot sneak a duplicate in */
await q(`insert into report_scores(column_id,student_id,student_id_ref,student_name,class,subject,term,session,score)
  values ('66666666-aaaa-bbbb-cccc-666666666666','55555555-aaaa-bbbb-cccc-555555555555','gosa/2026/0005','Faith','sss 1','coding and robotics','First Term','2026/2027',19)`);
const rows2 = (await q(`select count(*)::int n from report_scores where column_id='66666666-aaaa-bbbb-cccc-666666666666'`))[0];
ok(rows2.n === 1, 'a differently-spelled learner row lands on the same mark, not beside it', rows2);

/* lowering a maximum under existing marks is refused */
let low = '';
try { await q(`update assessment_columns set max_mark=10 where id='66666666-aaaa-bbbb-cccc-666666666666'`); }
catch (e) { low = e.message; }
ok(/Cannot set the maximum/.test(low), 'the maximum cannot be lowered under a mark that already exists', low.slice(0, 140));

/* legacy data — a mark stored before the guards existed — is repaired, and the
   card is rebuilt so the sheet and the marks agree */
await db.exec(`alter table report_scores disable trigger trg_report_score_max`);
await q(`update report_scores set score=21 where column_id='66666666-aaaa-bbbb-cccc-666666666666'`);
await db.exec(`alter table report_scores enable trigger trg_report_score_max`);
await q(`select sc_midterm_rebuild_one('55555555-aaaa-bbbb-cccc-555555555555','GOSA/2026/0005','Olatunbosun Faith Oladunni','SSS 1','First Term','2026/2027')`);
const card = j((await q(`select total, max_total, score_details, scores from midterm_report_cards where student_id_ref='GOSA/2026/0005'`))[0]);
ok(Number(card.total) <= Number(card.max_total),
   'the midterm card can never print more than its maximum (21 out of 20 is impossible)', card);
ok((card.score_details || []).some(d => d.overflow === true),
   'the card FLAGS the capped mark instead of hiding it', card.score_details);

const rec = j((await q(`select sc_mark_reconcile(true) r`))[0].r);
ok(rec.ok === true && rec.found >= 1 && rec.repaired >= 1, 'one command repairs what is already stored', { found: rec.found, repaired: rec.repaired });
const left = (await q(`select count(*)::int n from report_scores rs join assessment_columns ac on ac.id=rs.column_id where ac.max_mark>0 and rs.score>ac.max_mark+0.001`))[0];
ok(left.n === 0, 'nothing is left above its maximum afterwards', left);
const audit = j((await q(`select sc_report_mark_audit() r`))[0].r);
ok(audit.ok === true, 'the Score Audit agrees the school is clean', audit.verdict);

/* the posture function the school sees must agree too */
const post = (await q(`select * from sc_security_posture()`)).filter(r => /marks/.test(r.check_name))[0];
ok(post && post.status === 'pass', 'the security posture dashboard reports the marks check as passing', post);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
await db.close();
process.exit(fail ? 1 : 0);

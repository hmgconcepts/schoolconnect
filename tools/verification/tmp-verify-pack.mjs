import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const BOOT = HERE + 'pglite-boot.sql';
let sql = fs.readFileSync(process.env.SC_SCHEMA || (HERE + '../../database/complete-schema.sql'),'utf8');
const db = await PGlite.create();
await db.exec(fs.readFileSync(BOOT,'utf8'));
await db.exec(sql);
await db.exec(fs.readFileSync(HERE + '../../database/v12.60-expert-fix-pack.sql','utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid', true),'')::uuid $f$;`);
await db.exec(`
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','t@x.com') on conflict do nothing;
insert into auth.users(id,email) values('33333333-3333-3333-3333-333333333333','s@x.com') on conflict do nothing;
insert into auth.users(id,email) values('44444444-4444-4444-4444-444444444444','s2@x.com') on conflict do nothing;
update public.profiles set role='teacher', full_name='Teacher One', status='approved' where id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='admin', full_name='Bursar', status='approved' where id='44444444-4444-4444-4444-444444444444';
insert into public.students(id,user_id,full_name,class,arm,admission_no,status) values
 ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','Ada Obi','JSS1','A','ADM001','active'),
 ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444','Bola Ade','JSS1','A','ADM002','active');
insert into public.academic_periods(term,session,is_current) values('1st Term','2025/2026',true) on conflict do nothing;
insert into public.class_fee_structure(class,session,term,tuition,exam_fee,development,other_fee,discount,active) values ('JSS1','2025/2026','1st Term',50000,5000,5000,0,0,true);
`);
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
// ---- BUG 1: create CBT assignment, take link must be the CODE
await db.query(`insert into public.cbt_exams (title,subject,class,term,session,assessment_type,exam_mode,report_column,max_score,duration,duration_min,is_open,teacher_id,csv_data,questions,code)
values ('Maths Homework','Mathematics','JSS1','1st Term','2025/2026','assignment','registered','Assignment',10,30,30,true,'11111111-1111-1111-1111-111111111111',
 '[{"question":"2+2?","type":"mcq","a":"3","b":"4","c":"5","d":"6","answer":"B","mark":1},{"question":"3+3?","type":"mcq","a":"5","b":"6","c":"7","d":"8","answer":"B","mark":1}]'::jsonb,
 '[{"question":"2+2?","type":"mcq","a":"3","b":"4","c":"5","d":"6","answer":"B","mark":1},{"question":"3+3?","type":"mcq","a":"5","b":"6","c":"7","d":"8","answer":"B","mark":1}]'::jsonb,'4NTJNC') returning id`);
const ex = (await db.query(`select id from public.cbt_exams`)).rows[0].id;
const mirror = (await db.query(`select id,cbt_exam_id,is_cbt,drive_link from public.assignments`)).rows[0];
console.log('BUG1 mirror drive_link:', mirror.drive_link, '| is_cbt:', mirror.is_cbt);
const rawLink = mirror.drive_link.match(/code=([^&]+)/)[1];
const take = (await db.query(`select public.cbt_get_public_exam_v7($1,'ADM001') as r`, [rawLink])).rows[0].r;
console.log('BUG1 student takes via link code', rawLink, '=>', {ok:take.ok, questions:(take.questions||[]).length});
// simulate the LEGACY broken link (uuid) still in an old row
const legacy = (await db.query(`select public.cbt_get_public_exam_v7($1,'ADM001') as r`, [ex])).rows[0].r;
console.log('BUG1 legacy uuid link still opens:', {ok:legacy.ok, code:legacy.code, questions:(legacy.questions||[]).length});

// ---- BUG 6 + 5: fees must not double count
await db.exec(`set app.uid='44444444-4444-4444-4444-444444444444'`);
const acct = async (sid)=> (await db.query(`select public.sc_fee_account($1,null,null) as a`,[sid])).rows[0].a;
console.log('FEE start Ada:', JSON.stringify({bill:(await acct('22222222-2222-2222-2222-222222222222')).bill, paid:(await acct('22222222-2222-2222-2222-222222222222')).paid, due:(await acct('22222222-2222-2222-2222-222222222222')).total_due}));
// UI style: fee_total = current total_due then payment
for (const amt of [20000,20000]) {
  const a = await acct('22222222-2222-2222-2222-222222222222');
  await db.query(`insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date) values('22222222-2222-2222-2222-222222222222','Ada Obi',$1,$2,'1st Term','2025/2026','cash',current_date)`,[amt,a.total_due]);
  await db.query(`select public.sc_fee_sync_snapshots('22222222-2222-2222-2222-222222222222',null,null)`);
  const b = await acct('22222222-2222-2222-2222-222222222222');
  console.log(`FEE after paying ${amt}: bill=${b.bill} paid=${b.paid} balance=${b.balance} arrears=${b.arrears} TOTAL_DUE=${b.total_due} status=${b.status}`);
}
await db.query(`insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date) values('22222222-2222-2222-2222-222222222222','Ada Obi',20000,60000,'1st Term','2025/2026','cash',current_date)`);
await db.query(`select public.sc_fee_sync_snapshots('22222222-2222-2222-2222-222222222222',null,null)`);
const full = await acct('22222222-2222-2222-2222-222222222222');
console.log('FEE fully paid:', {paid:full.paid, total_due:full.total_due, status:full.status, fully_paid:full.fully_paid, debtor:full.debtor});
const led = await db.query(`select amount_paid,fee_total,balance from public.fee_payments order by created_at`);
console.log('FEE ledger snapshots (should descend, never exceed 60000):', led.rows.map(r=>`${r.amount_paid}: due ${r.fee_total} bal ${r.balance}`).join(' | '));

// ---- BUG 4: debtor vs fully paid filter
const roster = (await db.query(`select public.sc_fee_roster(null,null,null,'debtors') as r`)).rows[0].r;
console.log('ROSTER debtors:', roster.filtered_count, roster.rows.map(x=>x.student));
const rosterPaid = (await db.query(`select public.sc_fee_roster(null,null,null,'paid') as r`)).rows[0].r;
console.log('ROSTER fully paid:', rosterPaid.filtered_count, rosterPaid.rows.map(x=>x.student));
const ov = (await db.query(`select public.sc_fee_overview(null,null,null) as o`)).rows[0].o;
console.log('OVERVIEW:', {students:ov.students, fully_paid:ov.fully_paid, debtors:ov.debtors, billed:ov.billed, collected:ov.collected, outstanding:ov.outstanding});

// ---- BUG 7: bulk lock by filter (debtors)
const lock = (await db.query(`select public.sc_set_student_locks_by_filter('portal',true,'Fees outstanding — see bursary.',null,true,null,null,null) as r`)).rows[0].r;
console.log('BULK LOCK via one call:', lock);
const locks = await db.query(`select full_name, portal_locked, portal_lock_message from public.students order by full_name`);
console.log('LOCK STATE:', locks.rows);

// ---- BUG 8: flag capture + resolution
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
await db.query(`update public.cbt_exams set is_open=true where id=$1`,[ex]);
const sub = await db.query(`select public.cbt_submit_v6($1::jsonb) as r`, [JSON.stringify({exam_id:ex, student_id_ref:'ADM001', client_ref:'c1', answers_data:[{index:0,subject:'Mathematics',answer:'B'},{index:1,subject:'Mathematics',answer:'A'}], violations:0})]);
console.log('SUBMIT:', {saved:sub.rows[0].r.saved, score:sub.rows[0].r.score, total:sub.rows[0].r.total});
const rid = sub.rows[0].r.result_id;
await db.query(`update public.cbt_results set flagged_questions='[1]'::jsonb where id=$1`,[rid]);
const sum = (await db.query(`select public.sc_cbt_flagged_summary($1) as r`,[ex])).rows[0].r;
console.log('FLAGS summary:', {flagged_results:sum.flagged_results, q:(sum.questions||[]).map(x=>({index:x.index, by:x.flagged_by, question:x.question}))});
const res = (await db.query(`select public.sc_cbt_resolve_flag($1,1,'award_all','Q1 options were rendered wrong') as r`,[ex])).rows[0].r;
console.log('FLAG resolve award_all:', res);
const after = (await db.query(`select score,total,percent from public.cbt_results where id=$1`,[rid])).rows[0];
console.log('SCORE after resolution:', after);

// ---- BUG 3: publish all classes at once
await db.query(`insert into public.students(id,full_name,class,admission_no,status) values('66666666-6666-6666-6666-666666666666','Chidi Eze','JSS2','ADM003','active'),('77777777-7777-7777-7777-777777777777','Dayo Bello','JSS3','ADM004','active')`);
const pub = (await db.query(`select public.sc_publish_all_midterm_reports('1st Term','2025/2026',true,true) as r`)).rows[0].r;
console.log('MIDTERM publish-all:', {ok:pub.ok, classes:pub.classes, generated:pub.generated, details:(pub.details||[]).map(d=>d.class)});
const mrows = await db.query(`select class,count(*) n, bool_and(published) allpub from public.midterm_report_cards group by class order by class`);
console.log('MIDTERM rows:', mrows.rows);

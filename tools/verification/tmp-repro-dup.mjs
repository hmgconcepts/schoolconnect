import { PGlite } from '@electric-sql/pglite';
import { schemaText } from './schema-loader.mjs';
const db = await PGlite.create();
const H = new URL('.', import.meta.url).pathname;
await db.exec((await import('node:fs')).readFileSync(H + 'pglite-boot.sql', 'utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H + '../../database/complete-schema.sql'));
const q = async (s) => (await db.query(s)).rows;
const one = async (s) => (await q(s))[0];
const ADM = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','admin@x.t') on conflict do nothing;
  insert into profiles(id,full_name,role,status) values('${ADM}','Bursar','admin','approved')
    on conflict(id) do update set role='admin',status='approved';`);
await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADM]);

await db.exec(`insert into classes(name) values('JSS 1A') on conflict do nothing`);
const cls = 'JSS 1A';
await db.exec(`insert into academic_periods(session,term,is_current) values('2026/2027','First Term',true) on conflict do nothing`);

// two columns: the WRONG one and the RIGHT one
const mkcol = async (name) => (await one(`insert into assessment_columns(class,subject,name,term,session,max_mark,weight,"position",source,cbt_assessment_type)
  values('${cls}','*','${name}','First Term','2026/2027',20,1,0,'manual','midterm') returning id`)).id;
const wrong = await mkcol('CA1');
const right = await mkcol('Midterm Test');

// an exam mapped to the WRONG column
const ex = (await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session)
  values('${cls}','midterm','MTH1',20,60,'CA1','Mathematics','First Term','2026/2027') returning id`)).id;
await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version)
  values('${ex}','Ada Obi','ADM001',16,20,80,'graded','v5.1.3')`);

// push to the wrong column
const push = async () => (await one(`select sc_cbt_bulk_push_batch_v1(array['${ex}']::uuid[],null,false,20,false,'best',null,false) r`)).r;
console.log('push #1 ->', JSON.stringify((await push())));
console.log('rows now:', JSON.stringify(await q(`select ac.name, rs.score from report_scores rs join assessment_columns ac on ac.id=rs.column_id`)));

// teacher fixes the column -> trigger remaps
await db.exec(`update cbt_exams set report_column='Midterm Test' where id='${ex}'`);
console.log('after remap:', JSON.stringify(await q(`select ac.name, rs.score from report_scores rs join assessment_columns ac on ac.id=rs.column_id`)));

// teacher RE-PUSHES (the reported step)
console.log('push #2 ->', JSON.stringify((await push())));
const rows = await q(`select ac.name, rs.score from report_scores rs join assessment_columns ac on ac.id=rs.column_id order by 1`);
console.log('ROWS AFTER REPUSH:', JSON.stringify(rows, null, 0));
console.log('TOTAL ROWS FOR THIS STUDENT:', rows.length);
console.log(rows.length > 1 ? '*** DUPLICATE REPRODUCED ***' : 'no duplicate');

/* ---------- CASE 2: the student's name is corrected or differs ---------- */
console.log('\n--- CASE 2: name resolution differs between the two pushes ---');
await db.exec(`delete from report_scores`);
// exam A already mapped correctly; a result whose student_name is a variant
const ex2 = (await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session)
  values('${cls}','midterm','MTH2',20,60,'CA1','Mathematics','First Term','2026/2027') returning id`)).id;
await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version)
  values('${ex2}','Ada Obi', 'ADM002', 15,20,75,'graded','v5.1.3')`);
await db.exec(`insert into students(full_name,admission_no,class) values('ADA OBI','ADM002','${cls}') on conflict do nothing`);
const p2 = async () => (await one(`select sc_cbt_bulk_push_batch_v1(array['${ex2}']::uuid[],null,false,20,false,'best',null,false) r`)).r;
console.log('push A:', JSON.stringify((await p2()).saved));
// the student rename happens after the first push
await db.exec(`update students set full_name='Ada Chidinma Obi' where admission_no='ADM002'`);
console.log('push B:', JSON.stringify((await p2()).saved));
const rows2 = await q(`select ac.name, rs.student_name, rs.score from report_scores rs join assessment_columns ac on ac.id=rs.column_id order by 1`);
console.log('ROWS:', JSON.stringify(rows2));
console.log(rows2.length > 1 ? '*** DUPLICATE REPRODUCED (name is part of the key) ***' : 'no duplicate');

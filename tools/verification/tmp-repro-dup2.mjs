/* Reproduce item 3 exactly: wrong column -> results pushed -> teacher fixes the
   column -> REGRADE -> push again -> old score still shows under the wrong
   column AND a second row appears under the right one. */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { schemaText } from './schema-loader.mjs';
const db = await PGlite.create();
const H = new URL('.', import.meta.url).pathname;
await db.exec(fs.readFileSync(H + 'pglite-boot.sql', 'utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H + '../../database/complete-schema.sql'));
const q = async (s) => (await db.query(s)).rows;
const one = async (s) => (await q(s))[0];
const ADM = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
  insert into profiles(id,full_name,role,status) values('${ADM}','Bursar','admin','approved') on conflict(id) do update set role='admin',status='approved';`);
await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADM]);
await db.exec(`insert into classes(name) values('JSS 1A') on conflict do nothing`);
const cls='JSS 1A';
await db.exec(`insert into academic_periods(session,term,is_current) values('2026/2027','First Term',true) on conflict do nothing`);
const mkcol=async n=>(await one(`insert into assessment_columns(class,subject,name,term,session,max_mark,weight,"position",source,cbt_assessment_type)
  values('${cls}','*','${n}','First Term','2026/2027',20,1,0,'manual','midterm') returning id`)).id;
const ca1=await mkcol('CA1'), mid=await mkcol('Midterm Test');
const ex=(await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session)
  values('${cls}','midterm','MTH1',20,60,'CA1','Mathematics','First Term','2026/2027') returning id`)).id;
// student scored 16 in the first attempt
await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version)
  values('${ex}','Ada Obi','ADM001',16,20,80,'graded','v5.1.3')`);
const push=async()=>(await one(`select sc_cbt_bulk_push_batch_v1(array['${ex}']::uuid[],null,false,20,false,'best',null,false) r`)).r;
const rows=async()=>q(`select ac.name, rs.score, rs.source from report_scores rs join assessment_columns ac on ac.id=rs.column_id order by 1`);

console.log('1. push to WRONG column CA1 :', JSON.stringify(await push()));
console.log('   ', JSON.stringify(await rows()));

// teacher fixes the destination column on the exam
await db.exec(`update cbt_exams set report_column='Midterm Test' where id='${ex}'`);
console.log('2. after column change      :', JSON.stringify(await rows()));
console.log('   remap log:', JSON.stringify(await q(`select details from sc_install_state where key like 'v12.70-last-remap%' or key like 'v12.70-remap-failed%'`)));

// teacher REGRADES the results (this is what "regrade the results" does: the
// result row is re-scored, and its created_at moves)
await db.exec(`update cbt_results set score=18, percent=90, created_at=now() where exam_id='${ex}'`);
console.log('3. after regrade            :', JSON.stringify(await rows()));

console.log('4. push again               :', JSON.stringify(await push()));
const final=await rows();
console.log('   FINAL ROWS:', JSON.stringify(final));
console.log(final.length>1 ? '*** DUPLICATE REPRODUCED ***' : 'no duplicate');

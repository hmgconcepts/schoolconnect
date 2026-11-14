import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const {schemaText}=await import('./schema-loader.mjs');
const db=await PGlite.create();
const H=new URL('.', import.meta.url).pathname;
await db.exec(fs.readFileSync(H+'pglite-boot.sql','utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H+'../../database/complete-schema.sql'));
const q=async s=>(await db.query(s)).rows;
const one=async s=>(await q(s))[0];
const ADM='11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
 insert into profiles(id,full_name,role,status) values('${ADM}','B','admin','approved') on conflict(id) do update set role='admin',status='approved';`);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ADM]);
await db.exec(`insert into classes(name) values('JSS 1A') on conflict do nothing`);
await db.exec(`insert into academic_periods(session,term,is_current) values('2026/2027','First Term',true) on conflict do nothing`);
await db.exec(`insert into assessment_columns(class,subject,name,term,session,max_mark,weight,"position",source,cbt_assessment_type) values('JSS 1A','*','CBT1','First Term','2026/2027',20,1,0,'manual','midterm') on conflict do nothing`);
// 200 learners, one exam
const stu=[];for(let i=1;i<=200;i++)stu.push(`('aaaaaaaa-0000-0000-0000-${String(i).padStart(12,'0')}','L${i}','ADM${String(i).padStart(4,'0')}','JSS 1A')`);
await db.exec(`insert into students(id,full_name,admission_no,class) values ${stu.join(',')} on conflict do nothing`);
const ex=(await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session) values('JSS 1A','midterm','M1',20,60,'CBT1','Mathematics','First Term','2026/2027') returning id`)).id;
const rows=[];for(let i=1;i<=200;i++)rows.push(`('${ex}','L${i}','ADM${String(i).padStart(4,'0')}',15,20,75,'graded','v5.1.3')`);
await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version) values ${rows.join(',')}`);

// time the pieces: raw insert into report_scores vs the full push
let t=Date.now();
await db.exec(`insert into report_scores(column_id,student_id_ref,student_name,class,subject,term,session,score,source)
 select ac.id, 'ADM'||lpad(g::text,4,'0'), 'L'||g, 'JSS 1A','Math','First Term','2026/2027', 15, 'manual'
 from assessment_columns ac, generate_series(1,200) g where ac.name='CBT1'`);
console.log('raw 200-row insert into report_scores:', Date.now()-t, 'ms');
await db.exec(`delete from report_scores`);
t=Date.now();
const out=await one(`select sc_cbt_bulk_push_batch_v1(array['${ex}']::uuid[],null,false,20,false,'best',null,false) r`);
console.log('single-exam push of 200 results:', Date.now()-t, 'ms ->', out.r.saved);
// how many times did the flush run?
console.log('midterm_report_cards rows:', JSON.stringify(await q('select count(*) n from midterm_report_cards')));

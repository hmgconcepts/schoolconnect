import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const {schemaText}=await import('./schema-loader.mjs');
const H=new URL('.', import.meta.url).pathname;
async function run(EXAMS, PER) {
  const db=await PGlite.create();
  await db.exec(fs.readFileSync(H+'pglite-boot.sql','utf8'));
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
  await db.exec(schemaText(H+'../../database/complete-schema.sql'));
  const q=async s=>(await db.query(s)).rows, one=async s=>(await q(s))[0];
  const ADM='11111111-1111-1111-1111-111111111111';
  await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
   insert into profiles(id,full_name,role,status) values('${ADM}','B','admin','approved') on conflict(id) do update set role='admin',status='approved';`);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ADM]);
  await db.exec(`insert into classes(name) values('JSS 1A') on conflict do nothing`);
  await db.exec(`insert into academic_periods(session,term,is_current) values('2026/2027','First Term',true) on conflict do nothing`);
  const cols=[];for(let e=1;e<=EXAMS;e++)cols.push(`('JSS 1A','*','CBT${e}','First Term','2026/2027',20,1,0,'manual','midterm')`);
  await db.exec(`insert into assessment_columns(class,subject,name,term,session,max_mark,weight,"position",source,cbt_assessment_type) values ${cols.join(',')} on conflict do nothing`);
  const stu=[];for(let i=1;i<=PER;i++)stu.push(`('aaaaaaaa-0000-0000-0000-${String(i).padStart(12,'0')}','L${i}','ADM${String(i).padStart(4,'0')}','JSS 1A')`);
  await db.exec(`insert into students(id,full_name,admission_no,class) values ${stu.join(',')} on conflict do nothing`);
  const exs=[],res=[];
  for(let e=1;e<=EXAMS;e++){
    const id=(await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session) values('JSS 1A','midterm','M${e}',20,60,'CBT${e}','Mathematics','First Term','2026/2027') returning id`)).id;
    exs.push(id);
    for(let i=1;i<=PER;i++)res.push(`('${id}','L${i}','ADM${String(i).padStart(4,'0')}',15,20,75,'graded','v5.1.3')`);
  }
  for(let i=0;i<res.length;i+=500) await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version) values ${res.slice(i,i+500).join(',')}`);
  const t=Date.now();
  const out=await one(`select sc_cbt_bulk_push_batch_v1(array[${exs.map(i=>`'${i}'`).join(',')}]::uuid[],null,false,20,false,'best',null,true) r`);
  const ms=Date.now()-t;
  console.log(`EXAMS=${EXAMS} PER=${PER} rows=${EXAMS*PER} -> ${ms} ms  saved=${out.r.saved} ok=${out.r.ok}`);
  await db.close();
}
await run(2,10);
await run(4,10);
await run(8,10);
await run(8,20);

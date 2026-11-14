import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const {schemaText}=await import('./schema-loader.mjs');
const H=new URL('.', import.meta.url).pathname;
const db=await PGlite.create();
await db.exec(fs.readFileSync(H+'pglite-boot.sql','utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H+'../../database/complete-schema.sql'));
const q=async s=>(await db.query(s)).rows, one=async s=>(await q(s))[0];
const ADM='11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing; insert into profiles(id,full_name,role,status) values('${ADM}','B','admin','approved') on conflict(id) do update set role='admin',status='approved';`);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ADM]);
await db.exec(`insert into classes(name) values('JSS 1A') on conflict do nothing; insert into academic_periods(session,term,is_current) values('2026/2027','First Term',true) on conflict do nothing`);
const EXAMS=8, PER=20;
const cols=[];for(let e=1;e<=EXAMS;e++)cols.push(`('JSS 1A','*','CBT${e}','First Term','2026/2027',20,1,0,'manual','midterm')`);
await db.exec(`insert into assessment_columns(class,subject,name,term,session,max_mark,weight,"position",source,cbt_assessment_type) values ${cols.join(',')} on conflict do nothing`);
const stu=[];for(let i=1;i<=PER;i++)stu.push(`('aaaaaaaa-0000-0000-0000-${String(i).padStart(12,'0')}','L${i}','ADM${String(i).padStart(4,'0')}','JSS 1A')`);
await db.exec(`insert into students(id,full_name,admission_no,class) values ${stu.join(',')} on conflict do nothing`);
const exs=[],res=[];
for(let e=1;e<=EXAMS;e++){const id=(await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session) values('JSS 1A','midterm','M${e}',20,60,'CBT${e}','Mathematics','First Term','2026/2027') returning id`)).id;exs.push(id);for(let i=1;i<=PER;i++)res.push(`('${id}','L${i}','ADM${String(i).padStart(4,'0')}',15,20,75,'graded','v5.1.3')`);}
await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version) values ${res.join(',')}`);

// isolate: the SELECT half of the insert, without writing
const ids=exs.map(i=>`'${i}'`).join(',');
const sel = `
  with exams as (
    select e.*,coalesce(nullif(trim(null),''),nullif(trim(e.report_column),''),'CBT / Online Exam') target
      from public.cbt_exams e where e.id=any(array[${ids}]::uuid[])
  ), mapped as (
    select e.*,c.id column_id,c.max_mark from exams e cross join lateral(
      select ac.id,ac.max_mark from public.assessment_columns ac where ac.class=e.class and ac.subject='*'
       and lower(trim(ac.term))=lower(trim(e.term)) and lower(trim(ac.session))=lower(trim(e.session)) and lower(trim(ac.name))=lower(trim(e.target))
       order by ac.created_at asc limit 1) c
  )
  select count(*) n from mapped`;
let t=Date.now(); const r1=await one(sel); console.log('mapped CTE only:', Date.now()-t,'ms rows=',r1.n);

const sel2 = `
  with exams as (
    select e.*,coalesce(nullif(trim(e.report_column),''),'CBT / Online Exam') target from public.cbt_exams e where e.id=any(array[${ids}]::uuid[])
  ), mapped as (
    select e.*,c.id column_id,c.max_mark from exams e cross join lateral(
      select ac.id,ac.max_mark from public.assessment_columns ac where ac.class=e.class and ac.subject='*'
       and lower(trim(ac.term))=lower(trim(e.term)) and lower(trim(ac.session))=lower(trim(e.session)) and lower(trim(ac.name))=lower(trim(e.target))
       order by ac.created_at asc limit 1) c
  ), base as (
    select r.id result_id,r.student_id,m.column_id,coalesce(nullif(trim(r.student_id_ref),''),nullif(trim(st.admission_no),''),r.student_id::text) student_ref,
      coalesce(nullif(trim(st.full_name),''),nullif(trim(r.student_name),''),'Student') student_name,
      m.class,m.term,m.session,m.target,m.max_mark,coalesce(nullif(trim(m.subject),''),'CBT') exam_subject,coalesce(r.subject_scores,'{}'::jsonb) subject_scores,
      coalesce(r.percent,case when r.total>0 then (r.score/r.total)*100 else 0 end) pct,r.created_at
    from mapped m join public.cbt_results r on r.exam_id=m.id left join public.students st on st.id=r.student_id
    where coalesce(r.grading_status,'graded')='graded'
  ) select count(*) n from base`;
t=Date.now(); const r2=await one(sel2); console.log('base CTE only  :', Date.now()-t,'ms rows=',r2.n);

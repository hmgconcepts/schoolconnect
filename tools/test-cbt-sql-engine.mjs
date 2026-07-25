#!/usr/bin/env node
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const staff='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',exam='33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid()returns uuid language sql stable as $$select '${staff}'::uuid$$;
create table students(id uuid primary key,admission_no text);
create table cbt_exams(id uuid primary key,code text,title text,class text,exam_mode text default 'open',is_open boolean default true,is_archived boolean default false,start_at timestamptz,close_at timestamptz,attempt_limit int default 3,csv_data jsonb default '[]',questions jsonb default '[]',negative_mark numeric default 0,release_results boolean default true,certificate_enabled boolean default false,report_column text,updated_at timestamptz default now());
create table cbt_results(id uuid primary key default gen_random_uuid(),exam_id uuid,student_id uuid,student_name text,student_class text,student_id_ref text,student_type text,score numeric,total numeric,percent numeric,correct_count int,wrong_count int,skipped_count int,ungraded_count int default 0,grading_status text default 'graded',engine_version text default '',attempt_number int,time_taken int,violations int,violation_log jsonb,answers_data jsonb,cert_code text,client_ref text,subject_scores jsonb default '{}',unique(exam_id,client_ref));
create function public.is_staff(uuid)returns boolean language sql stable as $$select true$$;
create function public.sc_cbt_norm(text)returns text language sql immutable as $$select lower(regexp_replace(trim(coalesce($1,'')),'\\s+',' ','g'))$$;
insert into students values('${student}','SCD-1');`);
const hotfix=fs.readFileSync(new URL('../database/cbt-v5.1-zero-score-hotfix.sql',import.meta.url),'utf8');if(!hotfix.includes('cbt_submit_v5'))throw Error('V5.1 hotfix missing');await db.exec(hotfix);
const redacted=(await db.query(`select public.sc_cbt_public_question('{"Question":"Safe?","CorrectAnswer":"B","answer_key":"B","Explanation":"secret","Option A":"No","Option B":"Yes"}'::jsonb) q`)).rows[0].q;if(redacted.CorrectAnswer||redacted.answer_key||redacted.Explanation||redacted['Option B']!=='Yes')throw Error('answer-key redaction failed '+JSON.stringify(redacted));
const bank=[
 {Question:'2 + 2?',Type:'multiplechoice','Option A':'3','Option B':'4','Option C':'5',CorrectAnswer:'B',Marks:2,Subject:'Mathematics'},
 {question:'Nigeria capital?',type:'mcq',choices:['Lagos','Abuja','Kano'],correct_option:'Abuja',mark:2,section:'Civic'},
 {question:'The sky is blue',type:'truefalse','Correct Answer':'A',mark:1,section:'English'},
 {question:'Select nouns',type:'mrq',A:'quickly',B:'teacher',C:'school',D:'run',answer_key:'B|C',mark:2,section:'English'},
 {question:'Square root of 144',type:'number',rightAnswer:'12',tolerance:'0.01',mark:3,section:'Mathematics'}
];
await db.query(`insert into cbt_exams(id,code,title,class,csv_data,questions)values($1,'TEST-V51','Test','SS2',$2,$2)`,[exam,JSON.stringify(bank)]);
const diag=(await db.query(`select public.cbt_diagnose_exam($1) d`,[exam])).rows[0].d;if(diag.question_count!==5||diag.gradable_count!==5||diag.missing_answer_indexes.length)throw Error('bad diagnostic '+JSON.stringify(diag));
const answers=[{index:0,answer:'B'},{index:1,answer:'B'},{index:2,answer:'A'},{index:3,answer:['C','B']},{index:4,answer:'12.005'}];
const payload={exam_id:exam,student_name:'Test Student',student_class:'SS2',student_id_ref:'SCD-1',client_ref:'attempt-v51-1',answers_data:answers,client_engine:'v5.1'};
const out=(await db.query(`select public.cbt_submit_v5($1::jsonb) d`,[JSON.stringify(payload)])).rows[0].d;if(!out.saved||out.score!==10||out.total!==10||out.percent!==100||out.correct_count!==5||out.engine_version!=='v5.1.0')throw Error('bad grading '+JSON.stringify(out));
const dup=(await db.query(`select public.cbt_submit_v5($1::jsonb) d`,[JSON.stringify(payload)])).rows[0].d;if(!dup.saved||!dup.duplicate||dup.score!==10)throw Error('idempotence failed');
await db.query(`update cbt_results set score=0,percent=0,correct_count=0,engine_version='legacy' where exam_id=$1`,[exam]);const regrade=(await db.query(`select public.cbt_regrade_exam_results_v5($1) d`,[exam])).rows[0].d;const fixed=(await db.query(`select score,total,percent,correct_count,engine_version from cbt_results where exam_id=$1`,[exam])).rows[0];if(!regrade.ok||regrade.regraded_count!==1||Number(fixed.score)!==10||Number(fixed.percent)!==100||fixed.correct_count!==5||fixed.engine_version!=='v5.1.0-regraded')throw Error('historical regrade failed '+JSON.stringify({regrade,fixed}));
// Missing keys must fail loudly instead of silently recording zero.
await db.query(`update cbt_exams set csv_data='[{"question":"Broken","type":"mcq","options":["A","B"]}]'::jsonb,questions='[]' where id=$1`,[exam]);
const broken={...payload,client_ref:'attempt-v51-broken',answers_data:[{index:0,answer:'A'}]};const fail=(await db.query(`select public.cbt_submit_v5($1::jsonb) d`,[JSON.stringify(broken)])).rows[0].d;if(fail.saved||fail.error!=='answer_key_missing')throw Error('missing-key guard failed '+JSON.stringify(fail));
console.log(JSON.stringify({ok:true,engine:out.engine_version,score:out.score,total:out.total,percent:out.percent,correct:out.correct_count,diagnostic:diag,idempotent:dup.duplicate,historical_regrade:regrade,missing_key_guard:fail.error,public_answer_keys_redacted:true},null,2));await db.close();

#!/usr/bin/env node
// V12.48/49 regression: canonical bank save+verification, append, midterm/terminal separation,
// report score auto-sync, and parent visibility only after publish.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const schema=fs.readFileSync(new URL('../database/complete-schema.sql',import.meta.url),'utf8')
  .replace(/create extension if not exists "uuid-ossp";/ig,'')
  .replace(/create extension if not exists "pgcrypto";/ig,'');
const admin='55555555-5555-4555-8555-555555555555';
const parent='66666666-6666-4666-8666-666666666666';
const exam='77777777-7777-4777-8777-777777777777';
const q=(sql,args=[])=>db.query(sql,args);
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}'::jsonb,email_confirmed_at timestamptz,updated_at timestamptz default now(),created_at timestamptz default now());create table auth_uid_holder(uid uuid);insert into auth_uid_holder values(null);create function auth.uid()returns uuid language sql stable as $$select uid from auth_uid_holder limit 1$$;create function auth.role()returns text language sql stable as $$select case when (select uid from auth_uid_holder limit 1) is null then 'anon' else 'authenticated' end::text$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
await db.exec(schema);
await db.exec(schema); // cumulative idempotence guard
await q(`insert into auth.users(id,email,email_confirmed_at) values($1,'admin@test',now()),($2,'parent@test',now())`,[admin,parent]);
await q(`insert into profiles(id,email,full_name,role,status) values($1,'admin@test','Test Admin','admin','active'),($2,'parent@test','Test Parent','parent','active') on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,role=excluded.role,status=excluded.status`,[admin,parent]);
const sid=(await q(`insert into students(admission_no,full_name,class,status) values('ADM001','Student One','JSS 1','active') returning id`)).rows[0].id;
await q(`insert into parent_child(parent_id,student_id) values($1,$2)`,[parent,sid]);
const sid2=(await q(`insert into students(admission_no,full_name,class,status) values('ADM002','Student Two','JSS 1','active') returning id`)).rows[0].id;
await q(`insert into cbt_exams(id,code,title,subject,class,term,session,is_open,exam_mode,csv_data,questions) values($1,'TST123','Test CBT','Mathematics','JSS 1','First Term','2026/2027',true,'registered',$2::jsonb,$2::jsonb)`,[exam,JSON.stringify([{question:'Old',type:'mcq',options:['A','B'],answer:'A',mark:1}])]);
await q(`update auth_uid_holder set uid=$1`,[admin]);
const bank=[{question:'Edited question',type:'mcq',options:['A','B'],answer:'B',mark:2}];
const save=(await q(`select cbt_force_replace_bank_v3($1,$2::jsonb,1) as d`,[exam,JSON.stringify(bank)])).rows[0].d;
if(!save.ok||save.version!==2) throw new Error('force replace failed '+JSON.stringify(save));
const verified=(await q(`select cbt_verify_exam_bank($1,$2) as d`,[exam,save.hash])).rows[0].d;
if(!verified.ok||verified.verified!==true||Number(verified.count)!==1) throw new Error('canonical verify failed '+JSON.stringify(verified));
const appended=(await q(`select cbt_force_append_bank_v2($1,$2::jsonb) as d`,[exam,JSON.stringify([{question:'Attached CSV question',type:'numeric',answer:'7',mark:1}])])).rows[0].d;
const v2=(await q(`select cbt_verify_exam_bank($1,$2) as d`,[exam,appended.hash])).rows[0].d;
if(!appended.ok||Number(appended.total)!==2||v2.verified!==true) throw new Error('append/verify failed '+JSON.stringify({appended,v2}));
const col=(await q(`insert into assessment_columns(class,subject,term,session,name,max_mark,cbt_assessment_type) values('JSS 1','Mathematics','First Term','2026/2027','Midterm',30,'test') returning id`)).rows[0].id;
await q(`insert into report_scores(column_id,student_id,student_id_ref,student_name,class,subject,term,session,score,source) values($1,$2,'ADM001','Student One','JSS 1','Mathematics','First Term','2026/2027',24,'cbt')`,[col,sid]);
const mid=(await q(`select * from midterm_report_cards where student_id_ref='ADM001' and class='JSS 1' and term='First Term' and session='2026/2027'`)).rows[0];
if(!mid||Number(mid.total)!==24||mid.published!==false) throw new Error('midterm auto sync failed '+JSON.stringify(mid));
const gen=(await q(`select generate_midterm_reports('JSS 1','First Term','2026/2027') as d`)).rows[0].d;
const noScore=(await q(`select has_scores,total from midterm_report_cards where student_id_ref='ADM002' and class='JSS 1' and term='First Term' and session='2026/2027'`)).rows[0];
if(!gen.ok||!noScore||noScore.has_scores!==false||Number(noScore.total)!==0)throw new Error('midterm roster completeness failed '+JSON.stringify({gen,noScore}));
const terminalCount=Number((await q(`select count(*)::int n from report_cards where student_id_ref='ADM001'`)).rows[0].n);
if(terminalCount!==0) throw new Error('midterm generation changed terminal report_cards');
await q(`update auth_uid_holder set uid=$1`,[parent]);
const hidden=(await q(`select get_midterm_report('ADM001','JSS 1','First Term','2026/2027') as d`)).rows[0].d;
if(hidden.ok!==false||hidden.error!=='not_published') throw new Error('unpublished report leaked to parent '+JSON.stringify(hidden));
await q(`update auth_uid_holder set uid=$1`,[admin]);
await q(`select publish_midterm_reports('JSS 1','First Term','2026/2027',true)`);
await q(`update auth_uid_holder set uid=$1`,[parent]);
const visible=(await q(`select get_midterm_report('ADM001','JSS 1','First Term','2026/2027') as d`)).rows[0].d;
if(!visible.ok||visible.report.student_id_ref!=='ADM001') throw new Error('published parent report unavailable '+JSON.stringify(visible));
console.log(JSON.stringify({ok:true,canonical_replace_verified:true,append_verified:true,midterm_auto_sync:true,terminal_separate:true,parent_unpublished_blocked:true,parent_published_allowed:true},null,2));
await db.close();

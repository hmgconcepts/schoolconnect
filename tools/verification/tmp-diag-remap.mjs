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
const ADM='11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
 insert into profiles(id,full_name,role,status) values('${ADM}','B','admin','approved') on conflict(id) do update set role='admin';`);
await db.query(`select set_config('request.jwt.claim.sub', $1, false)`,[ADM]);
await db.exec(`insert into classes(name) values('JSS 1A') on conflict do nothing`);
await db.exec(`insert into academic_periods(session,term,is_current) values('2026/2027','First Term',true) on conflict do nothing`);
const mkcol=async n=>(await one(`insert into assessment_columns(class,subject,name,term,session,max_mark,weight,"position",source,cbt_assessment_type)
 values('JSS 1A','*','${n}','First Term','2026/2027',20,1,0,'manual','midterm') returning id`)).id;
await mkcol('CA1'); await mkcol('Midterm Test');
const ex=(await one(`insert into cbt_exams(class,assessment_type,code,max_score,duration_min,report_column,subject,term,session)
 values('JSS 1A','midterm','MTH1',20,60,'CA1','Mathematics','First Term','2026/2027') returning id`)).id;
await db.exec(`insert into cbt_results(exam_id,student_name,student_id_ref,score,total,percent,grading_status,engine_version)
 values('${ex}','Ada Obi','ADM001',16,20,80,'graded','v5.1.3')`);
await one(`select sc_cbt_bulk_push_batch_v1(array['${ex}']::uuid[],null,false,20,false,'best',null,false) r`);
console.log('before:', JSON.stringify(await q(`select ac.name from report_scores rs join assessment_columns ac on ac.id=rs.column_id`)));

// call the remap DIRECTLY to see its real answer
const direct = await one(`select sc_report_remap_cbt('${ex}'::uuid,'Midterm Test',null,false) r`);
console.log('DIRECT remap result:', JSON.stringify(direct.r));

// and via the trigger path
await db.exec(`update cbt_exams set report_column='Midterm Test' where id='${ex}'`);
console.log('after trigger :', JSON.stringify(await q(`select ac.name from report_scores rs join assessment_columns ac on ac.id=rs.column_id`)));
console.log('install_state:', JSON.stringify(await q(`select key, details from sc_install_state where key like 'v12.70%' order by key`)));

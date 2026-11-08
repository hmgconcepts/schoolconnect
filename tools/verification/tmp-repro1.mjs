import { makeDb } from './tmp-harness.mjs';
const {db, err} = await makeDb();
if(err){ console.log('SCHEMA ERR', err); process.exit(1); }
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid', true),'')::uuid $f$;`);
await db.exec(`insert into public.school_settings(id, school_name) values(1,'Test School') on conflict do nothing;`);
await db.exec(`insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','t@x.com') on conflict do nothing;`);
await db.exec(`insert into auth.users(id,email) values('22222222-2222-2222-2222-222222222222','s@x.com') on conflict do nothing;`);
await db.query(`update public.profiles set role='teacher',full_name='Teacher One' where id='11111111-1111-1111-1111-111111111111' returning id`);
await db.query(`insert into public.students(id,user_id,full_name,class,arm,admission_no,status) values('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','Ada Obi','JSS1','A','ADM001','active') returning id`);
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
await db.query(`insert into public.cbt_exams (title,subject,class,term,session,assessment_type,exam_mode,report_column,max_score,duration,duration_min,is_open,teacher_id,csv_data,questions,code)
values ('Maths Homework','Mathematics','JSS1','1st Term','2025/2026','assignment','registered','Assignment',10,30,30,true,'11111111-1111-1111-1111-111111111111',
 '[{"question":"2+2?","type":"mcq","a":"3","b":"4","c":"5","d":"6","answer":"B","mark":1}]'::jsonb,
 '[{"question":"2+2?","type":"mcq","a":"3","b":"4","c":"5","d":"6","answer":"B","mark":1}]'::jsonb,
'4NTJNC') returning id,code`);
const a = await db.query(`select id, title, class, subject, cbt_exam_id, is_cbt, drive_link from public.assignments`);
console.log('MIRROR ROW:', a.rows);
const g = await db.query(`select public.cbt_get_public_exam_v6('4NTJNC','ADM001') as r`);
const r = g.rows[0].r;
console.log('take w/ CODE:', {ok:r.ok, title:r.title, nq:(r.questions||[]).length});
const g2 = await db.query(`select public.cbt_get_public_exam_v6('082e699f-e290-4f8e-93b2-bd4df0a7fd2a','ADM001') as r`);
const r2 = g2.rows[0].r;
console.log('take w/ UUID:', {ok:r2.ok, error:r2.error, message:r2.message});

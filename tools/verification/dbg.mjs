import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = await PGlite.create();
await db.exec(fs.readFileSync('/home/user/repos/schoolconnect/tools/verification/pglite-boot.sql','utf8'));
await db.exec(fs.readFileSync('/tmp/new-schema.sql','utf8').replace(/create extension[^;]*;/gi,'select 1;'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid', true),'')::uuid $f$;`);
await db.exec(`
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','a@x.com') on conflict do nothing;
update public.profiles set role='admin', status='approved' where id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='student' where id='11111111-1111-1111-1111-111111111111';
insert into public.students(id,full_name,class,arm,admission_no,status) values('d4000000-0000-4000-8000-00000000000e','X','SS 2','A','A1','active');
insert into public.academic_periods(term,session,is_current) values ('First Term','2025/2026',false),('Second Term','2025/2026',true);
insert into public.class_fee_structure(class,session,term,tuition,exam_fee,development,other_fee,discount,active)
  values('SS 2','2025/2026','Second Term',40000,5000,5000,0,0,true),('SS 2','2025/2026','First Term',40000,5000,5000,0,0,true);
insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date)
  values('d4000000-0000-4000-8000-00000000000e','X',10000,50000,'First Term','2025/2026','cash',current_date);
`);
console.log('First Term bill:', JSON.stringify((await db.query(`select public.sc_fee_bill_for('d4000000-0000-4000-8000-00000000000e','First Term','2025/2026') as b`)).rows[0].b));
console.log('Second Term bill:', JSON.stringify((await db.query(`select public.sc_fee_bill_for('d4000000-0000-4000-8000-00000000000e','Second Term','2025/2026') as b`)).rows[0].b).slice(0,150));

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = await PGlite.create();
await db.exec(fs.readFileSync('tools/verification/pglite-boot.sql','utf8'));
await db.exec(fs.readFileSync('/tmp/new-schema.sql','utf8').replace(/create extension[^;]*;/gi,'select 1;'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid', true),'')::uuid $f$;`);
await db.exec(`
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','a@x.com') on conflict do nothing;
update public.profiles set role='admin', status='approved' where id='11111111-1111-1111-1111-111111111111';
insert into public.students(id,full_name,class,arm,admission_no,status) values
 ('d4000000-0000-4000-8000-00000000000e','SS2 Student','SS 2','A','A1','active'),
 ('d4000000-0000-4000-8000-00000000000f','JSS1 Student','JSS 1','A','A2','active');
insert into public.academic_periods(term,session,is_current) values ('First Term','2025/2026',false),('Second Term','2025/2026',true);
insert into public.class_fee_structure(class,session,term,tuition,exam_fee,development,other_fee,discount,active)
  values('SS 2','2025/2026','Second Term',40000,5000,5000,0,0,true),('SS 2','2025/2026','First Term',40000,5000,5000,0,0,true),
        ('JSS 1','2025/2026','Second Term',30000,5000,5000,0,0,true);
insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date)
  values('d4000000-0000-4000-8000-00000000000e','SS2 Student',10000,50000,'First Term','2025/2026','cash',current_date),
        ('d4000000-0000-4000-8000-00000000000f','JSS1 Student',40000,40000,'Second Term','2025/2026','cash',current_date);
`);
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
const o = (await db.query(`select public.sc_fee_overview(null,null,null) as o`)).rows[0].o;
console.log(JSON.stringify({students:o.students, fully_paid:o.fully_paid, debtors:o.debtors, partial:o.partial,
  billed:o.billed, aid:o.aid, net_bill:o.net_bill, collected:o.collected, outstanding:o.outstanding,
  arrears:o.arrears, rate:o.collection_rate, breakdown:o.breakdown}, null, 1));
const rows = o.rows.map(r=>({n:r.student, bill:r.bill, paid:r.paid, due:r.total_due, st:r.status}));
console.log('ROWS:', JSON.stringify(rows));

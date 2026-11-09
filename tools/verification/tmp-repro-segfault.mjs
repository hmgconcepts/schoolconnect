/* Reproduces the "Paid vs Debtors" crash from the screenshot:
   sc_fee_account() aborted with
     invalid input syntax for type numeric: {"ok": true, "aid": 15000, "bill": 0, ...}
   whenever a student had a ledger row in ANOTHER term (the arrears scan). */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const db = await PGlite.create();
await db.exec(fs.readFileSync(HERE + 'pglite-boot.sql', 'utf8'));
const schema = fs.readFileSync(process.env.SC_SCHEMA || (HERE + '../../database/complete-schema.sql'), 'utf8')
  .replace(/create extension[^;]*;/gi, 'select 1;');
await db.exec(schema);
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid', true),'')::uuid $f$;`);
await db.exec(`
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','a@x.com') on conflict do nothing;
update public.profiles set role='admin', full_name='Bursar', status='approved' where id='11111111-1111-1111-1111-111111111111';
insert into auth.users(id,email) values('33333333-3333-3333-3333-333333333333','s@x.com') on conflict do nothing;
insert into public.students(id,user_id,full_name,class,arm,admission_no,status)
  values('d4000000-0000-4000-8000-00000000000e','33333333-3333-3333-3333-333333333333','SS2 Student','SS 2','A','ADM/SS2/01','active') on conflict do nothing;
insert into public.academic_periods(term,session,is_current) values
  ('First Term','2025/2026',false),('Second Term','2025/2026',true) on conflict do nothing;
insert into public.class_fee_structure(class,session,term,tuition,exam_fee,development,other_fee,discount,active)
  values('SS 2','2025/2026','Second Term',40000,5000,5000,0,0,true),
        ('SS 2','2025/2026','First Term',40000,5000,5000,0,0,true);
-- a ledger row in ANOTHER term (this is what triggers the arrears scan)
insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date)
  values('d4000000-0000-4000-8000-00000000000e','SS2 Student',10000,50000,'First Term','2025/2026','cash',current_date);
`);
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
console.log('--- sc_fee_account (current term, other-term ledger row present) ---');
try {
  const r = await db.query(`select public.sc_fee_account('d4000000-0000-4000-8000-00000000000e', null, null) as a`);
  const a = r.rows[0].a;
  console.log('OK  bill=%s paid=%s total_due=%s arrears=%s status=%s', a.bill, a.paid, a.total_due, a.arrears, a.status);
} catch (e) { console.log('FAIL', String(e.message).slice(0, 220)); }
console.log('--- sc_fee_roster filter=paid (the exact UI call that crashed) ---');
try {
  const r = await db.query(`select public.sc_fee_roster(null,null,null,'paid') as r`);
  console.log('OK  filtered_count=%s students=%s', r.rows[0].r.filtered_count, r.rows[0].r.students);
} catch (e) { console.log('FAIL', String(e.message).slice(0, 220)); }
console.log('--- sc_fee_overview ---');
try {
  const r = await db.query(`select public.sc_fee_overview(null,null,null) as o`);
  const o = r.rows[0].o;
  console.log('OK  students=%s billed=%s collected=%s outstanding=%s', o.students, o.billed, o.collected, o.outstanding);
} catch (e) { console.log('FAIL', String(e.message).slice(0, 220)); }

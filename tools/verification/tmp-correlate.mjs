/* Item #4/#5 verification — the three surfaces must agree for the same student:
     sc_fee_account (fees page drawer / student record)
     sc_student_fee_state (parent + student portal panel)
     sc_fee_overview (homepage widget + fees page totals)
   Each payment must move "paid" UP and "outstanding" DOWN. */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const SCHEMA = process.env.SC_SCHEMA || (HERE + '../../database/complete-schema.sql');
const db = await PGlite.create();
await db.exec(fs.readFileSync(HERE + 'pglite-boot.sql', 'utf8'));
await db.exec(fs.readFileSync(SCHEMA, 'utf8').replace(/create extension[^;]*;/gi, 'select 1;'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid', true),'')::uuid $f$;`);
await db.exec(`
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','a@x.com') on conflict do nothing;
update public.profiles set role='admin',status='approved' where id='11111111-1111-1111-1111-111111111111';
insert into public.students(id,full_name,class,arm,admission_no,status) values
  ('d6000000-0000-4000-8000-000000000001','Fee Kid','SS 2','A','F/1','active');
insert into public.academic_periods(term,session,is_current) values ('Second Term','2025/2026',true);
insert into public.class_fee_structure(class,session,term,tuition,exam_fee,development,other_fee,discount,active)
  values('SS 2','2025/2026','Second Term',40000,5000,5000,0,0,true);
`);
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
const SID='d6000000-0000-4000-8000-000000000001';
const snap = async (tag) => {
  const acct = (await db.query(`select public.sc_fee_account($1) a`, [SID])).rows[0].a;
  const st   = (await db.query(`select public.sc_student_fee_state($1) s`, [SID])).rows[0].s;
  const ovr  = (await db.query(`select public.sc_fee_overview(null,null,null) o`)).rows[0].o;
  console.log(tag.padEnd(16),
    '| acct bill=' + acct.bill, 'paid=' + acct.paid, 'due=' + acct.total_due,
    '| state bill=' + st.bill, 'paid=' + st.paid, 'due=' + st.total_due,
    '| overview collected=' + ovr.collected, 'outstanding=' + ovr.outstanding);
  return { acct, st, ovr };
};
const pay = async (amt) => db.query(
  `insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date)
   values($1,'Fee Kid',$2,50000,'Second Term','2025/2026','cash',current_date)`,[SID, amt]);

const a = await snap('before paying');
await pay(20000); const b = await snap('after ₦20,000');
await pay(15000); const c = await snap('after ₦15,000');

const fails = [];
if (!(b.ovr.collected > a.ovr.collected)) fails.push('paid did not rise after a payment');
if (!(b.ovr.outstanding < a.ovr.outstanding)) fails.push('OUTSTANDING DID NOT FALL after a payment (the reported bug)');
if (!(c.ovr.outstanding < b.ovr.outstanding)) fails.push('outstanding did not fall on the second payment');
if (b.acct.total_due !== b.st.total_due) fails.push('fees page (' + b.acct.total_due + ') and parent panel (' + b.st.total_due + ') disagree');
if (b.acct.paid !== b.st.paid) fails.push('paid disagrees between fees page and parent panel');
const rowSum = (await db.query(`select coalesce(sum(amount_paid),0)::numeric s from public.fee_payments`)).rows[0].s;
if (Number(rowSum) !== Number(c.ovr.collected)) fails.push('overview collected (' + c.ovr.collected + ') != sum of receipts (' + rowSum + ')');
console.log(fails.length ? '\nFAIL:\n - ' + fails.join('\n - ') : '\nPASS — every surface agrees and outstanding falls as money arrives.');
process.exit(fails.length ? 1 : 0);

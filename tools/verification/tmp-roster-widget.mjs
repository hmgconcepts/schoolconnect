/* Item #5: the widget (sc_fee_overview) and the Fees page (sc_fee_roster)
   must return IDENTICAL aggregates, and the breakdown must reconcile. */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const db = await PGlite.create();
await db.exec(fs.readFileSync(HERE + 'pglite-boot.sql', 'utf8'));
await db.exec(fs.readFileSync(process.env.SC_SCHEMA || (HERE + '../../database/complete-schema.sql'), 'utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('app.uid',true),'')::uuid $f$;`);
await db.exec(`
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','a@x.com') on conflict do nothing;
update public.profiles set role='admin',status='approved' where id='11111111-1111-1111-1111-111111111111';
insert into public.students(id,full_name,class,arm,admission_no,status) values
 ('d7000000-0000-4000-8000-000000000001','A','SS 2','A','A/1','active'),
 ('d7000000-0000-4000-8000-000000000002','B','SS 2','A','A/2','active'),
 ('d7000000-0000-4000-8000-000000000003','C','JSS 1','A','A/3','active');
insert into public.academic_periods(term,session,is_current) values ('First Term','2025/2026',false),('Second Term','2025/2026',true);
insert into public.class_fee_structure(class,session,term,tuition,exam_fee,development,other_fee,discount,active)
 values('SS 2','2025/2026','Second Term',40000,5000,5000,0,0,true),
       ('SS 2','2025/2026','First Term',40000,5000,5000,0,0,true),
       ('JSS 1','2025/2026','Second Term',30000,5000,5000,0,0,true);
insert into public.fee_payments(student_id,student_name,amount_paid,fee_total,term,session,method,payment_date) values
 ('d7000000-0000-4000-8000-000000000001','A',30000,50000,'Second Term','2025/2026','cash',current_date),
 ('d7000000-0000-4000-8000-000000000001','A',10000,50000,'First Term','2025/2026','cash',current_date),
 ('d7000000-0000-4000-8000-000000000003','C',40000,40000,'Second Term','2025/2026','cash',current_date);
`);
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);
const q = async (sql) => (await db.query(sql)).rows[0];
const ov = (await q(`select public.sc_fee_overview(null,null,null) o`)).o;
const ro = (await q(`select public.sc_fee_roster(null,null,null,'all') o`)).o;

const keys = ['billed','aid','net_bill','collected','outstanding','arrears','students','fully_paid','debtors','partial','collection_rate'];
const diff = keys.filter(k => String(ov[k]) !== String(ro[k]));
console.log('widget vs fees page:', diff.length ? 'MISMATCH on ' + diff.join(', ') : 'IDENTICAL on all ' + keys.length + ' figures');
let sum = 0;
for (const b of ov.breakdown) sum += Number(b.amount);
const ok = Math.abs(sum - Number(ov.outstanding)) < 0.01;
console.log('breakdown lines sum to outstanding:', sum, 'vs', ov.outstanding, ok ? 'PASS' : 'FAIL');
console.log('lines:', ov.breakdown.map(b => b.item + '=' + b.amount).join(' | '));
console.log('net_bill check:', (Number(ov.billed) - Number(ov.aid)) === Number(ov.net_bill) ? 'PASS' : 'FAIL');
process.exit(diff.length || !ok ? 1 : 0);

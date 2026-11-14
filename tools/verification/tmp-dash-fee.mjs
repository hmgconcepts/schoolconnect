/* V12.68 — reproduce EXACTLY what the dashboard does, as each role that can see
   the fee card, and print the raw error instead of hiding it behind UI text. */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { schemaText } from './schema-loader.mjs';
const H = new URL('.', import.meta.url).pathname;
const S = p => schemaText(H + '../../database/' + p);

const db = await PGlite.create();
await db.exec(fs.readFileSync(H + 'pglite-boot.sql', 'utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('sc.uid', true),'')::uuid $$;`);
/* --- EXACTLY the live starting point the user has: a real Supabase project.
       auth.uid() is the shipped one (reads the JWT request settings), NOT our
       test shim, because our shim could mask a defect that only appears with
       the real function. --- */
const liveUid = `create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')
  )::uuid
$fn$;`;
await db.exec(liveUid);
await db.exec(S('complete-schema.sql'));

const ADM = '11111111-1111-1111-1111-111111111111';
const PAR = '22222222-2222-2222-2222-222222222222';
const STU = '33333333-3333-3333-3333-333333333333';
const STUREC = 'aaaaaaaa-1111-1111-1111-111111111111';

await db.exec(`
  insert into auth.users(id,email) values
    ('${ADM}','a@x.t'),('${PAR}','p@x.t'),('${STU}','s@x.t') on conflict do nothing;
  insert into profiles(id,full_name,role,status) values
    ('${ADM}','Admin','admin','approved'),
    ('${PAR}','Parent','parent','approved'),
    ('${STU}','Afolabi Lekan','student','approved') on conflict(id) do nothing;
  insert into students(id,full_name,class,admission_no,status,user_id) values
    ('${STUREC}','Afolabi Lekan','SS 2','A/1','active','${STU}');
  insert into parent_child(parent_id,student_id) values ('${PAR}','${STUREC}') on conflict do nothing;
  insert into class_fee_structure(class,term,session,total,tuition,exam_fee,development,active)
    values('SS 2','First Term','2026/2027',35100,27000,3000,5100,true);
  insert into academic_periods(session,term,starts_on,ends_on,is_current)
    values('2026/2027','First Term','2026-09-14','2026-12-11',true) on conflict do nothing;
  insert into fee_payments(student_id,student_name,amount_paid,method,term,session,payment_date)
    values('${STUREC}','Afolabi Lekan',10000,'cash','First Term','2026/2027','2026-10-31');
`);

const who = [['admin', ADM], ['parent', PAR], ['student', STU], ['anon (no jwt)', '']];
for (const [label, uid] of who) {
  /* act as that user the way PostgREST does: the JWT subject, plus the role */
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);`);
  await db.exec(`select set_config('role','authenticated',false);`);
  for (const [fn, args] of [['sc_student_fee_state', `'${STUREC}'`],
                            ['sc_fee_bill_v2', `'${STUREC}',null,null`]]) {
    try {
      const r = (await db.query(`select public.${fn}(${args}) as r`)).rows[0].r;
      const o = typeof r === 'string' ? JSON.parse(r) : r;
      const bad = o && o.ok === false;
      console.log(`  ${label.padEnd(15)} ${fn.padEnd(22)} ${bad ? 'ok=false  ERROR: ' + o.error : 'ok  bill=' + o.bill + ' paid=' + o.paid + ' arrears=' + o.arrears + ' total=' + o.total_due}`);
    } catch (e) {
      console.log(`  ${label.padEnd(15)} ${fn.padEnd(22)} THREW: ${e.message.split('\n')[0]}`);
    }
  }
}
await db.close();

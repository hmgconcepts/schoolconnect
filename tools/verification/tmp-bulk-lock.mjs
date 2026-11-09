/* Item #3 verification: select-many → one-click block, at scale.
   Seeds 1200 students, exercises sc_set_student_locks with 500-id batches
   (the same batching the UI uses) and asserts every row really changed. */
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
update public.profiles set role='admin', status='approved' where id='11111111-1111-1111-1111-111111111111';
`)
await db.exec(`set app.uid='11111111-1111-1111-1111-111111111111'`);

// 1200 students
const N = 1200;
const vals = [];
for (let i = 0; i < N; i++) {
  vals.push(`('d5000000-0000-4000-8000-${String(i).padStart(12, '0')}','Student ${i}','JSS 1','A','ADM/${String(i).padStart(4, '0')}','active')`);
}
for (let i = 0; i < vals.length; i += 200) {
  await db.exec(`insert into public.students(id,full_name,class,arm,admission_no,status) values ${vals.slice(i, i + 200).join(',')}`);
}
const total = (await db.query(`select count(*)::int c from public.students`)).rows[0].c;
console.log('seeded students:', total);

// what the UI's "select all N" fetch would return
const ids = (await db.query(`select id from public.students`)).rows.map(r => r.id);
console.log('bulkSelectAllMatching would select:', ids.length);
if (ids.length !== N) { console.log('FAIL: selection count mismatch'); process.exit(1); }

// batch exactly like CRUD.bulkStudentLock does
const BATCH = 500;
let updated = 0;
for (let i = 0; i < ids.length; i += BATCH) {
  const chunk = ids.slice(i, i + BATCH);
  const r = (await db.query(`select public.sc_set_student_locks($1::uuid[], 'portal', true, 'Fees') as r`, [chunk])).rows[0].r;
  if (r && r.ok === false) { console.log('FAIL rpc:', r.error); process.exit(1); }
  updated += Number(r.updated || 0);
}
console.log('rpc chunks updated:', updated);
const locked = (await db.query(`select count(*)::int c from public.students where portal_locked = true`)).rows[0].c;
console.log('students actually blocked:', locked, locked === N ? 'PASS' : 'FAIL');

// and unblock in one pass
const r2 = (await db.query(`select public.sc_set_student_locks_by_filter('portal', false, null, null, false, null, null, null) as r`)).rows[0].r;
const left = (await db.query(`select count(*)::int c from public.students where portal_locked = true`)).rows[0].c;
console.log('by_filter unlock ->', JSON.stringify(r2), '| still blocked:', left, left === 0 ? 'PASS' : 'FAIL');

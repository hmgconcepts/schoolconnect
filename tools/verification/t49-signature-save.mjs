/* V12.79 (round 23, item 1) — "SAVE THIS SIGNATURE" MUST SAVE
   ---------------------------------------------------------------------------
   The report: a tutor draws on the pad, presses ☁️ Save this signature, and gets
     "Upload failed: new row violates row-level security policy …"
   Root cause: the page uploaded into the **branding** bucket, and that bucket's
   INSERT policy is `public.is_admin(auth.uid())`. A teacher is not an admin, so
   every drawn signature was refused by the database — the message then blamed a
   missing bucket, which was never the problem.

   This suite proves the whole path in Postgres itself:
     1. the old route really is refused for a teacher (the bug, reproduced);
     2. the new `signatures` bucket accepts a teacher's OWN folder and nothing else;
     3. the bucket is publicly readable, so a report card can print the image;
     4. sc_signature_save() stores a drawn PNG (a data URL) as well as a link,
        refuses an absurd one with a human message, and stamps the profile;
     5. a signed-out visitor cannot call it at all.
   Run: node tools/verification/t49-signature-save.mjs
   ========================================================================== */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { schemaText } from './schema-loader.mjs';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
const q = async (s, p) => (await db.query(s, p)).rows;
const j = v => JSON.parse(JSON.stringify(v));
const HERE = new URL('.', import.meta.url).pathname;
async function refuses(sql, params) {
  try { await db.query(sql, params); return null; } catch (e) { return e.message || String(e); }
}

await db.exec(readFileSync(HERE + 'pglite-boot.sql', 'utf8'));
try { await db.exec(schemaText(HERE + '../../database/complete-schema.sql')); }
catch (e) { console.log('SCHEMA FAILED', e.message); process.exit(1); }

/* The local stub tables are plain tables; on Supabase they carry RLS. Turn it on
   so the policies this pack installs are actually exercised. */
await db.exec(`
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.objects to anon;
  grant usage on schema storage to anon, authenticated;
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  insert into auth.users(id,email) values
    ('55555555-5555-5555-5555-555555555555','tutor@x.test'),
    ('66666666-6666-6666-6666-666666666666','other@x.test') on conflict do nothing;
  insert into public.profiles(id,email,full_name,role,status) values
    ('55555555-5555-5555-5555-555555555555','tutor@x.test','Mr Bello','teacher','approved'),
    ('66666666-6666-6666-6666-666666666666','other@x.test','Mrs Ade','teacher','approved')
  on conflict (id) do update set role='teacher', status='approved', full_name=excluded.full_name;
`);
const TUTOR = '55555555-5555-5555-5555-555555555555';
const OTHER = '66666666-6666-6666-6666-666666666666';
const asUser = async (id) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${id}',false)`);
  await db.exec('set role authenticated');
};
const asAnon = async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
  await db.exec('set role anon');
};

/* ------------------------------------------------------------- 1. the bug --- */
console.log('\n=== 1. the route that failed, and why ===');
await asUser(TUTOR);
const oldWay = await refuses(
  `insert into storage.objects(bucket_id,name,owner) values ('branding',$1,$2)`,
  ['signatures/teacher-' + TUTOR + '-123.png', TUTOR]);
ok(!!oldWay && /row-level security/i.test(oldWay),
   'a TEACHER writing into the branding bucket is refused by RLS — the reported error, reproduced', oldWay);

/* ----------------------------------------------------- 2. the new bucket --- */
console.log('\n=== 2. the signatures bucket accepts the tutor, and only their own folder ===');
const mine = await refuses(`insert into storage.objects(bucket_id,name,owner) values ('signatures',$1,$2)`,
  [TUTOR + '/sig-1.png', TUTOR]);
ok(mine === null, 'the tutor may write their own folder', mine);
const theirs = await refuses(`insert into storage.objects(bucket_id,name,owner) values ('signatures',$1,$2)`,
  [OTHER + '/sig-2.png', TUTOR]);
ok(!!theirs && /row-level security/i.test(theirs), 'and may NOT write somebody else\'s folder', theirs);
/* 'archives' is a bucket whose only write policy needs is_owner(): a plain tutor
   must not get in through the signature policy. */
const wrongBucket = await refuses(`insert into storage.objects(bucket_id,name,owner) values ('archives',$1,$2)`,
  [TUTOR + '/sig-3.png', TUTOR]);
ok(!!wrongBucket && /row-level security/i.test(wrongBucket),
   'nor into a bucket whose own policy excludes them (archives)', wrongBucket);

/* ------------------------------------------------------ 3. public reading --- */
console.log('\n=== 3. the school can print it ===');
await asAnon();
let pub = [];
try { pub = j(await q(`select name from storage.objects where bucket_id='signatures'`)); }
catch (e) { ok(false, 'the school can read a signature image', e.message); }
ok(pub.length === 1 && pub[0].name === TUTOR + '/sig-1.png', 'a signed-out visitor can READ a signature image (report cards need that)', pub);

/* --------------------------------------------------- 4. the save function --- */
console.log('\n=== 4. sc_signature_save() ===');
await asUser(TUTOR);
const png = 'data:image/png;base64,' + 'A'.repeat(30000);          // ≈ 30 KB drawn signature
const savedData = j(await q(`select public.sc_signature_save($1::text,'Mr Bello'::text) r`, [png]))[0].r;
ok(savedData.ok === true, 'a drawn PNG (data URL) saves', savedData);
await db.exec('reset role');    /* read the row as the owner: RLS hides it from the caller */
const prof = j(await q(`select signature_url, signature_name, signature_updated_at is not null as stamped from public.profiles where id=$1`, [TUTOR]))[0];
ok(String(prof.signature_url).startsWith('data:image/png;base64,'), 'and lands on the tutor\'s own profile', String(prof.signature_url).slice(0, 30));
ok(prof.signature_name === 'Mr Bello' && prof.stamped === true, 'with the name and a timestamp', prof);

await asUser(TUTOR);
const link = j(await q(`select public.sc_signature_save($1::text,'Mr Bello'::text) r`, ['https://school.test/storage/v1/object/public/signatures/x.png']))[0].r;
ok(link.ok === true, 'an ordinary https link still saves');
await asUser(TUTOR);
const huge = j(await q(`select public.sc_signature_save($1::text,''::text) r`, ['data:image/png;base64,' + 'A'.repeat(420000)]))[0].r;
ok(huge.ok === false && /too large/i.test(huge.error), 'an absurd image is refused in words a teacher can act on', huge.error);
await asUser(TUTOR);
const longLink = j(await q(`select public.sc_signature_save($1::text,''::text) r`, ['https://x.test/' + 'y'.repeat(3000)]))[0].r;
ok(longLink.ok === false && /too long/i.test(longLink.error), 'a 3,000-character link is still refused', longLink.error);

/* the other tutor's profile is untouched */
await db.exec('reset role');
const untouched = j(await q(`select coalesce(signature_url,'') u from public.profiles where id=$1`, [OTHER]))[0].u;
ok(untouched === '', 'saving my signature never touches anyone else\'s profile', untouched);

/* ------------------------------------------------------------- 5. the door -- */
console.log('\n=== 5. a signed-out visitor ===');
await asAnon();
const anonCall = await refuses(`select public.sc_signature_save('data:image/png;base64,AAA','x')`);
ok(!!anonCall, 'cannot call sc_signature_save at all', anonCall);

if (fail) { console.error(`\nSIGNATURE FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nSIGNATURE OK — ${pass} passed, 0 failed · a tutor's drawn signature saves, and only their own.`);

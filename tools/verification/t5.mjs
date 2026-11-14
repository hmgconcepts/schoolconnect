import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const {schemaText}=await import('./schema-loader.mjs');
const db=await PGlite.create();
const H=new URL('.', import.meta.url).pathname;
await db.exec(fs.readFileSync(H+'pglite-boot.sql','utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H+'../../database/complete-schema.sql'));
const q=async s=>(await db.query(s)).rows;
const ADM='11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
 insert into profiles(id,full_name,role,status) values('${ADM}','B','admin','approved') on conflict(id) do update set role='admin',status='approved';`);
// a probe trigger that records what the trigger context can see
await db.exec(`create table probe_log(u text, depth int);
create or replace function probe_fn() returns trigger language plpgsql security definer as $$
begin insert into probe_log values (coalesce(auth.uid()::text,'NULL'), pg_trigger_depth()); return new; end $$;
create trigger probe_trg after update on profiles for each row execute function probe_fn();`);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ADM]);
await db.exec(`update profiles set full_name='B2' where id='${ADM}'`);
console.log('inside trigger, auth.uid() =', JSON.stringify(await q('select * from probe_log')));

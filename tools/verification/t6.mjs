import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const {schemaText}=await import('./schema-loader.mjs');
const db=await PGlite.create();
const H=new URL('.', import.meta.url).pathname;
await db.exec(fs.readFileSync(H+'pglite-boot.sql','utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H+'../../database/complete-schema.sql'));
const q=async s=>(await db.query(s)).rows;
const one=async s=>(await q(s))[0];
const ADM='11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
 insert into profiles(id,full_name,role,status) values('${ADM}','B','admin','approved') on conflict(id) do update set role='admin',status='approved';`);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ADM]);

// what does a SECURITY DEFINER function see, called FROM a SECURITY DEFINER trigger?
await db.exec(`create table probe_log2(tag text, u text, depth int, staff text);
create or replace function inner_probe() returns void language plpgsql security definer as $$
begin insert into probe_log2 values('inner', coalesce(auth.uid()::text,'NULL'), pg_trigger_depth(), coalesce(public.is_staff(auth.uid())::text,'NULL')); end $$;
create or replace function outer_trg() returns trigger language plpgsql security definer as $$
begin insert into probe_log2 values('outer-trigger', coalesce(auth.uid()::text,'NULL'), pg_trigger_depth(), coalesce(public.is_staff(auth.uid())::text,'NULL'));
      perform inner_probe(); return new; end $$;
create trigger probe_trg2 after update on profiles for each row execute function outer_trg();`);
await db.exec(`update profiles set full_name='B3' where id='${ADM}'`);
console.log(JSON.stringify(await q('select * from probe_log2'), null, 1));

/* Reproduce: which fee RPC needs school_settings.currency, and what happens when
   the column is genuinely absent (a database installed from the historical
   pack sequence, or one whose school_settings predates the column). */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { schemaText } from './schema-loader.mjs';
const H = new URL('.', import.meta.url).pathname;
const db = await PGlite.create();
await db.exec(fs.readFileSync(H + 'pglite-boot.sql', 'utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H + '../../database/complete-schema.sql'));
const q = async s => (await db.query(s)).rows;
const ADM='11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users(id,email) values('${ADM}','a@x.t') on conflict do nothing;
 insert into profiles(id,full_name,role,status) values('${ADM}','A','admin','approved') on conflict(id) do nothing;
 select set_config('request.jwt.claim.sub','${ADM}',false);`);

console.log('\n=== where is currency read in the shipped functions? ===');
const rows = await q(`select p.proname, pg_get_functiondef(p.oid) def
                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and pg_get_functiondef(p.oid) ilike '%school_settings%'`);
for (const r of rows) {
  const refs = [...r.def.matchAll(/from\s+(?:public\.)?school_settings([^;]{0,80})/gi)].map(m => m[0].replace(/\s+/g,' '));
  const bad = refs.filter(x => /\)\s*\)?\s*(?:limit 1)?\s*$/i.test(x) || !/currency/i.test(x));
  console.log(' ', r.proname.padEnd(28), refs.length ? refs.join(' | ').slice(0,110) : '(references table, no select found)');
}
console.log('\n=== functions that select currency ___.currency FROM school_settings ===');
const hard = rows.filter(r => /select\s+([a-z_]+\.)?currency\s+from\s+(public\.)?school_settings/i.test(r.def)).map(r=>r.proname);
console.log('  ' + (hard.join(', ') || 'none'));
await db.close();

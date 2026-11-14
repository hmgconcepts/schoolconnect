/* If a school applies v12.67 but not v12.68, every fee RPC throws 42883 —
   and the dashboard reports that as "run database/v9.4". */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { schemaText } from './schema-loader.mjs';
const H = new URL('.', import.meta.url).pathname;
const db = await PGlite.create();
await db.exec(fs.readFileSync(H + 'pglite-boot.sql', 'utf8'));
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;`);
await db.exec(schemaText(H + '../../database/v12.67-fee-invoice-truth.sql'));
const q = async s => (await db.query(s)).rows;
const has = async n => (await q(`select count(*) c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${n}'`))[0].c;
console.log('sc_term_resolve present after v12.67 alone :', await has('sc_term_resolve'));
console.log('sc_fee_ledger_for present                 :', await has('sc_fee_ledger_for'));
try {
  await q(`select public.sc_fee_ledger_for(gen_random_uuid(), null, null)`);
} catch (e) { console.log('calling it ->', e.message.split('\n')[0]); }
await db.close();

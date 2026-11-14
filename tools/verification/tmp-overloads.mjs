import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { schemaText } from '/home/user/repos/schoolconnect/tools/verification/schema-loader.mjs';
const H = '/home/user/repos/schoolconnect/tools/verification/';
const db = await PGlite.create();
await db.exec(fs.readFileSync(H+'pglite-boot.sql','utf8'));
await db.exec(schemaText('/home/user/repos/schoolconnect/database/complete-schema.sql'));
const q = async s => (await db.query(s)).rows;
const rows = await q(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         (select count(*) from pg_proc q2 join pg_namespace n2 on n2.oid=q2.pronamespace
           where n2.nspname='public' and q2.proname=p.proname) as overloads
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('sc_student_fee_state','sc_fee_ledger_for','sc_fee_bill_v2','sc_fee_bill_for',
                       'sc_fee_overview','sc_fee_page_rows','sc_fee_account','sc_fee_truth_sheet',
                       'sc_fee_explain','sc_fee_bill_audit','sc_term_resolve','sc_fee_prior_terms')
   order by p.proname, args`);
let cur='';
for (const r of rows){
  if (r.proname!==cur){ cur=r.proname; console.log('\n'+cur+(Number(r.overloads)>1?'   <-- '+r.overloads+' OVERLOADS':'')); }
  console.log('   ', r.args);
}
await db.close();

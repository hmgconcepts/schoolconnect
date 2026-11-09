import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
export async function makeDb(schemaPath='database/complete-schema.sql'){
  let sql = fs.readFileSync(schemaPath,'utf8').replace(/create extension[^;]*;/gi,'select 1;');
  const db = await PGlite.create();
  await db.exec(fs.readFileSync('pglite-boot.sql','utf8'));
  try { await db.exec(sql); return {db, err:null}; }
  catch(e){ return {db, err:String(e.message)}; }
}
if (process.argv[1].endsWith('tmp-harness.mjs')){
  const {err} = await makeDb(process.argv[2]||'database/complete-schema.sql');
  console.log(err? 'ERR: '+err.slice(0,300) : 'FULL SCHEMA OK (pglite)');
}

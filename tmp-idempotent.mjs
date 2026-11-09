import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = await PGlite.create();
await db.exec(fs.readFileSync('pglite-boot.sql','utf8'));
const schema = fs.readFileSync('database/complete-schema.sql','utf8').replace(/create extension[^;]*;/gi,'select 1;');
await db.exec(schema);
await db.exec(schema);   // full re-run must not fail
console.log('SCHEMA RUNS TWICE: OK');
const pack = fs.readFileSync('database/v12.60-expert-fix-pack.sql','utf8');
await db.exec(pack); await db.exec(pack);
console.log('FIX PACK RUNS TWICE: OK');
const r = await db.query("select key from public.sc_install_state where key like 'v12.60%' order by key");
console.log('install markers:', r.rows.map(x=>x.key));

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
let sql = fs.readFileSync('database/complete-schema.sql','utf8').replace(/create extension[^;]*;/gi,'select 1;');
const db = await PGlite.create();
await db.exec(fs.readFileSync('pglite-boot.sql','utf8'));
await db.exec(sql);
console.log('base schema ok');
try { await db.exec(fs.readFileSync('database/v12.60-expert-fix-pack.sql','utf8')); console.log('PACK OK'); }
catch(e){ console.log('PACK ERR:', String(e.message).slice(0,400)); }

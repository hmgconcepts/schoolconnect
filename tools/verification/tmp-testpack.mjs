import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const BOOT = HERE + 'pglite-boot.sql';
let sql = fs.readFileSync(process.env.SC_SCHEMA || (HERE + '../../database/complete-schema.sql'),'utf8');
const db = await PGlite.create();
await db.exec(fs.readFileSync(BOOT,'utf8'));
await db.exec(sql);
console.log('base schema ok');
try { await db.exec(fs.readFileSync(HERE + '../../database/v12.60-expert-fix-pack.sql','utf8')); console.log('PACK OK'); }
catch(e){ console.log('PACK ERR:', String(e.message).slice(0,400)); }

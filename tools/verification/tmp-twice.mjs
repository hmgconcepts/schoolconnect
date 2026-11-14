import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const HERE = '/home/user/repos/schoolconnect/tools/verification/';
const boot = fs.readFileSync(HERE+'pglite-boot.sql','utf8');
const sql  = fs.readFileSync(process.argv[2],'utf8');
const db = await PGlite.create();
await db.exec(boot);
try { await db.exec(sql); console.log('run 1: OK'); } catch(e){ console.log('run 1 FAIL:', String(e.message).slice(0,300)); process.exit(0);}
try { await db.exec(sql); console.log('run 2: OK  (idempotent)'); }
catch(e){ console.log('run 2 FAIL:', String(e.message).slice(0,600)); }

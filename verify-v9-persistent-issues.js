#!/usr/bin/env node
const fs = require('fs');
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
let pass = 0, fail = 0;
function ok(name, cond){ console.log((cond ? 'OK  - ' : 'FAIL- ') + name); cond ? pass++ : fail++; }

const complete = read('database/complete-schema.sql');
const schema = read('database/schema.sql');
const crud = read('assets/js/crud.js');
const report = read('assets/js/report-engine.js');
const cbtExam = read('cbt-exam.html');
const rcPage = read('report-cards.html');

ok('complete-schema fixes inline member_id comment blocker',
  /alter table public\.profiles add column if not exists member_id text; exception when others then null; end \$\$;/.test(complete) &&
  !/member_id text;\s*-- auto ID/.test(complete));

ok('payment_intents policy allows student self-read',
  /create policy "pi_read"\s+on public\.payment_intents[\s\S]*?student_id in \(select id from public\.students where user_id = auth\.uid\(\)\)/.test(schema + complete));

ok('payments_online CRUD definition exists',
  /payments_online: \{ table:'payment_intents'/.test(crud));

ok('report engine family filter is strict to student identity',
  /const sid = String\(row\.student_id \|\| ''\)\.toLowerCase\(\)/.test(report) &&
  /scope\.studentIds/.test(report) && !/scope\.classes\.includes/.test((report.match(/allowRowForScope\([\s\S]*?\},/ )||[''])[0]));

ok('cbt exam page uses breakdown + _orig_index fallback for subject tabs',
  /subject_breakdown/.test(cbtExam) && /_orig_index/.test(cbtExam) && /return b\.name \|\| 'General'/.test(cbtExam));

ok('report-cards page dropdowns have fallback population sources',
  /sb\.from\('results'\)\.select\('class,subject,term,session'\)/.test(rcPage) &&
  /sb\.from\('assessment_columns'\)\.select\('class,subject,term,session'\)/.test(rcPage) &&
  /sb\.from\('students'\)\.select\('class'\)/.test(rcPage));

ok('report-cards sample links use generated-root files',
  /href="sample-report-card\.html"/.test(rcPage) && /href="sample-e-receipt\.html"/.test(rcPage));

console.log(`\nV9 persistent-issue verification: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

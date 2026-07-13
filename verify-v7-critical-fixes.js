#!/usr/bin/env node
const fs = require('fs');
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
let pass = 0, fail = 0;
function ok(name, cond){ console.log((cond ? 'OK  - ' : 'FAIL- ') + name); cond ? pass++ : fail++; }

const complete = read('database/complete-schema.sql');
const reportcard = read('database/reportcard-schema.sql');
const notif = read('assets/js/notifications.js');
const report = read('assets/js/report-engine.js');
const cbtEngine = read('assets/js/cbt-engine.js');
const cbtMulti = read('cbt-multi.html');
const cbtExam = read('cbt-exam.html');
const generator = read('assets/js/generator.js') || read('generator.js');

ok('complete-schema wraps report_subject_totals security_invoker in a DO block',
  /do \$\$ begin\s+execute 'alter view public\.report_subject_totals set \(security_invoker = true\)';\s+exception when others then\s+raise notice/s.test(complete));

ok('reportcard-schema wraps report_subject_totals security_invoker in a DO block',
  /do \$\$ begin\s+execute 'alter view public\.report_subject_totals set \(security_invoker = true\)';\s+exception when others then\s+raise notice/s.test(reportcard));

ok('notifications page renderer exists', /async renderPageList\(/.test(notif) && /notif-page-list/.test(notif));
ok('notifications refresh also updates page renderer', /await this\.renderPageList\(items, user\?\.id \|\| ''\)/.test(notif));
ok('report engine applies family-safe scope helpers', /async roleScope\(/.test(report) && /allowRowForScope\(/.test(report));
ok('report engine filters base rows for family scope', /const baseRows = \(scope\.family \? \(rows \|\| \[\]\)\.filter\(r => familyFilter\(r\)\)/.test(report));
ok('CBT engine has subject_breakdown recovery and alternate key fallback', /subject_breakdown/.test(cbtEngine) && /raw\.section \|\| raw\.subject \|\| raw\.subject_section \|\| raw\.exam_subject/.test(cbtEngine));
ok('multi-subject builder persists subject list metadata', /anti_cheat_config: \{ subject_breakdown, subjects, multi_subject: true \}/.test(cbtMulti));
ok('student exam page contains subject-tab renderer', /renderTabs=function/.test(cbtExam) && /cbt-subject-tabs/.test(cbtExam));
ok('generator still exposes modern SaaS scaffold files', /addModernScaffold/.test(generator) && /modern\/app\/api\/tenant\/route\.js/.test(generator) && /tenant-schema\.sql/.test(generator));

console.log(`\nV7 critical-fix verification: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

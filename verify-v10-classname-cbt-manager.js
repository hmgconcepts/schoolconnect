#!/usr/bin/env node
const fs = require('fs');
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
let pass = 0, fail = 0;
function ok(name, cond){ console.log((cond ? 'OK  - ' : 'FAIL- ') + name); cond ? pass++ : fail++; }

const complete = read('database/complete-schema.sql');
const upd1 = read('database/update-v1-schema.sql');
const crud = read('assets/js/crud.js');
const report = read('assets/js/report-engine.js');
const cbt = read('cbt.html');
const notif = read('assets/js/notifications.js');

ok('SQL no longer references students.class_name', !/s\.class_name/.test(complete + upd1));
ok('CRUD no longer selects class_name from students table', !/select\('id,full_name,class,class_name/.test(crud));
ok('report engine no longer selects class_name from students table', !/select\('id,full_name,class,class_name/.test(report));
ok('CBT manager has search/class/subject/teacher/mode/group filters', /cbt-f-q/.test(cbt) && /cbt-f-class/.test(cbt) && /cbt-f-subject/.test(cbt) && /cbt-f-teacher/.test(cbt) && /cbt-f-mode/.test(cbt) && /cbt-f-group/.test(cbt));
ok('CBT manager groups open/registered and ordinary/multi exams', /Anonymous \/ Open Exams/.test(cbt) && /Registered Exams/.test(cbt) && /Ordinary CBT/.test(cbt) && /Multi-Subject \/ UTME/.test(cbt));
ok('notifications suppress same-tab flashing push and use in-app toast', /document\.visibilityState !== 'visible'/.test(notif) && /showInApp\(title \|\| 'Notification'/.test(notif));

console.log(`\nV10 classname/cbt-manager verification: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

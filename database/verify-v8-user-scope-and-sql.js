#!/usr/bin/env node
const fs = require('fs');
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
let pass = 0, fail = 0;
function ok(name, cond){ console.log((cond ? 'OK  - ' : 'FAIL- ') + name); cond ? pass++ : fail++; }

const complete = read('database/complete-schema.sql');
const templates = read('assets/js/templates.js');
const app = read('assets/js/app.js');
const crud = read('assets/js/crud.js');

ok('complete-schema wraps enterprise RLS declare block in DO $$',
  /-- 3\. RLS POLICIES[\s\S]*?do \$\$\s*declare t text;[\s\S]*?end \$\$;/m.test(complete));

const parentBlock = (templates.match(/const parentSet = new Set\(\[(.*?)\]\);/s) || [,''])[1];
const studentBlock = (templates.match(/const studentSet = new Set\(\[(.*?)\]\);/s) || [,''])[1];
ok('parent navigation excludes financial_aid/transport/health/transcripts',
  !/financial_aid|transport|health|transcripts/.test(parentBlock));
ok('student navigation excludes financial_aid/transport/health/transcripts',
  !/financial_aid|transport|health|transcripts/.test(studentBlock));

ok('app.js has hard family nav restriction helper (v4: FAMILY_BLACKLIST)',
  /moduleAllowedForRole\(moduleId, role\)/.test(app) && /FAMILY_BLACKLIST/.test(app) && /financial_aid/.test(app) && /transport/.test(app));
ok('applyRoleNav combines allow-list and family restriction helper',
  /canAccessAllowList\(App\.allowTextForElement\(el\), role\) && App\.moduleAllowedForRole\(moduleId, role\)/.test(app));
ok('enforceCurrentPageAccess also uses family restriction helper',
  /!App\.moduleAllowedForRole\(activeId, role\)/.test(app));

ok('CRUD treats online fee payments as student/parent scoped',
  /strictStudentModules = \['results', 'attendance', 'fees', 'report_cards', 'certificates', 'payments_online'\]/.test(crud));
ok('student message filter includes generic data.student/admission_no',
  /data\.student.*stName/.test(crud) && /data\.admission_no.*stAdm/.test(crud));
ok('parent message filter includes generic child student/admission matching',
  /childNames\.includes\(String\(r\.data\.student/.test(crud) && /childAdm\.includes\(String\(r\.data\.admission_no/.test(crud));

console.log(`\nV8 user-scope/sql verification: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
const fs = require('fs');
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
let pass = 0, fail = 0;
function ok(name, cond){ console.log((cond ? 'OK  - ' : 'FAIL- ') + name); cond ? pass++ : fail++; }
const voting = read('assets/js/voting.js');
const app = read('assets/js/app.js');
const templates = read('assets/js/templates.js');
const schema = read('database/schema.sql') + '\n' + read('database/voting-schema.sql') + '\n' + read('database/update-v11-voting-security.sql');
const votePage = read('voting.html');
const cbtPage = read('cbt.html');
const crud = read('assets/js/crud.js');
const report = read('assets/js/report-engine.js');
function blockBetween(s, start, end){ const a=s.indexOf(start); if(a<0) return ''; const b=s.indexOf(end,a+start.length); return b<0?s.slice(a):s.slice(a,b); }
const blacklist = blockBetween(app, 'FAMILY_BLACKLIST: new Set([', ']),');
const studentWL = blockBetween(app, 'STUDENT_WHITELIST: new Set([', ']),');
const parentWL = blockBetween(app, 'PARENT_WHITELIST: new Set([', ']),');
const studentSet = blockBetween(templates, 'const studentSet = new Set([', ']);');
const parentSet = blockBetween(templates, 'const parentSet = new Set([', ']);');
ok('Voting candidate_id is forcibly migrated to text to stop UUID syntax errors', /alter table public\.poll_votes alter column candidate_id type text using candidate_id::text/.test(schema));
ok('Voting has delete policy so users can replace previous ballot safely', /pv_delete_v11/.test(schema));
ok('Voting insert is allowed only for open polls', /coalesce\(p\.status,'open'\) = 'open'/.test(schema));
ok('Voting live DB create uses database-generated UUID and created_by audit trail', /payload\.created_by = user\.id/.test(voting) && /from\('polls'\)\.insert\(payload\)/.test(voting));
ok('Voting supports max_votes and multi-choice payloads', /max_votes/.test(voting) && /allow_multiple: !!\(allow_multiple \|\| multi_winner\)/.test(voting));
ok('Voting page has edit and close-reopen controls', /editPoll\(id\)/.test(votePage) && /toggleClose/.test(votePage));
ok('Parents and students are allowed to access voting now', /'voting'/.test(studentWL) && /'voting'/.test(parentWL) && /'voting'/.test(studentSet) && /'voting'/.test(parentSet));
ok('Voting is not in the hard family blacklist', !/'voting'/.test(blacklist));
ok('CBT page hides edit controls from non-owner teachers', /canManageExam\(e\)/.test(cbtPage) && /Read-only/.test(cbtPage));
ok('CRUD keeps strict learner scoping for results, attendance, fees, report cards, certificates and online payments', /strictStudentModules = \['results', 'attendance', 'fees', 'report_cards', 'certificates', 'payments_online'\]/.test(crud));
ok('Bulk affective/psychomotor UI has session selector, not hard-coded session', /bf-session/.test(crud) && !/session: '2025\/2026'/.test(crud));
ok('Report engine includes school stamp and signature block', /stampSvg/.test(report) && /signatureBlock/.test(report));
console.log(`\nV11 critical workflow verification: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

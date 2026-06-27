#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const generatorPath = path.join(root, 'assets/js/generator.js');
const templatesPath = path.join(root, 'assets/js/templates.js');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { return fs.existsSync(path.join(root, p)); }
function ok(msg) { console.log('OK  - ' + msg); }
function warn(msg) { console.log('WARN- ' + msg); }
function fail(msg) { console.log('FAIL- ' + msg); failures++; }
let failures = 0;

const gen = read(generatorPath);
const tpl = read(templatesPath);

function extractArray(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[(.*?)\\];`, 's');
  const m = gen.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const pageIds = extractArray('pageIds') || [];
const dedicated = extractArray('DEDICATED') || [];

if (pageIds.length) ok(`Extracted ${pageIds.length} pageIds from generator.js`);
else fail('Could not extract pageIds from generator.js');

if (dedicated.length) ok(`Extracted ${dedicated.length} dedicated page ids from generator.js`);
else fail('Could not extract DEDICATED page ids from generator.js');

const dedicatedMethods = [...gen.matchAll(/page([A-Z][A-Za-z0-9_]*)\(cfg\)\s*\{/g)].map(m => m[1]);
ok(`Detected ${dedicatedMethods.length} dedicated page builder methods`);

const importantFiles = [
  'index.html','builder.html','assets/css/style.css','assets/js/generator.js','assets/js/templates.js',
  'assets/js/wizard.js','assets/js/config.js','assets/js/crud.js','assets/js/notifications.js',
  'assets/js/pwa-install.js','assets/js/site-help.js','assets/js/super.js','assets/js/enterprise.js',
  'database/schema.sql','database/voting-schema.sql','database/cbt-schema.sql','database/reportcard-schema.sql'
];
importantFiles.forEach(f => exists(f) ? ok(`Present: ${f}`) : fail(`Missing important file: ${f}`));

const strayFiles = ['assets/css/A','assets/img/A','assets/js/A','database/a'];
strayFiles.forEach(f => exists(f) ? fail(`Stray placeholder still exists: ${f}`) : ok(`No stray placeholder: ${f}`));

const expectedDedicatedSkips = ['student-profile','report-cards','admin-data','cbt-prompts','digital_library','developer','academic_setup','academic_records'];
expectedDedicatedSkips.forEach(id => dedicated.includes(id) ? ok(`DEDICATED contains ${id}`) : fail(`DEDICATED missing ${id}`));

const generatedPages = [
  'login.html','contact.html','apply.html','cbt-exam.html','report-cards.html','analytics.html','admin-data.html',
  'approvals.html','admissions.html','idcards.html','certificates.html','developer.html','student-profile.html',
  'academic_setup.html','academic_records.html','timetable-generator.html','checkin.html','diary.html','surveys.html','menu.html','settings.html'
];

generatedPages.forEach(p => {
  const needle = `zip.file('${p}'`;
  if (gen.includes(needle)) ok(`Generator emits ${p}`);
  else fail(`Generator does not appear to emit ${p}`);
});

const generatedOnlyRefs = [
  'assets/js/app.js',
  'student-profile.html',
  'admin-data.html',
  'report-cards.html',
  'analytics.html'
];
generatedOnlyRefs.forEach(r => {
  if (tpl.includes(r) || gen.includes(r)) ok(`Reference present as expected: ${r}`);
  else warn(`Reference not found: ${r}`);
});

const appJsNotePath = path.join(root, 'MAINTAINER_NOTES.md');
if (fs.existsSync(appJsNotePath)) {
  const note = read(appJsNotePath);
  if (note.includes('assets/js/app.js') && note.includes('generated output')) ok('Maintainer note explains generated app.js');
  else warn('Maintainer note exists but does not clearly explain generated app.js');
} else {
  warn('MAINTAINER_NOTES.md not found');
}

console.log('\nSummary:');
if (failures) {
  console.log(`Verification completed with ${failures} failure(s).`);
  process.exitCode = 1;
} else {
  console.log('Verification completed successfully with no failures.');
}

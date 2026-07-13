#!/usr/bin/env node
/**
 * verify-generated-output.js — School Connect Gen v8 (rewritten)
 *
 * FIX V-01: the previous version of this script verified the *v7* generator
 * architecture (a `pageIds` array, a `DEDICATED` array and one literal
 * `zip.file('<page>.html'` call per page). Generator v8 emits pages
 * dynamically — dedicatedPages[] entries are written via
 * `zip.file(p.id + '.html', html)` and selected modules via
 * `zip.file(Generator.pageFileName(canonical), html)` — so the old checks
 * produced 31 FALSE failures on a healthy build.
 *
 * This version verifies the v8 pipeline for real:
 *   1. every dedicated page id is present in the dedicatedPages array
 *   2. the dynamic zip.file() emitters exist
 *   3. all shared runtime JS/SQL/CSV assets are bundled
 *   4. templates.js exposes the builders the generator calls
 *   5. no stray placeholder files exist
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const gen = fs.readFileSync(path.join(root, 'assets/js/generator.js'), 'utf8');
const tpl = fs.readFileSync(path.join(root, 'assets/js/templates.js'), 'utf8');

let failures = 0;
function ok(msg) { console.log('OK  - ' + msg); }
function warn(msg) { console.log('WARN- ' + msg); }
function fail(msg) { console.log('FAIL- ' + msg); failures++; }
function exists(p) { return fs.existsSync(path.join(root, p)); }

// ---- 1. Dedicated pages are declared in the dedicatedPages array ----
const dedicatedIds = [
  'student-profile', 'cbt-exam', 'cbt-prompts', 'cbt-multi', 'verify-certificate',
  'teacher-overview', 'feature-guide', 'about', 'contact', 'apply', 'profile',
  'change-password', 'notifications', 'developer', 'voting', 'timetable-generator'
];
dedicatedIds.forEach(id => {
  const re = new RegExp(`id:\\s*'${id}'`);
  if (re.test(gen)) ok(`dedicatedPages declares ${id}`);
  else fail(`dedicatedPages missing ${id}`);
});

// ---- 2. Dynamic page emitters present ----
[
  ["zip.file(p.id + '.html'", 'dedicated page emitter (zip.file(p.id + \'.html\'))'],
  ['zip.file(Generator.pageFileName(canonical)', 'module page emitter (pageFileName)'],
  ["zip.file('index.html'", 'index.html emitter'],
  ["zip.file('login.html'", 'login.html emitter'],
  ["zip.file('dashboard.html'", 'dashboard.html emitter'],
  ["zip.file('offline.html'", 'offline.html emitter'],
  ["zip.file('sw.js'", 'service worker emitter'],
  ["zip.file('manifest.json'", 'manifest emitter'],
  ["zip.file('robots.txt'", 'robots.txt emitter'],
  ["zip.file('sitemap.xml'", 'sitemap.xml emitter'],
  ["zip.file('_headers'", '_headers emitter'],
  ["zip.file('vercel.json'", 'vercel.json emitter'],
  ["zip.file('README.md'", 'README emitter']
].forEach(([needle, label]) => {
  if (gen.includes(needle)) ok(`Generator has ${label}`);
  else fail(`Generator missing ${label}`);
});

// ---- 3. Runtime assets shipped to every generated site ----
const runtimeAssets = [
  'assets/js/app.js', 'assets/js/crud.js', 'assets/js/cbt-engine.js',
  'assets/js/report-engine.js', 'assets/js/notifications.js', 'assets/js/voting.js',
  'assets/js/site-help.js', 'assets/js/super.js', 'assets/js/enterprise.js',
  'assets/js/pwa-install.js', 'assets/js/analytics.js'
];
runtimeAssets.forEach(f => {
  if (gen.includes(`'${f}'`)) ok(`Generator bundles ${f}`);
  else fail(`Generator does not bundle ${f}`);
  if (exists(f)) ok(`Present on disk: ${f}`);
  else fail(`Missing on disk: ${f}`);
});

// ---- 4. SQL + CSV bundling ----
[
  'database/schema.sql', 'database/voting-schema.sql', 'database/cbt-schema.sql',
  'database/reportcard-schema.sql', 'database/enterprise-schema.sql',
  'database/students_import_template.csv', 'database/sample-question-bank.csv'
].forEach(f => {
  if (gen.includes(`'${f}'`)) ok(`Generator bundles ${f}`);
  else fail(`Generator does not bundle ${f}`);
  if (exists(f)) ok(`Present on disk: ${f}`);
  else fail(`Missing on disk: ${f}`);
});

// ---- 5. templates.js exposes the builders generator.js calls ----
['head(config', 'loginPage(', 'dashboard(', 'modulePage(', 'voting(', 'shell('].forEach(sig => {
  if (tpl.includes(sig)) ok(`templates.js exposes T.${sig.replace('(', '')}()`);
  else fail(`templates.js missing T.${sig.replace('(', '')}()`);
});

// ---- 6. Stray placeholder files ----
['assets/css/a', 'assets/css/A', 'assets/img/a', 'assets/img/A', 'assets/js/a',
 'assets/js/A', 'database/a', 'tools/a', 'assets/templates/pages/a'].forEach(f => {
  if (exists(f)) fail(`Stray placeholder still exists: ${f}`);
  else ok(`No stray placeholder: ${f}`);
});

// ---- 7. Regression guards for fixed bugs ----
[
  ["start_url: './index.html'", 'manifest uses relative start_url (sub-path safe)'],
  ["'./offline.html'", 'service worker precaches ./offline.html (relative)'],
  ['generateOfflinePage', 'offline.html generation function present'],
  ['logoData', 'uploaded logo is embedded into the ZIP'],
  ['siteUrl', 'siteUrl flows into SEO files']
].forEach(([needle, label]) => {
  if (gen.includes(needle)) ok(`Regression guard: ${label}`);
  else fail(`Regression guard failed: ${label}`);
});

// duplicate object keys in pageFileName map (the old bug)
const mapMatch = gen.match(/pageFileName\(id\)\s*\{[\s\S]*?return map\[id\]/);
if (mapMatch) {
  const keys = [...mapMatch[0].matchAll(/([A-Za-z_'"-]+)\s*:/g)].map(m => m[1].replace(/['"]/g, ''));
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) fail(`pageFileName map has duplicate keys: ${[...new Set(dupes)].join(', ')}`);
  else ok('pageFileName map has no duplicate keys');
} else {
  warn('Could not locate pageFileName map for duplicate-key check');
}

// ---- 8. Maintainer notes ----
if (exists('MAINTAINER_NOTES.md')) {
  const note = fs.readFileSync(path.join(root, 'MAINTAINER_NOTES.md'), 'utf8');
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

#!/usr/bin/env node
/* Direct background test for multi-subject CBT tab engine. */
const fs = require('fs');
const vm = require('vm');
const page = fs.existsSync('assets/templates/pages/cbt-exam.html') ? fs.readFileSync('assets/templates/pages/cbt-exam.html','utf8') : fs.readFileSync('cbt-exam.html','utf8');
const engine = fs.existsSync('assets/js/cbt-engine.js') ? fs.readFileSync('assets/js/cbt-engine.js','utf8') : '';
const multi = fs.existsSync('assets/templates/pages/cbt-multi.html') ? fs.readFileSync('assets/templates/pages/cbt-multi.html','utf8') : (fs.existsSync('cbt-multi.html') ? fs.readFileSync('cbt-multi.html','utf8') : '');
const start = page.indexOf('// ENTERPRISE V13 / V5: robust UTME-style multi-subject experience.');
const end = page.indexOf('// ENTERPRISE V8: flush any queued', start);
if (start < 0 || end < 0) throw new Error('V5 CBT subject-tab engine not found');
const code = page.slice(start, end);
const sandbox = {
  window: {},
  esc: s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
};
sandbox.window.Exam = {
  idx: 0,
  answers: [null, 'A', null, 'B'],
  flags: {},
  remaining: 3600,
  qs(){ return [
    { question:'M1', section:'Mathematics', type:'mcq', options:['A','B'] },
    { question:'M2', section:'Mathematics', type:'mcq', options:['A','B'] },
    { question:'E1', section:'English', type:'mcq', options:['A','B'] },
    { question:'E2', section:'English', type:'mcq', options:['A','B'] },
  ]; },
  root(){ return { innerHTML:'' }; },
  answer(){}, flag(){}, confirmSubmit(){}, go(i){ this.idx=i; }
};
sandbox.Exam = sandbox.window.Exam;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const Exam = sandbox.window.Exam;
const sections = Exam.sections();
const tabs = Exam.renderTabs('Mathematics');
const mathPalette = Exam.renderPalette('Mathematics');
const engPalette = Exam.renderPalette('English');
const pass = [];
function ok(name, cond){ pass.push([name, !!cond]); console.log((cond?'OK  - ':'FAIL- ')+name); }
ok('multi builder stores subject_breakdown fallback metadata', /subject_breakdown/.test(multi) && /anti_cheat_config/.test(multi));
ok('CBT engine can recover tabs from subject_breakdown metadata', /subject_breakdown/.test(engine) && /recover subject tabs/.test(engine));
ok('two subjects detected', sections.length === 2 && sections.includes('Mathematics') && sections.includes('English'));
ok('tabs contain both subjects', tabs.includes('Mathematics') && tabs.includes('English'));
ok('math palette excludes English question text and has two buttons', !mathPalette.includes('English') && (mathPalette.match(/Exam.go\(/g)||[]).length === 2);
ok('english palette excludes Mathematics label and has two buttons', !engPalette.includes('Mathematics') && (engPalette.match(/Exam.go\(/g)||[]).length === 2);
Exam.goSubject('English'); ok('goSubject switches to first English question', Exam.idx === 2);
Exam.nextInSubject(); ok('nextInSubject stays inside English', Exam.idx === 3);
Exam.prevInSubject(); ok('prevInSubject stays inside English', Exam.idx === 2);
const fails = pass.filter(x=>!x[1]);
console.log(`\nCBT V5 subject tab simulation: ${pass.length-fails.length} passed, ${fails.length} failed.`);
process.exit(fails.length ? 1 : 0);

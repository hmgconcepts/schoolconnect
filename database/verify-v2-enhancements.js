#!/usr/bin/env node
const fs=require('fs');const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';let f=0;const ok=(n,c)=>{console.log((c?'OK  ':'FAIL')+' - '+n);if(!c)f++};
const cbt=read('cbt.html'),re=read('assets/js/report-engine.js'),app=read('assets/js/app.js'),g=read('assets/js/generator.js'),st=read('settings.html');
ok('CBT report column is a selector backed by assessment columns', /select class="form-select" id="ex-col"/.test(cbt)&&/assessment_columns/.test(cbt));
ok('CBT exposes registered/open exam modes', /id="ex-mode"/.test(cbt)&&/value="registered"/.test(cbt)&&/value="open"/.test(cbt));
ok('CBT export term/session are populated selectors', /id="cbt-exp-term" class="form-select"/.test(re)&&/id="cbt-exp-sess" class="form-select"/.test(re)&&/reportPickerOptions/.test(re));
ok('Family-safe pages are explicitly allowed', ['timetable','attendance','idcards','inbox','complaints','eresources','certificates'].every(x=>app.includes("'"+x+"'"))&&!/\s'inbox','messages'/.test(app));
ok('Family navigation bypasses stale page-level allow attributes only for whitelisted read-only pages', /familyReadOnly/.test(app));
ok('Next-term bill settings and report rendering exist', /st-next-fee/.test(st)&&/Next Term Bill/.test(re));
ok('Generator includes HMG flyer page and image package', /hmg-ecosystem/.test(g)&&/ecosystem-flyers/.test(g));
ok('Admission acronym is carried into generated SQL', /admissionAcronym/.test(g)&&/admission_prefix/.test(g));
ok('No AI API dependency added', !/api\.openai|anthropic_api|gemini_api|x-api-key/i.test(cbt+re+app+g));
console.log(`V2 enhancement verification: ${9-f}/9 passed.`);process.exit(f?1:0);

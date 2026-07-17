#!/usr/bin/env node
const fs=require('fs');const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';let bad=0;function ok(n,c){console.log((c?'OK  ':'FAIL')+' - '+n);if(!c)bad++}
const page=read('report-cards.html'), sql=read('database/complete-schema.sql'), gen=read('assets/js/generator.js'), engine=read('assets/js/report-engine.js');
ok('Assessment template is global rather than subject-by-subject', /eq\('subject', '\*'\)/.test(page)&&/subject: '\*'/.test(page)&&/School-wide assessment columns/.test(page));
ok('Report-score uniqueness preserves the subject dimension', /unique\(column_id, student_id_ref, student_name, subject\)/.test(sql)&&/report_scores_column_student_subject_uq/.test(sql));
ok('Subject score save mirrors standard columns into Results', /syncScoreToResults/.test(page)&&/ca1:'ca1'/.test(page)&&/exam:'exam'/.test(page));
ok('Report score upsert includes subject', /onConflict: 'column_id,student_id_ref,student_name,subject'/.test(page));
ok('Complete schema includes V3 global migration, trait/comment tables and schema reload', /V3 COMPLETE-SCHEMA CLOSURE/.test(sql)&&/create table if not exists public.affective_traits/.test(sql)&&/create table if not exists public.report_comments/.test(sql)&&/notify pgrst, 'reload schema'/.test(sql));
ok('Generator packages complete schema as the first-install path', /database\/complete-schema\.sql/.test(gen)&&/Run database\/complete-schema\.sql once/.test(gen));
ok('Report engine has official stamp and signature output', /OFFICIAL SCHOOL SEAL/.test(engine)&&/signatureBlock/.test(engine)&&/stampSvg/.test(engine));
ok('No paid AI API added', !/api\.openai|anthropic_api|gemini_api|x-api-key/i.test(page+sql+gen+engine));
console.log(`V3 academic-flow verification: ${8-bad}/8 passed.`);process.exit(bad?1:0);

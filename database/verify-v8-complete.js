const fs = require('fs');
const path = require('path');
const root = __dirname;
const generated = path.resolve(root, '..', 'generated-site');
const schema = fs.readFileSync(path.join(root, 'database', 'complete-schema.sql'), 'utf8');
let pass = 0, fail = 0;
function ok(label, condition){ if(condition){ console.log('OK  - '+label); pass++; } else { console.log('FAIL- '+label); fail++; } }
function at(text){ return schema.indexOf(text); }

ok('v8 complete schema exists', fs.existsSync(path.join(root,'database','complete-schema.sql')));
ok('generated client has one active complete schema', fs.existsSync(path.join(generated,'database','complete-schema.sql')) && !fs.existsSync(path.join(generated,'database','complete-schema-v4.sql')));
ok('school_settings is created before upgrade insert', at('create table if not exists public.school_settings') < at('insert into public.school_settings (id, school_id'));
ok('school_id is backfilled before upgrade insert', at('add column if not exists school_id uuid references public.schools') < at('insert into public.school_settings (id, school_id'));
for (const t of ['class_fee_structure','psychomotor_traits','report_comments','school_products','role_status_log','report_scores','assessment_columns','attendance','cbt_exams','cbt_results']) ok('table '+t+' declared', new RegExp('create table if not exists public\\.'+t+'\\b').test(schema));
ok('report score upsert key has exact unique constraint', /unique \(column_id, student_id_ref, student_name, class, subject, term, session\)/.test(schema));
ok('report score migration cleans duplicates before key', at('delete from public.report_scores a using') < at('report_scores_context_unique'));
ok('school fee page conflict key exists', /class_fee_structure_class_arm_department_term_uq_v7/.test(schema));
ok('all settings runtime columns are backfilled before later use', /add column if not exists checkin_deadline/.test(schema) && /add column if not exists school_name/.test(schema));
ok('acronym triggers exist', /sc_generate_admission_no/.test(schema) && /sc_generate_staff_no/.test(schema));
ok('family attendance read policy is separate from staff write policy', /v7_attendance_read/.test(schema) && /v7_attendance_write_staff/.test(schema));
ok('family attendance UI uses parent_child', /from\('parent_child'\)/.test(fs.readFileSync(path.join(root,'attendance.html'),'utf8')));
ok('family attendance UI hides staff/admin controls', /data-staff-only/.test(fs.readFileSync(path.join(root,'attendance.html'),'utf8')));
ok('CBT question export/import controls exist', /exportExamCSV/.test(fs.readFileSync(path.join(root,'cbt.html'),'utf8')) && /importExamCSV/.test(fs.readFileSync(path.join(root,'cbt.html'),'utf8')));
ok('CBT results CSV/PDF/JSON exports exist', /exportResultsPDF/.test(fs.readFileSync(path.join(root,'cbt.html'),'utf8')) && /exportResultsJSON/.test(fs.readFileSync(path.join(root,'cbt.html'),'utf8')));
ok('generator fresh ZIP path is complete-schema only', /database\/complete-schema\.sql/.test(fs.readFileSync(path.join(root,'assets/js/generator.js'),'utf8')));
ok('schema cache reload is present', /notify pgrst, 'reload schema'/.test(schema));
console.log(`\nSchool Connect v8 audit: ${pass} passed, ${fail} failed.`);
process.exitCode = fail ? 1 : 0;

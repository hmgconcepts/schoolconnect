/* School Connect v7 cumulative static audit. This is intentionally dependency-free:
 * it can run on a clean checkout with only Node installed. It does not pretend
 * to be a Supabase integration test; deployers should run the SQL in Supabase
 * and execute the smoke checks documented in AUDIT_REPORT_V7.md. */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const schema = fs.readFileSync(path.join(root,'database','complete-schema.sql'),'utf8');
let pass=0, fail=0;
function ok(name, condition){ if(condition){console.log('OK  - '+name);pass++;} else {console.log('FAIL- '+name);fail++;} }
function pos(s){return schema.indexOf(s);}

ok('single canonical complete schema exists', fs.existsSync(path.join(root,'database','complete-schema.sql')));
ok('former v4 repair file is not a fresh-install path', !fs.existsSync(path.join(root,'database','complete-schema-v4.sql')));
ok('profiles precedes all profile foreign keys', pos('create table if not exists public.profiles') < pos('create table if not exists public.cbt_exams'));
ok('schools precedes class_fee_structure', pos('create table if not exists public.schools') < pos('create table if not exists public.class_fee_structure'));
ok('school_settings exists before any ALTER', pos('create table if not exists public.school_settings') < pos('alter table public.school_settings add column'));
for (const t of ['class_fee_structure','psychomotor_traits','report_comments','school_products','role_status_log','report_scores','assessment_columns','cbt_exams','cbt_results','attendance','school_settings']) {
  ok('table '+t+' is declared', new RegExp('create table if not exists public\\.'+t+'\\b').test(schema));
}
ok('report score browser key has matching unique constraint', /unique \(column_id, student_id_ref, student_name, class, subject, term, session\)/.test(schema));
ok('report score key columns are made non-null during repair', /alter table public\.report_scores alter column class set not null/.test(schema));
ok('report score duplicate cleanup runs before uniqueness', pos('delete from public.report_scores a using') < pos('add constraint report_scores_context_unique'));
ok('school_name is a real settings column', /school_name text/.test(schema));
ok('checkin_deadline is a real settings column', /checkin_deadline text/.test(schema));
ok('admission trigger uses settings acronym', /sc_generate_admission_no/.test(schema) && /admission_prefix/.test(schema));
ok('staff trigger uses school prefix', /sc_generate_staff_no/.test(schema) && /staff_prefix/.test(schema));
ok('parent attendance policy is read-only family scope', /v7_attendance_read/.test(schema) && /v7_attendance_write_staff/.test(schema));
ok('parent/student cannot write attendance', /v7_attendance_write_staff[\s\S]*public\.is_staff\(auth\.uid\(\)\)/.test(schema));
ok('school stamp and signature settings exist', /stamp_enabled boolean/.test(schema) && /signature_url text/.test(schema));
ok('report subjects view and CBT RPC are present', /report_subject_totals/.test(schema) && /cbt_submit/.test(schema));
ok('schema cache is reloaded at end', /notify pgrst, 'reload schema'/.test(schema));
ok('no unquoted current_role column declaration', !/^\s*current_role\s+text/m.test(schema));
const generatedSchema = fs.readFileSync(path.join('/home/user/source-generated','database','complete-schema.sql'),'utf8');
ok('generated-site schema is present and client-acronym branded', generatedSchema.includes("default 'GSA'") && generatedSchema.includes("God of Seed Academy"));
ok('generator packages only complete-schema.sql', /const sqlFiles = \[[\s\S]*?database\/complete-schema\.sql'[\s\S]*?\];/.test(fs.readFileSync(path.join(root,'assets','js','generator.js'),'utf8')) && !/sqlFiles = \[[\s\S]*database\/schema\.sql'/.test(fs.readFileSync(path.join(root,'assets','js','generator.js'),'utf8')));
ok('report card upsert uses full context key', /onConflict: 'column_id,student_id_ref,student_name,class,subject,term,session'/.test(fs.readFileSync(path.join(root,'assets','templates','pages','report-cards.html'),'utf8')));
ok('attendance family page queries parent_child and hides staff controls', /from\('parent_child'\)/.test(fs.readFileSync(path.join(root,'assets','templates','pages','attendance.html'),'utf8')) && /data-staff-only/.test(fs.readFileSync(path.join(root,'assets','templates','pages','attendance.html'),'utf8')));
ok('settings page persists checkin deadline to school_settings', /from\('school_settings'\)\.upsert\(payload/.test(fs.readFileSync(path.join(root,'assets','templates','pages','settings.html'),'utf8')));
ok('report engine renders configurable stamp', /stampEnabled/.test(fs.readFileSync(path.join(root,'assets','js','report-engine.js'),'utf8')) && /stampText/.test(fs.readFileSync(path.join(root,'assets','js','report-engine.js'),'utf8')));
console.log(`\nSchool Connect v7 audit: ${pass} passed, ${fail} failed.`);
process.exitCode = fail ? 1 : 0;

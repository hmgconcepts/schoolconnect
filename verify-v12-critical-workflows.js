#!/usr/bin/env node
const fs = require('fs');
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
let pass=0, fail=0;
function ok(name, cond){ console.log((cond?'OK  - ':'FAIL- ')+name); cond?pass++:fail++; }
const schema = read('database/complete-schema.sql')+'\n'+read('database/schema.sql')+'\n'+read('database/update-v12-schema.sql');
const voting = read('assets/js/voting.js');
const notif = read('assets/js/notifications.js');
const crud = read('assets/js/crud.js');
const app = read('assets/js/app.js');
const settings = read('settings.html');
const checkinStaff = read('checkin-staff.html');
const superjs = read('assets/js/super.js');
const cbt = read('cbt.html');

function precedingDropForPolicies(sql){
  const lines=sql.split(/\n/); let bad=[];
  lines.forEach((l,i)=>{ if(/^\s*create\s+policy\s+/i.test(l) && !(i>0 && /drop\s+policy\s+if\s+exists/i.test(lines[i-1]))) bad.push((i+1)+': '+l.trim()); });
  return bad;
}
const badPolicies = precedingDropForPolicies(read('database/complete-schema.sql'));
ok('complete-schema is idempotent: every create policy is preceded by drop policy if exists', badPolicies.length===0);
ok('parents_read policy duplicate error fixed', /drop policy if exists "parents_read" on public\.parents;\s*\ncreate policy "parents_read"/m.test(schema));
ok('voting UUID candidate_id repair exists', /alter table public\.poll_votes alter column candidate_id type text using candidate_id::text/.test(schema));
ok('voting allows vote replacement and open-poll-only voting', /pv_delete_v11/.test(schema) && /coalesce\(p\.status,'open'\) = 'open'/.test(schema));
ok('voting UI/runtime supports create, edit, close/reopen, list rendering, vote counts and max votes', /createPoll/.test(voting) && /updatePoll/.test(voting) && /max_votes/.test(voting) && /created_by/.test(voting) && /attachVoteCounts/.test(read('voting.html')) && /renderList/.test(read('voting.html')));
ok('exam_registrations relation is created before ALTER references it', /create table if not exists public\.exam_registrations[\s\S]*?alter table public\.exam_registrations/.test(read('database/complete-schema.sql')));
ok('persistent notifications tray prevents disappearing-only notifications', /ensureLiveTray/.test(notif) && /sc-live-notification-tray/.test(notif) && /showInApp\(n\.title/.test(notif));
ok('teacher/staff ownership helper covers created/submitted/generated/recorded owners', /isOwnedByCurrent\(row\)/.test(crud) && /created_by/.test(crud) && /submitted_by/.test(crud) && /generated_by/.test(crud) && /recorded_by_id/.test(crud));
ok('health/helpdesk/reports ownership RLS is installed', /hlth_update_v12/.test(schema) && /hd_update_v12/.test(schema) && /rep_update_v12/.test(schema));
ok('generic module_records ownership RLS is installed', /mr_update_v12_owner/.test(schema) && /mr_delete_v12_owner/.test(schema));
ok('staff geofence settings exist in UI and schema', /Staff Attendance Geofence/.test(settings) && /latitude numeric/.test(schema) && /geo_radius_m integer/.test(schema));
ok('staff check-in blocks GPS unsupported/denied when geofence is enforced', /GPS not supported[\s\S]*blocked/i.test(checkinStaff) && /GPS permission\/error/.test(checkinStaff) && /resolve\(false\)/.test(checkinStaff));
ok('App exposes school_settings geofence to SCHOOL runtime', /SCHOOL\.latitude/.test(app) && /enforceGeofence/.test(app));
ok('CBT non-owner teacher read-only guard exists', /canManageExam\(e\)/.test(cbt) && /Read-only/.test(cbt));
ok('assistant bot includes V12 help topics and auto page-info coverage', /invalid input syntax for type uuid/.test(superjs) && /Staff Attendance Geofence/.test(superjs) && /ensurePageInfoCoverage/.test(superjs));
ok('strict parent/student scoped modules remain explicit', /strictStudentModules = \['results', 'attendance', 'fees', 'report_cards', 'certificates', 'payments_online'\]/.test(crud));
console.log(`\nV12 critical workflow verification: ${pass} passed, ${fail} failed.`);
if (badPolicies.length) console.log('Non-idempotent policies:', badPolicies.slice(0,10).join('\n'));
process.exit(fail?1:0);

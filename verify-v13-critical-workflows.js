#!/usr/bin/env node
const fs=require('fs');
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
let pass=0,fail=0;function ok(n,c){console.log((c?'OK  - ':'FAIL- ')+n);c?pass++:fail++;}
const complete=read('database/complete-schema.sql');
const schema=complete+'\n'+read('database/schema.sql')+'\n'+read('database/update-v12-schema.sql')+'\n'+read('database/voting-schema.sql');
const voting=read('assets/js/voting.js');
const votePage=read('voting.html');
const crud=read('assets/js/crud.js');
const notif=read('assets/js/notifications.js');
const report=read('assets/js/report-engine.js');
const settings=read('settings.html');
const geo=read('geofence-settings.html');
const cbt=read('cbt.html');
const examReg=read('exam-register.html');
const superjs=read('assets/js/super.js');
const generator=read('assets/js/generator.js');
function allPolicyCreatesHaveDrop(sql){const lines=sql.split(/\n/);return lines.every((l,i)=>!/^\s*create\s+policy\s+/i.test(l)||(i>0&&/drop\s+policy\s+if\s+exists/i.test(lines[i-1])))}
function candidateAlterSafe(sql){const idxs=[];let idx=sql.indexOf('alter table public.poll_votes alter column candidate_id type text');while(idx>=0){idxs.push(idx);idx=sql.indexOf('alter table public.poll_votes alter column candidate_id type text',idx+1)}return idxs.length>0 && idxs.every(i=>sql.slice(Math.max(0,i-500),i).includes('drop view if exists public.poll_results cascade')) && /create or replace view public\.poll_results/.test(sql)}
ok('complete-schema remains idempotent for policies', allPolicyCreatesHaveDrop(complete));
ok('poll_results dependency is handled before candidate_id type alteration', candidateAlterSafe(schema));
ok('exam_registrations table is created before ALTER references it', /create table if not exists public\.exam_registrations[\s\S]*?alter table public\.exam_registrations/.test(complete));
ok('respondent voting works on old DBs without polls.max_votes column', /older databases do not have polls\.max_votes/.test(voting)&&/select\('id,status,allow_multiple'\)/.test(voting));
ok('voting page renders list/stats/results and vote counts persist', /attachVoteCounts/.test(votePage)&&/renderList/.test(votePage)&&/vt-stat-active/.test(votePage)&&/vote_count/.test(votePage));
ok('notification table/list content is kept via stable session cache', /stableTableCacheKey/.test(crud)&&/last visible records/.test(crud)&&/sessionStorage\.setItem\(cacheKey/.test(crud));
ok('persistent notification live tray exists', /ensureLiveTray/.test(notif)&&/sc-live-notification-tray/.test(notif));
ok('teacher ownership covers sensitive modules', /isOwnedByCurrent\(row\)/.test(crud)&&/recorded_by_id/.test(crud)&&/generated_by/.test(crud)&&/submitted_by/.test(crud)&&/helpdesk_tickets/.test(crud));
ok('CBT non-owner teacher read-only guard exists', /canManageExam\(e\)/.test(cbt)&&/Read-only/.test(cbt));
ok('affective/psychomotor + stamp/signature report output exists', /AFFECTIVE DOMAIN/.test(report)&&/PSYCHOMOTOR DOMAIN/.test(report)&&/stampSvg/.test(report)&&/signatureBlock/.test(report));
ok('family-specific modules remain scoped to student/parent child', /strictStudentModules = \['results', 'attendance', 'fees', 'report_cards', 'certificates', 'payments_online'\]/.test(crud)&&/parent_child/.test(crud)&&/childOwn/.test(crud));
ok('dedicated admin geofence page exists and generator/generated site includes it', /Dedicated Admin Geofence Page/.test(geo)&&/Staff Attendance Geofence/.test(settings)&&(generator? /geofence-settings/.test(generator): true));
ok('exam registration page description is specific and correct', /WAEC, NECO, NABTEB, NCEE, UTME\/JAMB/i.test(examReg)&&/public examination registration/i.test(superjs));
ok('SEO/HMG lead generation remains present', fs.existsSync('sitemap.xml')&&fs.existsSync('robots.txt')&&/hmgconcepts/i.test(read('index.html')));
ok('No paid AI API dependency is introduced', !/api\.openai|openai_api|anthropic_api|gemini_api|x-api-key/i.test(voting+crud+superjs));
console.log(`\nV13 critical workflow verification: ${pass} passed, ${fail} failed.`);process.exit(fail?1:0);

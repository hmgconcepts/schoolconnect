#!/usr/bin/env node
const fs=require('fs');
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
let pass=0,fail=0;function ok(n,c){console.log((c?'OK  - ':'FAIL- ')+n);c?pass++:fail++;}
const crud=read('assets/js/crud.js');
const notif=read('assets/js/notifications.js');
const siteHelp=read('assets/js/site-help.js');
const superjs=read('assets/js/super.js');
const geo=read('geofence-settings.html');
const settings=read('settings.html');
const generator=read('assets/js/generator.js');
const index=read('index.html');
const schema=read('database/complete-schema.sql')+'\n'+read('database/schema.sql')+'\n'+read('database/update-v12-schema.sql');
const report=read('assets/js/report-engine.js');
function allPolicyCreatesHaveDrop(sql){const lines=sql.split(/\n/);return lines.every((l,i)=>!/^\s*create\s+policy\s+/i.test(l)||(i>0&&/drop\s+policy\s+if\s+exists/i.test(lines[i-1])))}
function candidateAlterSafe(sql){const idxs=[];let idx=sql.indexOf('alter table public.poll_votes alter column candidate_id type text');while(idx>=0){idxs.push(idx);idx=sql.indexOf('alter table public.poll_votes alter column candidate_id type text',idx+1)}return idxs.length>0 && idxs.every(i=>sql.slice(Math.max(0,i-500),i).includes('drop view if exists public.poll_results cascade'))}
ok('notification/table rows persist with stable per-user table cache', /stableTableCacheKey/.test(crud)&&/last visible records/.test(crud)&&/sessionStorage\.setItem\(cacheKey/.test(crud));
ok('persistent live notification tray exists', /ensureLiveTray/.test(notif)&&/sc-live-notification-tray/.test(notif));
ok('student/parent strict scoping includes person_id for ID cards and child records', /r\.person_id === st\.id/.test(crud)&&/childIds\.includes\(r\.person_id\)/.test(crud)&&/data\.person_id/.test(crud));
ok('strict family modules remain explicit', /strictStudentModules = \['results', 'attendance', 'fees', 'report_cards', 'certificates', 'payments_online'\]/.test(crud));
ok('exam registration help no longer resolves to inventory/asset description', /"exam-register":\{title:"Public Examination Registration"/.test(siteHelp)&&/This public page is not an inventory or asset page/.test(siteHelp)&&/const forced =/.test(superjs));
ok('assistant has robust page descriptions/fallback coverage', /ensurePageInfoCoverage/.test(superjs)&&/PAGE_INFO/.test(superjs)&&/SC_HELP/.test(siteHelp));
ok('admin geofence page captures GPS from device and is bundled by generator', /Capture school GPS from this device/.test(geo)&&/useCurrentLocation/.test(geo)&&/geofence-settings/.test(generator));
ok('settings page also exposes GPS capture workflow', /Capture school GPS from this device/.test(settings)&&/Staff Attendance Geofence/.test(settings));
ok('poll_results dependency-safe candidate_id alteration remains fixed', candidateAlterSafe(schema));
ok('complete-schema policies remain idempotent', allPolicyCreatesHaveDrop(read('database/complete-schema.sql')));
ok('report outputs retain affective/psychomotor stamp/signature', /AFFECTIVE DOMAIN/.test(report)&&/PSYCHOMOTOR DOMAIN/.test(report)&&/stampSvg/.test(report)&&/signatureBlock/.test(report));
ok('SEO/HMG lead generation remains present', fs.existsSync('robots.txt')&&fs.existsSync('sitemap.xml')&&/hmgconcepts/i.test(index));
ok('No paid AI API dependency introduced', !/api\.openai|openai_api|anthropic_api|gemini_api|x-api-key/i.test(crud+notif+superjs));
console.log(`\nV14 critical workflow verification: ${pass} passed, ${fail} failed.`);process.exit(fail?1:0);

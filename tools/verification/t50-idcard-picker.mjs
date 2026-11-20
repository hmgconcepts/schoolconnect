/* V12.79 (round 24, item 2) — THE PICKER FOLLOWS THE CARD TYPE.
   ---------------------------------------------------------------------------
   The report: with card type = staff the "Pick a staff" list offered students.
   The current build is already correct, so this is a PERMANENT REGRESSION TEST
   rather than a repair — the behaviour is now nailed down so it cannot come
   back: staff ⇒ only staff, student ⇒ only students, both ways, with the label,
   the option text and the list behind the page all agreeing.
   Run: source /home/user/work/chromium-env.sh && node tools/verification/t50-idcard-picker.mjs
   ========================================================================== */
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import http from 'http';
const require_ = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require_('playwright-core')); } catch { ({ chromium } = require_('/home/user/work/node_modules/playwright-core')); }
const ROOT=path.resolve(new URL('.', import.meta.url).pathname,'../..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/idcards.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x');}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base='http://127.0.0.1:'+srv.address().port;
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:1400,height:1000}})).newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.route('**/assets/js/config.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";'}));
await pg.route('**/supabase-js@2',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.supabase=window.supabase||{};'}));
await pg.addInitScript(() => {
  const STUDENTS=[{id:'s1',full_name:'Student One',class:'SSS 1',adm_no:'A1',user_id:'u1'}];
  const STAFF=[{id:'t1',full_name:'Teacher One',staff_no:'ST1',role:'Teacher',user_id:'u2'}];
  const chain=(rows)=>{let r0=rows.slice();const api={};
    api.select=()=>api;api.order=()=>api;api.limit=()=>api;api.range=()=>api;
    api.eq=(c,v)=>{r0=r0.filter(x=>x[c]===v);return api;};
    api.in=(c,vs)=>{r0=r0.filter(x=>(vs||[]).includes(x[c]));return api;};
    api.ilike=()=>api;api.not=()=>api;
    api.maybeSingle=()=>Promise.resolve({data:r0[0]||null,error:null});
    api.single=()=>Promise.resolve({data:r0[0]||null,error:null});
    api.then=(a,c)=>Promise.resolve({data:r0,error:null}).then(a,c);
    return api;};
  window.sb={from:(t)=> /^staff/i.test(t)?chain(STAFF):/^students/i.test(t)?chain(STUDENTS):chain([]), rpc:()=>Promise.resolve({data:null,error:null})};
  window.SC_PROFILE={id:'u9',role:'admin',full_name:'Admin'};
});

let pass=0, fail=0;
const ok=(c,m,x)=>{ c?(pass++,console.log('  PASS',m)):(fail++,console.log('  FAIL',m,x===undefined?'':JSON.stringify(x).slice(0,260))); };

await pg.goto(base+'/idcards.html',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(900);
const out=await pg.evaluate(async ()=>{
  const opts=()=>[...document.querySelectorAll('#ic-student option')].map(o=>o.textContent.trim());
  const label=()=>(document.getElementById('ic-pick-label')||{}).textContent||'';
  const before={label:label(), opts:opts(), kind:ICUI.kind};
  document.getElementById('ic-type').value='staff';
  ICUI.switchType('staff');
  await new Promise(r=>setTimeout(r,600));
  const staffView={label:label(), opts:opts(), kind:ICUI.kind, all:(ICUI.all||[]).map(x=>x.full_name)};
  document.getElementById('ic-type').value='student';
  ICUI.switchType('student');
  await new Promise(r=>setTimeout(r,600));
  const studentView={label:label(), opts:opts(), kind:ICUI.kind, all:(ICUI.all||[]).map(x=>x.full_name)};
  return {before,staffView,studentView};
});

console.log('\n=== the card type decides who can be picked ===');
ok(out.before.kind==='student', 'the page opens on the student card type', out.before);
ok(/student/i.test(out.before.label), 'and the picker is labelled for students', out.before.label);
ok(out.before.opts.some(t=>/Student One/.test(t)), 'a student is offered', out.before.opts);
ok(!out.before.opts.some(t=>/Teacher One/.test(t)), 'a member of staff is NOT offered', out.before.opts);

ok(out.staffView.kind==='staff', 'switching to the staff card type takes effect', out.staffView);
ok(/staff/i.test(out.staffView.label), 'the label becomes the staff one', out.staffView.label);
ok(out.staffView.opts.some(t=>/Teacher One/.test(t)), 'a member of staff is offered', out.staffView.opts);
ok(!out.staffView.opts.some(t=>/Student One/.test(t)), 'and NO student is offered — the reported defect', out.staffView.opts);
ok(out.staffView.all.length===1 && /Teacher One/.test(out.staffView.all[0]), 'the list behind the page holds staff only', out.staffView.all);

ok(out.studentView.kind==='student', 'switching back takes effect', out.studentView);
ok(/student/i.test(out.studentView.label), 'the label goes back', out.studentView.label);
ok(out.studentView.opts.some(t=>/Student One/.test(t)), 'a student is offered again', out.studentView.opts);
ok(!out.studentView.opts.some(t=>/Teacher One/.test(t)), 'and no member of staff', out.studentView.opts);
ok(out.studentView.all.length===1 && /Student One/.test(out.studentView.all[0]), 'the list behind the page holds students only', out.studentView.all);
ok(errs.length===0, 'no page errors', errs.slice(0,2));

await b.close(); srv.close();
if(fail){ console.error(`\nID CARD PICKER FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nID CARD PICKER OK — ${pass} passed, 0 failed · staff cards list staff, student cards list students, in both directions.`);

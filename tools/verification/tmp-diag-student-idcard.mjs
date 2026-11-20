import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = '/home/user/repos/gosaportal';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]); if(p==='/')p='/idcards.html';
  const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x');}
  r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
await new Promise(r=>srv.listen(0,'0.0.0.0',r));
const base='http://127.0.0.1:'+srv.address().port;
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await b.newPage({viewport:{width:1280,height:1000}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(base+'/idcards.html',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(800);

const out = await pg.evaluate(async () => {
  /* a stand-in Supabase client with just enough surface for this page */
  const STUDENT={id:'s1',full_name:'Olatunbosun Faith Oladunni',class:'SSS 1',arm:'A',
    admission_no:'GOSA/2026/0005',admission_year:2026,gender:'female',photo_url:'',
    date_of_birth:'2009-04-12',created_at:'2026-09-01T00:00:00Z',guardian_phone:'+2347012345678',
    user_id:'u1',blood_group:'O+'};
  const chain=(rows)=>{ const p=Promise.resolve({data:rows,error:null});
    const o={ select:()=>o, order:()=>o, eq:()=>o, neq:()=>o, in:()=>o, ilike:()=>o, not:()=>o,
      limit:()=>o, range:()=>o, maybeSingle:()=>Promise.resolve({data:rows[0]||null,error:null}),
      single:()=>Promise.resolve({data:rows[0]||null,error:null}), then:(a,c)=>p.then(a,c) };
    return o; };
  window.sb={ from:(t)=>chain(/student/i.test(t)?[STUDENT]:[]), rpc:()=>Promise.resolve({data:null,error:null}) };
  window.SC_PROFILE={id:'u1',role:'student',full_name:'Olatunbosun Faith Oladunni',email:'faith@test'};
  try{ if(window.App&&App.applyVisibilityTokens) App.applyVisibilityTokens('student'); }catch(_){}
  try{ if(window.App&&App.enforceReadOnlyForm) App.enforceReadOnlyForm('student','idcards'); }catch(_){}
  try{ await ICUI.load(); }catch(e){ return {fatal:String(e.message)}; }
  await new Promise(r=>setTimeout(r,600));

  const vis = el => !!(el && el.offsetParent !== null && getComputedStyle(el).display!=='none');
  const sections=[...document.querySelectorAll('.app-content > *')].map(el=>({
    tag:el.tagName, id:el.id||'', cls:(el.className||'').toString().slice(0,40),
    visible: vis(el), text:(el.textContent||'').trim().slice(0,70) }));
  const preview=document.getElementById('ic-preview');
  const cards=preview?preview.querySelectorAll('.sc-idcard').length:0;
  const faces=preview?preview.querySelectorAll('.sc-idcard-face').length:0;
  const buttons=[...document.querySelectorAll('.app-content button')].map(x=>({t:(x.textContent||'').trim().slice(0,34), visible:vis(x)}));
  /* is the template form-group swallowing its siblings? */
  const tpl=document.getElementById('ic-template');
  const pc=document.getElementById('ic-pc');
  const nesting={ tplParent:(tpl&&tpl.parentElement&&tpl.parentElement.className)||'',
                  pcParent:(pc&&pc.parentElement&&pc.parentElement.className)||'',
                  pcInsideTplGroup: !!(tpl&&pc&&tpl.closest('.form-group')===pc.closest('.form-group')) };
  return { sections, cards, faces, buttons,
           previewHtml:(preview?preview.innerHTML.length:0), nesting,
           profile:window.SC_PROFILE&&SC_PROFILE.role,
           icuiAll:(window.ICUI&&ICUI.all||[]).length, cur:(window.ICUI&&ICUI.cur&&ICUI.cur.full_name)||'' };
});
console.log(JSON.stringify(out,null,1).slice(0,4000));
console.log('pageerrors:', errs.slice(0,3));
await b.close(); srv.close();

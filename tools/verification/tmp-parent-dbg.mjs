import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import http from 'http';
const require_ = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require_('playwright-core')); } catch { ({ chromium } = require_('/home/user/work/node_modules/playwright-core')); }
const ROOT='/home/user/repos/schoolconnect';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/idcards.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x');}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base='http://127.0.0.1:'+srv.address().port;
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:1360,height:1000}})).newPage();
await pg.route('**/assets/js/config.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";'}));
await pg.route('**/supabase-js@2',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.supabase=window.supabase||{};'}));
await pg.addInitScript(() => {
  const S1={id:'aaaaaaaa-0000-0000-0000-000000000001',full_name:'Olatunbosun Faith Oladunni',class:'SSS 1',arm:'A',admission_no:'G1',user_id:'u-student'};
  const S2={...S1,id:'aaaaaaaa-0000-0000-0000-000000000002',full_name:'Olatunbosun Grace',admission_no:'G2',user_id:null};
  const OTH={...S1,id:'aaaaaaaa-0000-0000-0000-000000000003',full_name:'Ade Other',user_id:'u-other'};
  const chain=(rowsIn)=>{let rows=rowsIn.slice();const api={};
    api.select=()=>api;api.order=()=>api;api.limit=()=>api;api.range=()=>api;api.not=()=>api;api.head=()=>api;
    api.eq=(c,v)=>{rows=rows.filter(r=>r[c]===v);return api;};
    api.neq=(c,v)=>{rows=rows.filter(r=>r[c]!==v);return api;};
    api.in=(c,vs)=>{rows=rows.filter(r=>(vs||[]).includes(r[c]));return api;};
    api.ilike=(c,p)=>{const q=String(p).replace(/%/g,'').toLowerCase();rows=rows.filter(r=>String(r[c]||'').toLowerCase().includes(q));return api;};
    api.maybeSingle=()=>Promise.resolve({data:rows[0]||null,error:null});
    api.single=()=>Promise.resolve({data:rows[0]||null,error:null});
    api.then=(a,c)=>Promise.resolve({data:rows,error:null}).then(a,c);
    return api;};
  window.sb={ from:(t)=> /^students/i.test(t)?chain([S1,S2,OTH]) : /parent_child/i.test(t)?chain([{student_id:S1.id},{student_id:S2.id}]) : chain([]), rpc:()=>Promise.resolve({data:null,error:null}) };
  window.SC_PROFILE={id:'u-parent',role:'parent',full_name:'Mrs Olatunbosun'};
});
await pg.goto(base+'/idcards.html',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(400);
await pg.evaluate(()=>{try{App.applyVisibilityTokens('parent');}catch(_){}});
await pg.waitForTimeout(400);
console.log(JSON.stringify(await pg.evaluate(async()=>{
  const out={};
  out.role=window.SC_PROFILE&&SC_PROFILE.role;
  out.all=(ICUI.all||[]).map(r=>r.full_name);
  out.who=ICUI.whoami();
  const el=document.getElementById('ic-actions');
  out.actions={found:!!el, display:el&&getComputedStyle(el).display, offsetParent:!!(el&&el.offsetParent)};
  const anc=[]; let n=el; while(n&&n!==document.body){anc.push({tag:n.tagName,cls:String(n.className||'').slice(0,40),disp:getComputedStyle(n).display});n=n.parentElement;}
  out.ancestors=anc;
  out.bodyRoleReady=document.body.getAttribute('data-role-ready');
  out.navItems=[...document.querySelectorAll('.app-nav a')].slice(0,3).map(a=>({t:a.textContent.trim().slice(0,12),d:getComputedStyle(a).display}));
  try{ await ICUI.load(); }catch(e){ out.loadErr=String(e.message); }
  await new Promise(r=>setTimeout(r,400));
  out.allAfter=(ICUI.all||[]).map(r=>r.full_name);
  return out;
}),null,1));
await b.close(); srv.close();

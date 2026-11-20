/* V12.79 (round 24, item 5) — A PREP EXAM IS SITTABLE INSIDE ITS WINDOW, AND
   ONLY INSIDE ITS WINDOW.
   ---------------------------------------------------------------------------
   What the school asked for, in their words: at the due date and time the
   student must see a "Sit now" button and be able to write from home; the
   button must not be there before then.

   Two things can go wrong and both are tested here:
     · the button is offered too early (a paper sat before it is set);
     · the button never appears for a learner who already has the page open,
       because a list painted at 08:58 says "opens 09:00" for ever.

   The lists now ask the server again the moment a sitting is due. This suite
   holds a real page open, watches the clock cross the boundary, and checks that
   the page upgraded itself — and that the exam page itself refuses to open a
   paper that is not in its window, however it is reached.
   Run: source /home/user/work/chromium-env.sh && node tools/verification/t52-prep-window.mjs
   ========================================================================== */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import http from 'http';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright-core')); }
catch { ({ chromium } = require_(process.env.SC_WORK || '/home/user/work/node_modules/playwright-core')); }

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 300))); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/exam-timetable.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const browser = await chromium.launch({ executablePath: process.env.SC_CHROME || undefined, args: ['--no-sandbox'] });

async function openPrepPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";window.SCHOOL={name:"Test School",slug:"test"};' }));
  /* the real client is never contacted; createClient hands back the stand-in the
     page was given, so the page's own sign-in guard is satisfied honestly */
  await pg.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.supabase={createClient:function(){return window.sb;}};' }));
  await pg.addInitScript(() => {
    const chain = (data) => {
      let r0 = data.slice(); const api = {};
      ['select','order','limit','range','not','is','neq','ilike','eq','in'].forEach(k => { api[k] = () => api; });
      api.maybeSingle = () => Promise.resolve({ data: r0[0] || null, error: null });
      api.single = () => Promise.resolve({ data: r0[0] || null, error: null });
      api.then = (a, c) => Promise.resolve({ data: r0, error: null }).then(a, c);
      return api;
    };
    /* the school's clock, played here: the paper opens three seconds after the
       page is opened, and every call to the database recomputes the window */
    window.__openAfterMs = 3000;
    window.__t0 = Date.now();
    window.__rpcCalls = {};
    const prepRows = () => {
      const left = window.__openAfterMs - (Date.now() - window.__t0);
      const open = left <= 0;
      return [{
        code: 'PREP-MATH-01', title: 'Prep — Further Mathematics', subject: 'Further Mathematics',
        class: 'SSS 3', venue: 'Main Hall', status: open ? 'open' : 'upcoming',
        start_local: '08/11/2026, 09:00', start_time: '09:00', end_time: '10:30', duration_min: 90,
        seconds_to_start: Math.max(0, Math.round(left / 1000)),
        seconds_to_close: open ? 5400 : null,
        server_now: new Date().toISOString(),
        attempts_used: 0, attempt_limit: 2, last_percent: null
      }];
    };
    window.sb = {
      from: () => chain([]),
      rpc: (name) => {
        window.__rpcCalls[name] = (window.__rpcCalls[name] || 0) + 1;
        if (name === 'sc_my_prep_exams') return Promise.resolve({ data: prepRows(), error: null });
        if (name === 'sc_current_role') return Promise.resolve({ data: window.SC_PROFILE, error: null });
        if (name === 'sc_license_status') return Promise.resolve({ data: { ok: true, plan: 'pro' }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-student', email: 'faith@example.test' } }, error: null }),
              getSession: () => Promise.resolve({ data: { session: { access_token: 'x', user: { id: 'u-student' } } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
    };
    window.SC_PROFILE = { id: 'u-student', role: 'student', full_name: 'Faith Oladunni', class: 'SSS 3', status: 'active' };
  });
  return { pg, ctx, errs };
}

try {
  /* ------------------------------------------------ the list that upgrades --- */
  console.log('\n=== a learner keeps the Exam Timetable open before 09:00 ===');
  const { pg, ctx, errs } = await openPrepPage();
  await pg.goto(base + '/exam-timetable.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);
  const before = await pg.evaluate(() => {
    const box = document.getElementById('prep-exam-list');
    const sits = box ? box.querySelectorAll('a[href*="cbt-exam.html?code="]').length : -1;
    const cds = box ? box.querySelectorAll('.prep-countdown').length : 0;
    const cd = box ? box.querySelector('.prep-countdown') : null;
    return { sits, cds, cd: cd ? cd.textContent.trim() : '', text: box ? box.textContent.replace(/\s+/g, ' ').slice(0, 400) : '' };
  });
  ok(before.sits === 0, 'before the window there is NO "Sit now" button', before);
  ok(before.cds >= 1, 'instead the learner sees a live countdown to the opening moment', before);
  ok(/^· opens in \d+[smh]/.test(before.cd) || /opens in \d+/.test(before.text),
     'and the sentence says how long is left', { cd: before.cd, text: before.text.slice(0, 120) });

  /* hold the page open across the boundary — nothing is clicked, nothing reloads */
  await pg.waitForTimeout(5200);
  const after = await pg.evaluate(() => {
    const box = document.getElementById('prep-exam-list');
    const links = box ? [...box.querySelectorAll('a[href*="cbt-exam.html?code="]')] : [];
    return { sits: links.length, href: links[0] ? links[0].getAttribute('href') : '',
             text: box ? box.textContent.replace(/\s+/g, ' ').slice(0, 160) : '',
             calls: window.__rpcCalls['sc_my_prep_exams'] || 0 };
  });
  ok(after.sits === 1, 'the moment the paper is due, the page puts "Sit now" on the row by itself', after);
  ok(/PREP-MATH-01/.test(after.href), 'and the button points at that sitting', after.href);
  ok(after.calls >= 2, 'the upgrade came from asking the server again, not from a guess', after.calls);
  ok(errs.length === 0, 'no page errors while it upgraded', errs.slice(0, 2));
  await ctx.close();

  /* ------------------------------------------- the exam page shuts the door --- */
  console.log('\n=== the exam page itself refuses to open a paper outside its window ===');
  const gates = [
    { label: 'before it starts (not_started)', reply: { ok: false, error: 'not_started', message: 'This exam has not started yet.' }, want: /❌/ },
    { label: 'waiting for the clock (wait)', reply: { ok: false, wait: true, start_at: new Date(Date.now() + 90000).toISOString(), message: 'This exam opens shortly.' }, want: /Not open yet/ },
    { label: 'after it closes (closed)', reply: { ok: false, closed: true, message: 'This exam is no longer accepting submissions.' }, want: /Closed/ }
  ];
  for (const g of gates) {
    const c = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
    const p = await c.newPage();
    await p.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
      body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";window.SCHOOL={name:"Test School",slug:"test"};' }));
    await p.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
      body: 'window.supabase=window.supabase||{};' }));
    await p.addInitScript((reply) => {
      window.sb = { from: () => { const api = {}; ['select','order','eq','limit','maybeSingle','single','in','not','is'].forEach(k => api[k] = () => api);
                                  api.then = (a) => Promise.resolve({ data: [], error: null }).then(a); return api; },
                    /* the exam page is a public door: no sign-in needed, and the
                       reply is the only thing that decides whether it opens */
                    rpc: (n) => Promise.resolve({ data: n === 'cbt_get_public_exam_v7' || n === 'cbt_get_public_exam_v6' ? reply : null, error: null }),
                    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }),
                            getSession: () => Promise.resolve({ data: { session: null }, error: null }) } };
      window.SC_PROFILE = { id: 'u-student', role: 'student', full_name: 'Faith Oladunni' };
    }, g.reply);
    await p.goto(base + '/cbt-exam.html?code=PREP-MATH-01', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const entry = await p.$('#e-start');
    if (entry) await entry.click();          /* the learner presses Continue */
    await p.waitForTimeout(2200);
    const state = await p.evaluate(() => {
      const root = document.getElementById('exam-root') || document.body;
      return { text: root.innerText.replace(/\s+/g, ' ').slice(0, 220),
               questions: document.querySelectorAll('.q-card, [data-qindex], .question').length };
    });
    ok(g.want.test(state.text), `${g.label}: the candidate is told, and no paper is shown`, state.text);
    ok(state.questions === 0, `${g.label}: not one question is rendered`, state.questions);
    await c.close();
  }
} finally { await browser.close(); srv.close(); }

if (fail) { console.error(`\nPREP EXAM WINDOW FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nPREP EXAM WINDOW OK — ${pass} passed, 0 failed · "Sit now" appears inside the sitting window and nowhere else.`);

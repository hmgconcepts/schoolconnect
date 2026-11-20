/* V12.78 — THE LEARNER'S SIDE OF A PREP EXAM, IN A REAL BROWSER
   ---------------------------------------------------------------------------
   The gap item 2 fixes: a prep exam lived only in the CBT manager, reachable by
   a ?code= link somebody had to hand out. A student at home could not find out
   that a rehearsal existed, or when to sit it. This suite drives the two
   surfaces that close that gap and the form that creates the sitting:
     · dashboard #dash-prep-exams (student + parent sections),
     · exam-timetable.html#prep-exams,
     · the CBT manager's venue field, automatic-schedule explanation and the
       "🔄 Reschedule prep exams" button.
   It stubs only the network, never the rendering: the real page, the real app.js
   and the real controller do the work.
   Run: node tools/verification/t46-prep-portal.mjs
   ========================================================================== */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright-core')); }
catch { ({ chromium } = require_(process.env.SC_WORK || '/home/user/work/node_modules/playwright-core')); }

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(HERE, '../..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m, x ?? '')); };

function findChrome() {
  if (process.env.SC_CHROME) return process.env.SC_CHROME;
  for (const r of [process.env.HOME + '/.cache/ms-playwright', '/root/.cache/ms-playwright']) {
    let dirs = []; try { dirs = fs.readdirSync(r).sort().reverse(); } catch { continue; }
    for (const d of dirs) for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome',
      'chrome-linux64/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const p = r + '/' + d + '/' + rel; if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('no chromium found — run: source /home/user/work/chromium-env.sh');
}

const PORT = 8931;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));

const OPEN = { code: 'PREP001', title: 'Maths rehearsal', subject: 'Mathematics', class: 'SSS 1',
  start_local: '20 Nov 2026 · 19:30', start_time: '19:30', end_time: '20:15', duration_min: 45,
  venue: 'Main Hall', status: 'open', attempts_used: 0, attempt_limit: 1, last_percent: null, for_student: '' };
const UPCOMING = { ...OPEN, code: 'PREP002', title: 'English rehearsal', subject: 'English',
  start_local: '22 Nov 2026 · 10:00', status: 'upcoming', venue: 'Hall B' };
const CLOSED = { ...OPEN, code: 'PREP003', title: 'Biology rehearsal', subject: 'Biology',
  status: 'closed', attempts_used: 2, last_percent: 71.5, venue: '' };
const PARENT = { ...OPEN, for_student: 'Olatunbosun Faith Oladunni' };

const scenarios = [
  ['a student with open, upcoming and closed sittings', { rows: [OPEN, UPCOMING, CLOSED] }, async (txt, html) => {
    ok(/Sit now/.test(txt), 'an open sitting offers a Sit now button');
    ok(html.includes('cbt-exam.html?code=PREP001'), 'and the button carries the paper code', html.slice(0, 200));
    ok(/opens 22 Nov 2026/.test(txt), 'an upcoming sitting says when it opens instead of offering a dead button');
    ok(!html.includes('cbt-exam.html?code=PREP002'), 'and gives no link into a paper that is not open yet');
    ok(/Closed/.test(txt) && !html.includes('cbt-exam.html?code=PREP003'), 'a closed sitting is shown as closed, with no way in');
    ok(/19:30/.test(txt) && /20:15/.test(txt) && /45 min/.test(txt), 'date, start, end and duration are all visible');
    ok(/Main Hall/.test(txt), 'the venue is visible');
    ok(/72%/.test(txt), 'the last score is rounded for reading (71.5 → 72%)');
    ok(!/question|option/i.test(txt), 'nothing question-related leaks into the portal');
  }],
  ['a parent looking at two children', { rows: [PARENT] }, async (txt) => {
    ok(/Olatunbosun Faith Oladunni/.test(txt), 'the row names which child the sitting belongs to');
    ok(/Sit now/.test(txt), 'and still hands over the door');
  }],
  ['no prep exam yet', { rows: [] }, async (txt) => {
    ok(/No prep exam has been set for your class yet/.test(txt), 'the empty state explains what will happen, in plain words');
    ok(/Exam Timetable/.test(txt), 'and points at the timetable');
  }],
  ['older database (function missing)', { err: 'Could not find the function public.sc_my_prep_exams in the schema cache' }, async (txt) => {
    ok(/complete-schema\.sql/.test(txt), 'names the file that installs it');
    ok(!/v9\.|v10\.|v11\./.test(txt), 'and never points at a superseded migration file');
  }],
];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
try {
  for (const [label, feed, check] of scenarios) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
      body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";' }));
    await page.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
      body: 'window.supabase=window.supabase||{};' }));
    await page.addInitScript(({ rows, err }) => {
      const res = (d) => { const p = Promise.resolve({ data: d, error: null }); p.eq = () => res(d); p.in = () => res(d);
        p.order = () => res(d); p.limit = () => res(d); return p; };
      window.sb = { rpc: async (n) => (n === 'sc_my_prep_exams'
          ? (err ? { data: null, error: { message: err } } : { data: rows, error: null })
          : { data: null, error: null }),
        from: () => ({ select: () => res([]), in: () => res([]), order: () => res([]) }) };
      window.SC_PROFILE = { id: '33333333-3333-3333-3333-333333333333', role: 'student' };
    }, { rows: feed.rows || null, err: feed.err || '' });
    await page.goto(`http://127.0.0.1:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const out = await page.evaluate(async () => {
      await App.loadDashPrepExams();
      const b = document.querySelector('[id="dash-prep-exams"]');
      return { text: (b ? b.innerText : '').replace(/\s+/g, ' ').trim(), html: b ? b.innerHTML : '' };
    });
    console.log('\n=== dashboard · ' + label + ' ===');
    await check(out.text, out.html);
    ok(errs.length === 0, 'no page errors on the dashboard', errs.slice(0, 2));
    await ctx.close();
  }

  /* ------------------------------------------------ the timetable page ------ */
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";' }));
  await page.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.supabase=window.supabase||{};' }));
  await page.addInitScript(({ rows }) => {
    const res = (d) => { const p = Promise.resolve({ data: d, error: null }); p.eq = () => res(d); p.in = () => res(d);
      p.order = () => res(d); p.limit = () => res(d); p.maybeSingle = () => res(null); return p; };
    window.sb = { rpc: async (n) => (n === 'sc_my_prep_exams' ? { data: rows, error: null } : { data: null, error: null }),
      from: () => ({ select: () => res([]), in: () => res([]), order: () => res([]), eq: () => res([]) }) };
    window.SC_PROFILE = { id: '33333333-3333-3333-3333-333333333333', role: 'student' };
  }, { rows: [OPEN, UPCOMING] });
  await page.goto(`http://127.0.0.1:${PORT}/exam-timetable.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => EXT.loadPrep());
  await page.waitForTimeout(200);
  const tt = await page.evaluate(() => {
    const b = document.getElementById('prep-exam-list');
    return { text: (b ? b.innerText : '').replace(/\s+/g, ' ').trim(), html: b ? b.innerHTML : '' };
  });
  console.log('\n=== exam-timetable.html · prep panel ===');
  ok(/Prep Exams/.test(await page.innerText('#prep-exams')), 'the page carries a Prep Exams panel');
  ok(tt.html.includes('cbt-exam.html?code=PREP001'), 'the timetable panel links straight into the open paper');
  ok(/19:30–20:15/.test(tt.text), 'time range is shown');
  ok(/Main Hall/.test(tt.text), 'venue is shown');
  ok(/Upcoming/.test(tt.text), 'status is shown');
  ok(/2 prep sitting\(s\)/.test(tt.text), 'the count is stated');
  ok(errs.length === 0, 'no page errors on the timetable', errs.slice(0, 2));
  await ctx.close();

  /* ------------------------------------------------ the manager's form ----- */
  console.log('\n=== cbt.html · the form that creates the sitting ===');
  const cbtCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
  const cbt = await cbtCtx.newPage();
  const cbtErrs = []; cbt.on('pageerror', e => cbtErrs.push(e.message));
  await cbt.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";' }));
  await cbt.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.supabase=window.supabase||{};' }));
  await cbt.addInitScript(() => {
    const res = () => { const d = []; const q = Promise.resolve({ data: d, error: null });
      ['select','insert','update','delete','eq','in','order','limit','range','maybeSingle','single','neq','gte','lte','count','head'].forEach(k => { q[k] = () => res(); });
      return q; };
    window.sb = { rpc: async () => ({ data: null, error: null }), from: () => res(), channel: () => ({ on: () => ({ subscribe: () => {} }) }), removeChannel: () => {} };
    window.SC_PROFILE = { id: '44444444-4444-4444-4444-444444444444', role: 'admin' };
  });
  await cbt.goto(`http://127.0.0.1:${PORT}/cbt.html`, { waitUntil: 'domcontentloaded' });
  await cbt.waitForTimeout(500);
  const form = await cbt.evaluate(() => {
    const has = (sel) => !!document.querySelector(sel);
    /* open the new-exam modal exactly as a teacher would */
    let opened = false; try { CBTUI.newExam(); opened = !!document.getElementById('ex-venue'); } catch (e) {}
    const btn = [...document.querySelectorAll('button')].find(b => /Reschedule prep exams/.test(b.textContent || ''));
    const hasFn = !!(window.CBTUI && typeof CBTUI.resyncPrep === 'function');
    const venue = document.getElementById('ex-venue');
    /* the rehearsal explanation must appear only for a prep exam */
    let noteShownForPrep = null, noteHiddenForExam = null;
    if (document.getElementById('ex-type')) {
      document.getElementById('ex-type').value = 'exam'; CBTUI.onTypeChange('exam');
      noteHiddenForExam = (document.getElementById('ex-schedule-note') || {}).style.display === 'none';
      document.getElementById('ex-type').value = 'prep'; CBTUI.onTypeChange('prep');
      noteShownForPrep = (document.getElementById('ex-schedule-note') || {}).style.display === 'block';
    }
    return { opened, hasBtn: !!btn, hasFn, hasVenue: has('#ex-venue'), venueLabel: venue ? venue.placeholder : '',
      noteShownForPrep, noteHiddenForExam,
      noteText: (document.getElementById('ex-schedule-note') || {}).innerText || '' };
  });
  ok(form.opened && form.hasVenue, 'the new-exam form has a venue field a teacher can fill in');
  ok(/Main Hall/i.test(form.venueLabel || ''), 'and shows what a venue looks like', form.venueLabel);
  ok(form.hasBtn, 'the manager toolbar offers "🔄 Reschedule prep exams"');
  ok(form.hasFn, 'and the button is wired to CBTUI.resyncPrep');
  ok(form.noteHiddenForExam === true, 'the automatic-timetable note stays out of the way for a terminal exam');
  ok(form.noteShownForPrep === true, 'and appears for a prep exam');
  ok(/writes the timetable for you/.test(form.noteText), 'the note says the timetable is written automatically');
  ok(/archive the exam and the row goes away/i.test(form.noteText), 'and says what archiving does');
  ok(cbtErrs.length === 0, 'no page errors on the CBT manager', cbtErrs.slice(0, 2));
  await cbtCtx.close();

  /* ------------------------------------------------ wiring is real --------- */
  const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  ok((dash.match(/id="dash-prep-exams/g) || []).length >= 2, 'dashboard.html carries a prep container in both the parent and student sections');
  ok(/loadDashPrepExams/.test(fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8')), 'app.js defines the loader');
  ok(/App\.loadDashPrepExams\(\)/.test(fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8')), 'and the dashboard boot sequence calls it');
  const tpl = fs.readFileSync(path.join(ROOT, 'assets/templates/pages/cbt.html'), 'utf8');
  ok(/ex-venue/.test(tpl), 'the template copy of cbt.html carries the venue field too');
} finally { await browser.close(); srv.kill(); }

if (fail) { console.error(`\nPREP PORTAL FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nPREP PORTAL OK — ${pass} passed, 0 failed · a learner can find their prep exam, see when it is, and walk in.`);

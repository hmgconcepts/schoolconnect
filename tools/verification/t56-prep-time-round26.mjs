/* V12.81 (round 26) — THE PREP EXAM TIME THE SCHOOL TYPED IS THE TIME IT OPENS.
   ---------------------------------------------------------------------------
   The school reported: "a prep exam set for 10:00 cannot be sat until 11:00".
   This suite drives the real CBT page in a browser whose clock is set to
   Africa/Lagos and watches what the page actually sends to the database.

   The fault was a wall-clock string with no zone:
     · posted raw, Postgres read it in the DATABASE's timezone (UTC), so a
       10:00 paper was stored as 11:00 school time — one hour late;
     · opened in the edit form it was rendered in UTC, so the tutor saw 09:00
       for their 10:00 paper and "corrected" it — the drift compounded;
     · `new Date("...T10:00")` is parsed as local by modern browsers and as UTC
       by older WebKit, so the same page meant two different times.

   What is asserted here:
     1. one conversion, used everywhere: local text → the instant it names, and
        back again, with no drift;
     2. creating an exam posts an ISO instant WITH a zone, at the right moment;
     3. opening an exam for editing shows the tutor their own clock (10:00), not
        UTC (09:00);
     4. saving that form unchanged does not move the exam by a minute;
     5. the live preview names the instant that will be stored, in both clocks;
     6. the learner's countdown runs on the SERVER's clock, so a phone with the
        wrong time cannot show a paper opening an hour early or late;
     7. no page in the app converts a datetime-local value the old way.

   Run: source /home/user/work/chromium-env.sh && node tools/verification/t56-prep-time-round26.mjs
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
const ok = (c, m, x) => { c ? (pass++, console.log('  PASS', m))
  : (fail++, console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400))); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/cbt.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const browser = await chromium.launch({ executablePath: process.env.SC_CHROME || undefined, args: ['--no-sandbox'] });

/* a stand-in Supabase that answers the reads the CBT page makes and records
   every write, so the assertions are about the PAYLOAD, not about the code. */
const stub = (opts = {}) => {
  const sent = { insert: null, inserts: [], update: null, table: null, rpcs: [] };
  window.__sent = sent;
  const examRow = opts.exam || null;
  const chain = (data, tbl) => {
    const api = { _tbl: tbl };
    ['select', 'order', 'limit', 'range', 'not', 'is', 'neq', 'in', 'eq', 'gte', 'lte', 'ilike'].forEach(k => { api[k] = () => api; });
    api.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error: null });
    api.single = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error: null });
    api.then = (res) => Promise.resolve({ data: Array.isArray(data) ? data : (data ? [data] : []), error: null }).then(res);
    api.insert = (rows) => { sent.insert = { table: tbl, rows }; sent.inserts.push({ table: tbl, rows }); return { select: () => ({ single: () => Promise.resolve({ data: Object.assign({ id: 'e-new', code: 'PREP-NEW' }, rows), error: null }) }), then: (res) => Promise.resolve({ data: rows, error: null }).then(res) }; };
    api.update = (patch) => { sent.update = { table: tbl, patch }; const c = chain(examRow, tbl); c.select = () => ({ maybeSingle: () => Promise.resolve({ data: Object.assign({}, examRow, patch), error: null }) }); c.then = (res) => Promise.resolve({ data: Object.assign({}, examRow, patch), error: null }).then(res); return c; };
    return api;
  };
  const tables = Object.assign({
    cbt_exams: examRow ? [examRow] : [],
    assessment_columns: [], classes: [{ name: 'JSS 1' }], subjects: [{ name: 'Maths' }],
    academic_periods: [{ term: 'First', session: '2026/2027', is_current: true }],
    school_settings: [{ id: 1, school_name: 'Test School', timezone: 'Africa/Lagos' }],
    sc_assessment_purpose: [], terms: [], sessions: []
  }, opts.tables || {});
  window.sb = {
    from: (t) => chain(tables[t] === undefined ? [] : tables[t], t),
    rpc: (name, args) => { sent.rpcs.push(name); return Promise.resolve({ data: (opts.rpc || {})[name] === undefined ? null : opts.rpc[name], error: null }); },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-admin', email: 'a@b.c' } } }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u-admin' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }),
      signOut: () => Promise.resolve({ error: null }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() { } }),
    removeChannel: () => { }
  };
  window.SC_PROFILE = { id: 'u-admin', role: 'admin', full_name: 'Admin' };
};

async function openPage(file, opts = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";window.SCHOOL={name:"Test School",slug:"test"};` }));
  await pg.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.supabase={createClient:function(){return window.sb;}};' }));
  await pg.addInitScript(stub, opts.stub || {});
  await pg.goto(BASE + '/' + file);
  await pg.waitForFunction(() => !!window.SC_PROFILE, null, { timeout: 15000 }).catch(() => { });
  await pg.waitForTimeout(600);
  return { pg, errs, ctx };
}

try {
  /* ---------------------------------------------------------------- 1. one conversion */
  {
    const { pg, errs, ctx } = await openPage('cbt.html');
    const r = await pg.evaluate(() => {
      const T = window.SC && window.SC.time;
      if (!T) return { missing: true };
      return {
        toIso: T.toIso('2026-11-20T10:00'),
        back: T.toLocalInput(T.toIso('2026-11-20T10:00')),
        naive: T.isNaive('2026-11-20T10:00'),
        zoned: T.isNaive('2026-11-20T09:00:00.000Z'),
        offset: new Date('2026-11-20T10:00').getTimezoneOffset(),
        empty: T.toIso('')
      };
    });
    ok(!r.missing, 'the app ships a single time conversion (SC.time)');
    ok(r.offset === -60, 'the test browser is running on Lagos time (UTC+1)', r.offset);
    ok(r.toIso === '2026-11-20T09:00:00.000Z',
      '10:00 typed by the tutor becomes 09:00Z — the instant it actually names', r.toIso);
    ok(r.back === '2026-11-20T10:00', 'and it comes back as 10:00, with no drift', r.back);
    ok(r.naive === true && r.zoned === false, 'a bare wall-clock is recognised as the dangerous kind');
    ok(r.empty === null, 'an empty field is null, not 1970');
    ok(errs.length === 0, 'no page errors', errs);
    await ctx.close();
  }

  /* ------------------------------------------------- 2. creating a 10:00 prep exam */
  {
    const { pg, errs, ctx } = await openPage('cbt.html');
    const sent = await pg.evaluate(async () => {
      window.CBTUI.newExam();
      await new Promise(r => setTimeout(r, 150));
      document.getElementById('ex-title').value = 'Prep 10am';
      document.getElementById('ex-subject').value = 'Maths';
      document.getElementById('ex-class').value = 'JSS 1';
      document.getElementById('ex-term').value = 'First';
      document.getElementById('ex-session').value = '2026/2027';
      document.getElementById('ex-dur').value = '45';
      document.getElementById('ex-csv').value = 'Question,Option A,Option B,Answer\n2+2,3,4,B';
      document.getElementById('ex-start').value = '2026-11-20T10:00';
      await window.CBTUI.save();
      return window.__sent;
    });
    ok(!!sent, 'the CBT page posted the new exam');
    if (process.env.SC_DEBUG) console.log('    DEBUG sent:', JSON.stringify(sent).slice(0, 900));
    const examInsert = (sent.inserts || []).find(x => x.table === 'cbt_exams');
    const rows = examInsert && examInsert.rows;
    const row = Array.isArray(rows) ? rows[0] : rows;
    const start = row && row.start_at;
    if (process.env.SC_DEBUG) console.log('    DEBUG seen:', JSON.stringify(sent.seen.keysToEngine), await pg.evaluate(()=>window.__saveSrc).catch(()=>''), 'inserts:', (sent.inserts||[]).map(x => x.table + ':' + Object.keys(x.rows || {}).length).join(','));
    ok(typeof start === 'string' && /Z$|[+-]\d\d:\d\d$/.test(start),
      'the start time is sent as an INSTANT with a zone, never as a bare wall-clock', start);
    ok(start === '2026-11-20T09:00:00.000Z' || start === '2026-11-20T09:00:00.000+00:00',
      'a 10:00 paper is stored as the instant 10:00 school time — not 11:00', start);
    ok(errs.length === 0, 'no page errors while creating', errs);
    await ctx.close();
  }

  /* ------------------------------------ 3+4. opening it again, and saving unchanged */
  {
    const exam = { id: 'e-1', code: 'PREP-1', title: 'Prep 10am', subject: 'Maths', class: 'JSS 1',
      term: 'First', session: '2026/2027', assessment_type: 'prep', exam_mode: 'open', report_column: '',
      max_score: 0, duration: 45, duration_min: 45, attempt_limit: 1, select_count: 0, negative_mark: 0,
      pass_mark: 50, is_open: true, is_archived: false, randomise: true, release_results: true,
      certificate_enabled: false, is_entrance: false, instructions: '', topic: '', venue: '',
      public_link: '', anti_cheat_config: {}, csv_data: [{ question: '2+2', options: ['3', '4'], answer: 'B' }],
      questions: [], start_at: '2026-11-20T09:00:00+00:00', close_at: null, teacher_id: 'u-admin' };
    const { pg, errs, ctx } = await openPage('cbt.html', { stub: { exam } });
    const shown = await pg.evaluate(async () => {
      await window.CBTUI.edit('e-1');
      await new Promise(r => setTimeout(r, 200));
      const el = document.getElementById('ed-start');
      return el ? el.value : null;
    });
    ok(shown === '2026-11-20T10:00',
      'the edit form shows the tutor THEIR clock (10:00), not UTC (09:00)', shown);

    const saved = await pg.evaluate(async () => {
      document.getElementById('ed-title').value = 'Prep 10am (edited)';
      await window.CBTUI.saveEdit('e-1');
      return window.__sent.update;
    });
    const patch = saved && saved.patch || {};
    ok(patch.start_at === '2026-11-20T09:00:00.000Z' || patch.start_at === '2026-11-20T09:00:00.000+00:00',
      'saving the form unchanged leaves the exam exactly where it was', patch.start_at);

    const moved = await pg.evaluate(async () => {
      window.__sent.update = null;
      document.getElementById('ed-start').value = '2026-11-20T11:00';
      await window.CBTUI.saveEdit('e-1');
      return window.__sent.update && window.__sent.update.patch.start_at;
    });
    ok(moved === '2026-11-20T10:00:00.000Z' || moved === '2026-11-20T10:00:00.000+00:00',
      'typing 11:00 moves it to 11:00 school time (10:00Z), not to 12:00', moved);
    ok(errs.length === 0, 'no page errors while editing', errs);
    await ctx.close();
  }

  /* ---------------------------------------------- 5. the preview names the instant */
  {
    const { pg, ctx } = await openPage('cbt.html');
    const text = await pg.evaluate(async () => {
      window.CBTUI.newExam();
      await new Promise(r => setTimeout(r, 150));
      document.getElementById('ex-start').value = '2026-11-20T10:00';
      document.getElementById('ex-close').value = '2026-11-20T12:00';
      window.CBTUI.previewWindow();
      return document.getElementById('ex-window-preview').textContent;
    });
    ok(/10:00/.test(text) && /09:00 UTC/.test(text),
      'the live preview prints both clocks, so a tutor can see exactly what is stored', text);
    await ctx.close();
  }

  /* ------------------------------------------- 6. the countdown runs on the server */
  {
    const future = { id: 'e-2', code: 'PREP-2', title: 'Prep soon', subject: 'Maths', class: 'JSS 1',
      exam_mode: 'registered', is_open: true, is_archived: false, release_results: true,
      attempt_limit: 1, duration: 45, duration_min: 45, csv_data: [], questions: [], teacher_id: 'u-admin' };
    const deviceNow = Date.now();
    const startAt = new Date(deviceNow + 60 * 60 * 1000 + 45 * 1000).toISOString(); /* device says 1h 45s */
    const serverNow = new Date(deviceNow + 60 * 60 * 1000).toISOString();            /* server says 45s   */
    const waitPayload = { ok: false, wait: true, error: 'not_started',
      message: 'This exam has not started yet.', start_at: startAt, closes_at: startAt,
      server_now: serverNow, title: future.title, code: future.code, engine_version: 'v5.1.1',
      exam_mode: 'registered' };
    const rpc = { cbt_get_public_exam_v7: waitPayload, cbt_get_public_exam_v6: waitPayload };
    const { pg, ctx } = await openPage('cbt-exam.html?code=PREP-2', { stub: { exam: future, rpc } });
    const text = await pg.evaluate(async () => {
      const el = document.getElementById('e-code');
      if (el) el.value = 'PREP-2';
      await window.Exam.load(false);
      await new Promise(r => setTimeout(r, 300));
      return (document.getElementById('cbt-countdown') || {}).textContent || '';
    });
    const secs = (() => { const m = /^(\d+)s$/.exec(String(text).trim()); return m ? Number(m[1]) : null; })();
    ok(secs !== null && secs >= 30 && secs <= 60,
      'the countdown follows the SERVER clock (45s), not a device that is an hour out', text);
    await ctx.close();
  }

  /* --------------------------------------- 7. the repair tool for sittings already wrong */
  {
    const prep = { id: 'e-old', code: 'PREP-OLD', title: 'Written an hour late', class: 'JSS 1',
      start_at: '2026-11-20T10:00:00+00:00', close_at: null, duration: 45, duration_min: 45,
      assessment_type: 'prep', is_archived: false, exam_mode: 'registered', is_open: true,
      csv_data: [], questions: [], teacher_id: 'u-admin', release_results: true, attempt_limit: 1 };
    const { pg, ctx } = await openPage('cbt.html', { stub: { exam: prep } });
    const shown = await pg.evaluate(async () => {
      await window.CBTUI.prepTimes();
      await new Promise(r => setTimeout(r, 200));
      const t = (document.getElementById('modal-body') || document.body).innerText;
      return t.replace(/\s+/g, ' ').slice(0, 500);
    });
    ok(/20\/11\/2026 11:00/.test(shown) || /11:00/.test(shown),
      'the doctor shows the school clock for a sitting stored as 10:00Z (= 11:00 school time)', shown);
    ok(/10:00 UTC|10:00/.test(shown), 'and the instant actually stored, side by side', shown);

    const moved = await pg.evaluate(async () => {
      window.__sent.update = null;
      window.__sent.rpcs = [];
      await window.CBTUI.shiftPrep('e-old', -60);
      await new Promise(r => setTimeout(r, 150));
      return { patch: window.__sent.update && window.__sent.update.patch, rpcs: window.__sent.rpcs };
    });
    ok(moved.patch && moved.patch.start_at === '2026-11-20T09:00:00.000Z',
      'one click moves it back an hour, to 10:00 school time', moved.patch && moved.patch.start_at);
    ok((moved.rpcs || []).includes('sc_prep_sync_exam'),
      'and asks the database to re-write the timetable row from the corrected exam', moved.rpcs);
    await ctx.close();
  }

  /* ------------------------------------------------ 8. no page converts the old way */
  {
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
    const bad = [];
    for (const f of pages) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      /* the one legitimate spelling is a fallback INSIDE SCTime itself, e.g.
         (window.SCTime ? SCTime.toIso(v) : new Date(v).toISOString()) — take
         those out first, then anything left is a bare wall-clock conversion */
      const stripped = src.replace(/window\.SCTime\s*\?[^;]*?new Date\([^)]*\)\.toISOString\(\)/g, '');
      if (/new Date\(\s*(?:document\.getElementById\([^)]*\)|v|s|c)\.value\s*\)\.toISOString\(\)/.test(stripped)) bad.push(f);
    }
    ok(bad.length === 0, 'no shipped page posts a bare datetime-local value as an instant', bad);
  }
} catch (e) {
  fail++; console.log('  FAIL suite crashed:', e && e.message);
} finally {
  await browser.close();
  srv.close();
}

console.log('\n' + (fail === 0
  ? `PREP TIME OK — ${pass} passed, 0 failed · a 10:00 paper opens at 10:00, and nobody's clock can move it.`
  : `PREP TIME FAILED — ${pass} passed, ${fail} failed`));
process.exit(fail === 0 ? 0 : 1);

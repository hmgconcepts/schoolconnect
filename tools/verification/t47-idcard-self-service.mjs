/* V12.78 (round 22, item 1) — THE ID CARD OF THE PERSON LOOKING AT IT
   ---------------------------------------------------------------------------
   The gap this closes: idcards.html put its four download/print buttons inside
   the staff-only control card, so a signed-in student could see their card
   rendered on screen and had no way to keep or print it. Every path to a file
   was hidden with the design controls.

   The action bar is now its own card and speaks to whoever is signed in:
     · student  → their own card, no bulk button, nothing else reachable;
     · parent   → their linked children, labelled as such;
     · staff    → the school, with the class filter as before.
   This suite drives the REAL page with the real controller for all three
   roles, checks what is actually on screen, and then makes a student download
   a PDF and checks the file that arrives.
   Run: node tools/verification/t47-idcard-self-service.mjs
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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/idcards.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const STUDENT = { id: 'aaaaaaaa-0000-0000-0000-000000000001', full_name: 'Olatunbosun Faith Oladunni',
  class: 'SSS 1', arm: 'A', admission_no: 'GOSA/2026/0005', admission_year: 2026, gender: 'female',
  photo_url: '', date_of_birth: '2009-04-12', created_at: '2026-09-01T00:00:00Z',
  guardian_phone: '+2347012345678', user_id: 'u-student' };
const SIBLING = { ...STUDENT, id: 'aaaaaaaa-0000-0000-0000-000000000002', full_name: 'Olatunbosun Grace',
  admission_no: 'GOSA/2026/0006', user_id: null };
const OTHERS = [
  { ...STUDENT, id: 'aaaaaaaa-0000-0000-0000-000000000003', full_name: 'Ade Other', class: 'SSS 2', admission_no: 'GOSA/2026/0100', user_id: 'u-other' },
  { ...STUDENT, id: 'aaaaaaaa-0000-0000-0000-000000000004', full_name: 'Bello Another', class: 'SSS 3', admission_no: 'GOSA/2026/0101', user_id: 'u-other2' }];

const browser = await chromium.launch({ executablePath: process.env.SC_CHROME || undefined, args: ['--no-sandbox'] });

/* Build a page for a role. The stub mimics PostgREST: a teacher-visible query
   for students returns the whole school (the real RLS does the same), so the
   page's OWN scoping is what we are testing. */
async function pageFor(role, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1100 }, acceptDownloads: true, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";' }));
  await pg.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.supabase=window.supabase||{};' }));
  await pg.addInitScript(({ role, me, kids, school }) => {
    /* a faithful-enough PostgREST: eq / in / ilike actually filter, so the page's
       own scoping is what is under test, not the stub's laziness. */
    const chain = (rowsIn) => {
      let rows = rowsIn.slice();
      const api = {};
      const self = () => api;
      api.select = self; api.order = self; api.limit = self; api.range = self; api.not = self; api.head = self;
      api.eq = (col, val) => { rows = rows.filter(r => r[col] === val); return api; };
      api.neq = (col, val) => { rows = rows.filter(r => r[col] !== val); return api; };
      api.in = (col, vals) => { rows = rows.filter(r => (vals || []).includes(r[col])); return api; };
      api.ilike = (col, pat) => { const p = String(pat).replace(/%/g, '').toLowerCase(); rows = rows.filter(r => String(r[col] || '').toLowerCase().includes(p)); return api; };
      api.maybeSingle = () => Promise.resolve({ data: rows[0] || null, error: null });
      api.single = () => Promise.resolve({ data: rows[0] || null, error: null });
      api.then = (a, c) => Promise.resolve({ data: rows, error: null }).then(a, c);
      return api;
    };
    window.sb = {
      from: (t) => /^students/i.test(t) ? chain(school)
        : /parent_child/i.test(t) ? chain(kids.map(id => ({ parent_id: me.id, student_id: id })))
        : chain([]),
      rpc: () => Promise.resolve({ data: null, error: null })
    };
    window.SC_PROFILE = { id: me.id, role, full_name: me.full_name || '' };
  }, { role, me: opts.me || STUDENT, kids: opts.kids || [], school: [STUDENT, SIBLING, ...OTHERS] });
  await pg.goto(base + '/idcards.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(400);
  /* the token pass the app itself runs once the profile resolves */
  await pg.evaluate((r) => { try { App.applyVisibilityTokens(r); } catch (_) {} }, role);
  await pg.waitForTimeout(300);
  return { pg, ctx, errs };
}

const vis = (pg, sel) => pg.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  return !!(el.offsetParent !== null && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');
}, sel);

async function barText(pg) {
  return pg.evaluate(() => {
    const b = document.getElementById('ic-actions');
    return { text: b ? b.innerText.replace(/\s+/g, ' ').trim() : '',
      buttons: [...(b ? b.querySelectorAll('button') : [])].map(x => ({ t: (x.textContent || '').replace(/\s+/g, ' ').trim(), v: !!(x.offsetParent !== null && getComputedStyle(x).display !== 'none') })),
      note: (document.getElementById('ic-actions-note') || {}).innerText || '',
      all: (window.ICUI && ICUI.all || []).map(r => r.full_name),
      cur: (window.ICUI && ICUI.cur && ICUI.cur.full_name) || '' };
  });
}

try {
  /* ------------------------------------------------------------- student --- */
  console.log('\n=== a student ===');
  {
    const { pg, ctx, errs } = await pageFor('student', { me: STUDENT });
    const t = await barText(pg);
    ok(await vis(pg, '#ic-actions'), 'the download/print bar is on screen for a student');
    const btn = (re) => t.buttons.find(b => re.test(b.t)) || {};
    ok(btn(/Download PDF/).v === true, '⬇ Download PDF is visible');
    ok(btn(/Print ID Card/).v === true, '🖨 Print ID Card is visible');
    ok(btn(/HTML proof/).v === true, '⬇ HTML proof is visible');
    ok(btn(/Print ALL/).v === false, '🖨 Print ALL is NOT offered to a student', t.buttons);
    ok(/your own card/i.test(t.note), 'the bar says this is their own card', t.note);
    ok(/cannot see or print anyone else/i.test(t.note), 'and says plainly that nobody else is reachable');
    ok(t.all.length === 1 && t.all[0] === STUDENT.full_name, 'the list holds exactly their own record', t.all);
    ok(t.cur === STUDENT.full_name, 'and that record is the one on the card', t.cur);
    ok(/my card/.test((t.buttons.find(b => /Download PDF/.test(b.t)) || {}).t || ''), 'the PDF button says "my card", not "whole school"');

    /* the card itself is still rendered, and the real download arrives */
    const rendered = await pg.evaluate(() => {
      const p = document.getElementById('ic-preview');
      return { cards: p ? p.querySelectorAll('.sc-idcard').length : 0, faces: p ? p.querySelectorAll('.sc-idcard-face').length : 0 };
    });
    ok(rendered.cards >= 1 && rendered.faces >= 2, 'the card renders with both faces', rendered);
    const [dl] = await Promise.all([
      pg.waitForEvent('download', { timeout: 25000 }).catch(() => null),
      pg.evaluate(() => { ICUI.pdfAll(); })
    ]);
    ok(!!dl, 'clicking Download PDF produces a file');
    if (dl) {
      const name = dl.suggestedFilename();
      ok(/student-id-cards/.test(name) && /\.pdf$/.test(name), 'the file is a named PDF', name);
      const p = await dl.path();
      const bytes = fs.readFileSync(p);
      ok(bytes.length > 1500 && bytes.slice(0, 5).toString() === '%PDF-', 'and it is a real PDF', bytes.length);
      const text = bytes.toString('latin1');
      const places = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
      ok(places >= 1, 'containing at least one page', places);
      ok(!/Ade Other|Bello Another/.test(text), 'and no other student appears in it');
    } else {
      fail += 3; console.log('  FAIL (skipped) file checks — no download event');
    }
    ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
    await ctx.close();
  }

  /* -------------------------------------------------------------- parent --- */
  console.log('\n=== a parent ===');
  {
    const { pg, ctx, errs } = await pageFor('parent', { me: { id: 'u-parent', full_name: 'Mrs Olatunbosun' },
      kids: [STUDENT.id, SIBLING.id] });
    const t = await barText(pg);
    ok(await vis(pg, '#ic-actions'), 'the bar is on screen for a parent too');
    ok(t.buttons.filter(b => b.v).length === 4, 'all four buttons are available (a parent may print their children)', t.buttons);
    ok(/my children/i.test(t.buttons.find(b => /Print ALL/.test(b.t)).t), 'the bulk button is labelled for their children');
    ok(/my children/.test(t.buttons.find(b => /Download PDF/.test(b.t)).t), 'and the PDF speaks of children, not the school');
    ok(t.all.length === 2 && t.all.includes(SIBLING.full_name), 'exactly the two linked children are in the list', t.all);
    ok(!t.all.includes('Ade Other'), 'and no unrelated student is');
    ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
    await ctx.close();
  }

  /* --------------------------------------------------------------- staff --- */
  console.log('\n=== staff / admin ===');
  {
    const { pg, ctx, errs } = await pageFor('admin', { me: { id: 'u-admin', full_name: 'Mr Bello' } });
    const t = await barText(pg);
    ok(await vis(pg, '#ic-actions'), 'the bar is on screen for staff');
    ok(t.buttons.every(b => b.v), 'every button is available', t.buttons);
    ok(/whole school|all staff/.test(t.buttons.find(b => /Download PDF/.test(b.t)).t), 'the PDF covers everyone, as before');
    ok(t.all.length === 4, 'the whole school is in the list', t.all);
    ok(/Pick a class/i.test(t.note), 'and the note explains the class filter');
    /* the staff-only design controls are still staff-only */
    ok(await vis(pg, '#ic-template'), 'the design controls are visible to staff');
    ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
    await ctx.close();
  }

  /* the staff-only control card must stay shut for a student */
  console.log('\n=== the staff control card stays shut ===');
  {
    const { pg, ctx } = await pageFor('student', { me: STUDENT });
    ok((await vis(pg, '#ic-template')) === false, 'a student still cannot change the design or the size');
    ok((await vis(pg, '#ic-type')) === false, 'nor the card type');
    ok((await vis(pg, '#ic-class')) === false, 'nor filter by class');
    await ctx.close();
  }

  /* ------------------------------------------------------------- wiring --- */
  const page = fs.readFileSync(path.join(ROOT, 'idcards.html'), 'utf8');
  ok(!/data-staff-only[^>]*>\s*<div class="grid grid-2">[\s\S]{0,4000}?ICUI\.pdfAll\(\)/.test(page.replace(/\n/g, ' ').replace(/<\/div>/g, '</div>')),
     'no download button is left inside the staff-only card');
  const tpl = fs.readFileSync(path.join(ROOT, 'assets/templates/pages/idcards.html'), 'utf8');
  ok(/id="ic-actions"/.test(tpl), 'the template copy carries the action bar too');
} finally { await browser.close(); srv.close(); }

if (fail) { console.error(`\nID CARD SELF-SERVICE FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nID CARD SELF-SERVICE OK — ${pass} passed, 0 failed · a learner can keep their own card, and reach nobody else's.`);

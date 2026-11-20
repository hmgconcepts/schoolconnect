/* V12.79 (round 23, items 3 and 4) — THE DOWNLOADED CARD IS THE PREVIEWED CARD,
   AND CORELDRAW CAN OPEN IT.
   ---------------------------------------------------------------------------
   The report: choose a professional template, look at the preview, press
   "⬇ Download PDF" — and the file is a different design. Cause: the PDF was
   painted by a second renderer that only received the person's data, never the
   chosen artwork. The preview and the PDF were two different drawings.

   This suite opens the real page, chooses a design with a colour that cannot be
   mistaken for the generic layout, and then:
     1. screenshots the previewed card;
     2. downloads the PDF a school actually downloads;
     3. pulls the picture out of the PDF and compares it with that screenshot
        (8×8 average colour grid, mean absolute difference);
     4. repeats with a second design to prove the picture follows the choice;
     5. checks the PDF is a strict, CorelDRAW-readable object graph.
   Run: source /home/user/work/chromium-env.sh && node tools/verification/t51-idcard-pdf-exact.mjs
   ========================================================================== */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';
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

const STUDENTS = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', full_name: 'Olatunbosun Faith Oladunni', class: 'SSS 1',
    arm: 'A', admission_no: 'GOSA/2026/0005', admission_year: 2026, gender: 'female', photo_url: '',
    date_of_birth: '2009-04-12', created_at: '2026-09-01T00:00:00Z', guardian_phone: '+2347012345678' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', full_name: 'Ade Second Learner', class: 'SSS 1',
    arm: 'A', admission_no: 'GOSA/2026/0006', admission_year: 2026, gender: 'male', photo_url: '',
    date_of_birth: '2009-06-02', created_at: '2026-09-01T00:00:00Z', guardian_phone: '+2347012345679' }];

const browser = await chromium.launch({ executablePath: process.env.SC_CHROME || undefined, args: ['--no-sandbox'] });

async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2, acceptDownloads: true, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('crash', () => errs.push('PAGE CRASHED'));
  await pg.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";window.SCHOOL={name:"Test School",slug:"test"};' }));
  await pg.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.supabase=window.supabase||{};' }));
  await pg.addInitScript((rows) => {
    const chain = (data) => {
      let r0 = data.slice(); const api = {};
      ['select','order','limit','range','not','is','neq'].forEach(k => { api[k] = () => api; });
      api.eq = (c, v) => { r0 = r0.filter(x => x[c] === v); return api; };
      api.in = (c, vs) => { r0 = r0.filter(x => (vs || []).includes(x[c])); return api; };
      api.ilike = () => api;
      api.maybeSingle = () => Promise.resolve({ data: r0[0] || null, error: null });
      api.single = () => Promise.resolve({ data: r0[0] || null, error: null });
      api.then = (a, c) => Promise.resolve({ data: r0, error: null }).then(a, c);
      return api;
    };
    /* a signed-in session: without it App.init's retry loop gives up after a
       few seconds and sends the page to login.html — which navigated away
       mid-download and made this suite fail for reasons that had nothing to do
       with the card. */
    const USER = { id: 'u-admin', email: 'admin@test.local' };
    window.sb = {
      auth: {
        getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
        getSession: () => Promise.resolve({ data: { session: { user: USER } }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      },
      from: (t) => /^students/i.test(t) ? chain(rows) : chain([]),
      rpc: () => Promise.resolve({ data: null, error: null })
    };
    window.SC_PROFILE = { id: 'u-admin', role: 'admin', full_name: 'Admin' };
  }, STUDENTS);
  await pg.goto(base + '/idcards.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => { try { App.applyVisibilityTokens('admin'); } catch (_) {} });
  await pg.waitForTimeout(400);
  /* one card at a time: a specific record, so the screenshot and the PDF are the same person */
  await pg.evaluate(() => { const sel = document.getElementById('ic-student'); sel.value = JSON.stringify(ICUI.all[0]); ICUI.pick(sel.value); });
  await pg.waitForTimeout(500);
  return { pg, ctx, errs };
}

/* mean absolute difference of two 8x8 average-colour grids, computed in the page */
let SCRATCH = null;
async function scratch(ctx) {
  if (!SCRATCH || SCRATCH.isClosed()) { SCRATCH = await ctx.newPage(); await SCRATCH.goto('about:blank'); }
  return SCRATCH;
}
async function compare(pg, aDataUrl, bDataUrl) {
  const work = await scratch(pg.context()).catch(() => pg);
  return work.evaluate(async ({ a, b }) => {
    const grid = (src) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const S = 8, c = document.createElement('canvas'); c.width = S; c.height = S;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, S, S);
        const d = x.getImageData(0, 0, S, S).data, out = [];
        for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
        res(out);
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    const A = await grid(a), B = await grid(b);
    if (!A || !B) return null;
    let sum = 0;
    for (let i = 0; i < A.length; i++) for (let k = 0; k < 3; k++) sum += Math.abs(A[i][k] - B[i][k]);
    return sum / (A.length * 3);          /* 0 = identical, 255 = opposite */
  }, { a: aDataUrl, b: bDataUrl });
}

function jpegsInPdf(bytes) {
  const out = [];
  const buf = Buffer.from(bytes);
  let idx = 0;
  while (true) {
    const i = buf.indexOf(Buffer.from('/DCTDecode'), idx);
    if (i < 0) break;
    const s = buf.indexOf(Buffer.from('stream\n'), i);
    if (s < 0) break;
    const start = s + 7;
    const e = buf.indexOf(Buffer.from('\nendstream'), start);
    if (e < 0) break;
    out.push(buf.subarray(start, e));
    idx = e + 10;
  }
  return out;
}

try {
  /* ---------------------------------------------------------- design one --- */
  console.log('\n=== design "aurora" at #c81e1e ===');
  const { pg, ctx, errs } = await openPage();
  await pg.evaluate(() => {
    document.getElementById('ic-template').value = 'aurora';
    document.getElementById('ic-pc').value = '#c81e1e';
    document.getElementById('ic-ac').value = '#f59e0b';
    ICUI.render();
  });
  await pg.waitForTimeout(700);
  const shot1 = await pg.evaluate(() => {
    const faces = [...document.querySelectorAll('#ic-preview .sc-idcard-face')];
    const el = faces[0];
    return el ? el.outerHTML.length : 0;
  });
  ok(shot1 > 0, 'the preview drew the chosen design', shot1);
  const faceShot = await pg.locator('#ic-preview .sc-idcard-face').first().screenshot();
  const previewDataUrl = 'data:image/png;base64,' + faceShot.toString('base64');

  const [dl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    pg.evaluate(() => { ICUI.pdfAll(); })
  ]);
  ok(!!dl, 'Download PDF produces a file');
  let pdf1 = null, images1 = [], frontJpg = '';
  if (dl) {
    const p = await dl.path();
    pdf1 = fs.readFileSync(p);
    fs.writeFileSync('/tmp/idcard-exact-aurora.pdf', pdf1);
    ok(pdf1.slice(0, 5).toString() === '%PDF-', 'it is a PDF', pdf1.slice(0, 8).toString());
    images1 = jpegsInPdf(pdf1);
    ok(images1.length >= 2, 'the file carries the card as pictures (front and back)', images1.length);
    /* the file holds the front, the back and any photo boxes: the front must be
       among them and must be a close match — compare against the best one. */
    let diff = null, bestJpg = '';
    for (const im of images1.slice(0, 4)) {
      const cand = 'data:image/jpeg;base64,' + im.toString('base64');
      const d = await compare(pg, previewDataUrl, cand);
      if (d !== null && (diff === null || d < diff)) { diff = d; bestJpg = cand; }
      if (diff !== null && diff < 8) break;
    }
    frontJpg = bestJpg;
    ok(diff !== null && diff < 18,
       `the picture in the PDF matches the previewed card (mean colour difference ${diff === null ? 'n/a' : diff.toFixed(1)} of 255)`, diff);
    /* and it is a card, not a page: the picture's aspect is the card's aspect */
    const work = await scratch(ctx).catch(() => pg);
    const dims = await work.evaluate(async (d) => {
      return new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = d; });
    }, frontJpg);
    if (dims) {
      const ratio = dims[0] / dims[1];
      ok(Math.abs(ratio - 85.6 / 53.98) < 0.06, 'the picture is the card’s shape, not stretched', { dims, ratio: ratio.toFixed(3) });
      ok(dims[0] >= 900, 'and it is print resolution (≥900 px across)', dims);
    } else { fail += 2; console.log('  FAIL (skipped) picture dimension checks'); }
  }

  /* ---------------------------------------------------------- design two --- */
  console.log('\n=== a different design must produce a different picture ===');
  /* A blob download can navigate the page it was launched from in headless
     Chromium, so the second design gets its own clean tab — exactly what a
     school sees when it opens the page again. */
  /* The card is rasterised at print resolution, so on a loaded machine (the
     full gate runs several browsers at once) the second render can outlast a
     single download window. Retry once in a clean tab before calling it a
     failure — the assertions afterwards are unchanged and just as strict. */
  let pg2, ctx2, errs2, d2state, preview2 = null, dl2 = null;
  for (let attempt = 1; attempt <= 2 && !dl2; attempt += 1) {
    ({ pg: pg2, ctx: ctx2, errs: errs2 } = await openPage());
    await pg2.evaluate(() => {
      const sel = document.getElementById('ic-student'); sel.value = JSON.stringify(ICUI.all[0]); ICUI.pick(sel.value);
      document.getElementById('ic-template').value = 'heritage';
      document.getElementById('ic-pc').value = '#0b6b3a';
      document.getElementById('ic-ac').value = '#c8a415';
      ICUI.render();
    });
    await pg2.waitForTimeout(attempt === 1 ? 700 : 1400);
    d2state = await pg2.evaluate(() => ({ tpl: document.getElementById('ic-template').value,
      faces: document.querySelectorAll('#ic-preview .sc-idcard').length }));
    const faceShot2 = await pg2.locator('#ic-preview .sc-idcard-face').first().screenshot().catch(() => null);
    if (faceShot2) fs.writeFileSync('/tmp/preview-heritage.png', faceShot2);
    preview2 = faceShot2 ? 'data:image/png;base64,' + faceShot2.toString('base64') : null;
    const [got] = await Promise.all([
      pg2.waitForEvent('download', { timeout: 90000 }).catch(() => null),
      pg2.evaluate(() => { ICUI.pdfAll(); })
    ]);
    dl2 = got;
    if (!dl2) { await ctx2.close().catch(() => {}); console.log(`   [retry] design two produced no download (attempt ${attempt})`); }
  }
  console.log('   [design two state]', JSON.stringify(d2state));
  ok(!!dl2, 'the second download works too');
  if (dl2 && images1.length) {
    const pdf2 = fs.readFileSync(await dl2.path());
    fs.writeFileSync('/tmp/idcard-exact-heritage.pdf', pdf2);
    const images2 = jpegsInPdf(pdf2);
    ok(images2.length >= 2, 'and carries its own pictures', images2.length);
    /* find design two's own front (the picture that matches ITS preview), then
       ask whether the two fronts differ — comparing the wrong pictures (QR
       codes, say) would answer a different question. */
    let front2 = '', d2 = null;
    if (preview2) {
      for (const im of images2.slice(0, 4)) {
        const cand = 'data:image/jpeg;base64,' + im.toString('base64');
        const d = await compare(pg2, preview2, cand);
        if (d !== null && (d2 === null || d < d2)) { d2 = d; front2 = cand; }
        if (d2 !== null && d2 < 8) break;
      }
      if (front2) fs.writeFileSync('/tmp/idcard-heritage-front.jpg', Buffer.from(front2.split(',')[1], 'base64'));
      ok(d2 !== null && d2 < 18, `design two's PDF also matches its own preview (${d2 === null ? 'n/a' : d2.toFixed(1)})`, d2);
    }
    let between = null;
    if (front2 && frontJpg) between = await compare(pg2, frontJpg, front2);
    ok(between !== null && between > 12,
       `the two designs really differ (${between === null ? 'n/a' : between.toFixed(1)} of 255) — the PDF follows the menu`, between);
  } else { fail += 2; console.log('  FAIL (skipped) second-design checks'); }
  ok(errs2.length === 0, 'no page errors on the second design', errs2.slice(0, 2));
  await ctx2.close();

  /* ------------------------------------------------- the vector option --- */
  console.log('\n=== the explicit "re-drawn / editable text" option still works ===');
  const { pg: pg3, ctx: ctx3, errs: errs3 } = await openPage();
  await pg3.evaluate(() => {
    const sel = document.getElementById('ic-student'); sel.value = JSON.stringify(ICUI.all[0]); ICUI.pick(sel.value);
    document.getElementById('ic-pdf-source').value = 'vector';
    ICUI.render();
  });
  await pg3.waitForTimeout(400);
  const [dl3] = await Promise.all([
    pg3.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    pg3.evaluate(() => { ICUI.pdfAll(); })
  ]);
  ok(!!dl3, 'the vector path still downloads');
  if (dl3) {
    const v = fs.readFileSync(await dl3.path());
    fs.writeFileSync('/tmp/idcard-vector.pdf', v);
    ok(/\/FontFile2/.test(v.toString('latin1')), 'and still embeds a real font, so its text is editable', 'no FontFile2');
  }
  ok(errs.length === 0 && errs3.length === 0, 'no page errors', errs.concat(errs3).slice(0, 2));
  await ctx.close(); await ctx3.close();

  /* ------------------------------------------------- the print path too --- */
  console.log('\n=== "Print" must ask for the very same card, not a look-alike ===');
  {
    const { pg: pg4, ctx: ctx4, errs: errs4 } = await openPage();
    await pg4.evaluate(() => {
      const sel = document.getElementById('ic-student'); sel.value = JSON.stringify(ICUI.all[0]); ICUI.pick(sel.value);
      document.getElementById('ic-template').value = 'aurora';
      document.getElementById('ic-pc').value = '#c81e1e';
      document.getElementById('ic-ac').value = '#f59e0b';
      ICUI.render();
    });
    await pg4.waitForTimeout(600);
    const faceShot4 = await pg4.locator('#ic-preview .sc-idcard-face').first().screenshot();
    const preview4 = 'data:image/png;base64,' + faceShot4.toString('base64');
    /* Asking the print dialog to open a PDF in a headless browser destroys the
       tab, so the check is made one step earlier — at the exact call both
       buttons make before they hand the file to the browser. */
    const got = await pg4.evaluate(async () => {
      let shared = false;
      try {
        shared = /this\.pdfCards\(/.test(String(ICUI.printViaPdf)) &&
                 /this\.pdfCards\(/.test(String(ICUI.pdfAll)) &&
                 !/IDCardPDF\.build\([^)]*html/i.test(String(ICUI.printViaPdf));
      } catch (e) { shared = false; }
      const people = ICUI.exportSource().map(x => ICUI.recordPerson(x, ICUI.tplOpts()));
      let cards = [];
      try { cards = await ICUI.pdfCards(people); } catch (e) { console.warn('pdfCards failed', e); }
      return {
        shared,
        n: people.length,
        front: cards[0] && cards[0].front && cards[0].front.toDataURL ? cards[0].front.toDataURL('image/png') : null,
        backIsCanvas: !!(cards[0] && cards[0].back && cards[0].back.toDataURL)
      };
    });
    ok(got.shared, 'Download and Print both build their cards through the one pdfCards() builder');
    ok(got.n > 0 && !!got.front, 'Print ALL gets photographed cards for every record', got.n);
    if (got.front) {
      const d = await compare(pg4, preview4, got.front);
      ok(d !== null && d < 18, `and the front it would print is the previewed card (${d === null ? 'n/a' : d.toFixed(1)} of 255)`, d);
      ok(got.backIsCanvas, 'the back goes to the printer as the same photographed card, not a look-alike', got.backIsCanvas);
    } else { fail += 2; console.log('  FAIL no card reached the print path'); }
    ok(errs4.length === 0, 'no page errors on the print path', errs4.slice(0, 2));
    await ctx4.close();
  }

  /* ------------------------------------------- CorelDRAW-safe structure ---- */
  console.log('\n=== the object graph a strict reader (CorelDRAW) expects ===');
  for (const [label, file] of [['exact (pictures)', '/tmp/idcard-exact-aurora.pdf'], ['vector', '/tmp/idcard-vector.pdf']]) {
    let out = '';
    let code = 0;
    try {
      out = execFileSync('python3', [path.join('tools', 'verification', 'pdf-struct-check.py'), file], { cwd: ROOT }).toString();
    } catch (e) { code = e.status || 1; out = String(e.stdout || '') + String(e.stderr || ''); }
    const fails = (out.match(/FAIL/g) || []).length;
    ok(code === 0 && fails === 0, `${label}: pdf-struct-check passes (${out.split('\n').filter(l => /^\s+ok/.test(l)).length} structural checks)`, out.split('\n').filter(l => /FAIL/.test(l)).slice(0, 3));
  }
  const aurora = fs.readFileSync('/tmp/idcard-exact-aurora.pdf').toString('latin1');
  ok(/\/MediaBox \[\s*0 0 595\.2\d* 841\.8\d*\s*\]/.test(aurora), 'the page is true A4 in points', aurora.match(/\/MediaBox[^\]]*\]/)?.[0]);
  ok(/\/Type \/XObject \/Subtype \/Image/.test(aurora), 'the card is an image XObject (DCTDecode), which every layout program imports');
  ok(!/\/SMask|\/CA |\/ca /.test(aurora), 'no transparency groups — CorelDRAW and older RIPs dislike them');
} finally { await browser.close(); srv.close(); }

if (fail) { console.error(`\nID CARD PDF FAILED — ${pass} passed, ${fail} failed`); process.exit(1); }
console.log(`\nID CARD PDF OK — ${pass} passed, 0 failed · the download is the preview, design and all, and it opens as a clean PDF.`);

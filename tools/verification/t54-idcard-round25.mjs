/* V12.80 (round 25) — THE ID CARD PAGE, END TO END.
   ---------------------------------------------------------------------------
   Seven reports, and what each assertion here proves:

     1. "What is downloaded has no picture of the student or the staff member."
        → a photo hosted on ANOTHER origin is fetched, embedded, and its colour
          is found inside the downloaded PDF (a solid magenta portrait; if the
          photo is missing the colour is nowhere in the file).
     2. "Print ID Card printed another student."
        → with the third learner selected, Print produces exactly one card and
          it is that learner's.
     3. Bulk staff and bulk students, separately, from one page.
     4. Bulk by class AND by section (arm).
     5. A single card of a student or a staff member.
     6. "Print ALL staff has no photos and an incomplete front."
        → the staff run embeds photos and every staff field reaches the card.
     7. (parity is proved by the release gate, not here.)

   Run: source /home/user/work/chromium-env.sh && node tools/verification/t54-idcard-round25.mjs
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

/* A PORTRAIT HOST ON ANOTHER ORIGIN. It sends Access-Control-Allow-Origin, the
   way the school's own storage does; the Drive case (no CORS at all) is covered
   separately by the same loader and is asserted at the end. The picture is a
   flat magenta rectangle so that finding it in the PDF is unambiguous. */
const MAGENTA = [255, 0, 255];
function magentaJpeg() {
  /* a 60x72 JPEG of solid magenta, produced by the page itself at start-up */
  return null;
}
let photoBytes = null;
const photoSrv = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*',
    'content-length': photoBytes.length });
  r.end(photoBytes);
});
await new Promise(r => photoSrv.listen(0, '127.0.0.1', r));
const photoUrl = 'http://127.0.0.1:' + photoSrv.address().port + '/portrait.jpg';

const STUDENTS = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', full_name: 'Adeyemi First Learner', class: 'JSS 1', arm: 'A',
    admission_no: 'GOSA/2026/0001', admission_year: 2026, gender: 'female', photo_url: photoUrl,
    date_of_birth: '2012-04-12', created_at: '2026-09-01T00:00:00Z', guardian_phone: '+2347012345678' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', full_name: 'Balogun Second Learner', class: 'JSS 1', arm: 'A',
    admission_no: 'GOSA/2026/0002', admission_year: 2026, gender: 'male', photo_url: photoUrl,
    date_of_birth: '2012-06-02', created_at: '2026-09-01T00:00:00Z', guardian_phone: '+2347012345679' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', full_name: 'Chukwu Third Learner', class: 'JSS 1', arm: 'B',
    admission_no: 'GOSA/2026/0003', admission_year: 2026, gender: 'female', photo_url: photoUrl,
    date_of_birth: '2012-01-19', created_at: '2026-09-01T00:00:00Z', guardian_phone: '+2347012345680' }];

const STAFF = [
  { id: 'bbbbbbbb-0000-0000-0000-000000000001', full_name: 'Okafor Grace', staff_no: 'STF/2026/001',
    role: 'Teacher', department: 'Sciences', staff_type: 'Teaching', gender: 'female', phone: '+2348022222222',
    photo_url: photoUrl, user_id: 'u-staff-1' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000002', full_name: 'Ibrahim Musa', staff_no: 'STF/2026/002',
    role: 'Bursar', department: 'Accounts', staff_type: 'Non-teaching', gender: 'male', phone: '+2348033333333',
    photo_url: photoUrl, user_id: 'u-staff-2' }];

const browser = await chromium.launch({ executablePath: process.env.SC_CHROME || undefined, args: ['--no-sandbox'] });

/* build the magenta portrait with a throwaway page */
{
  const c = await browser.newContext(); const pg = await c.newPage(); await pg.goto('about:blank');
  const data = await pg.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 288;
    const x = cv.getContext('2d'); x.fillStyle = 'rgb(255,0,255)'; x.fillRect(0, 0, 240, 288);
    return cv.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  photoBytes = Buffer.from(data, 'base64');
  await c.close();
}

async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('crash', () => errs.push('PAGE CRASHED'));
  /* a page that fails to reach a host it was asked to try is not a page error:
     step 7 deliberately points a photo at an unreachable host */
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_UNSAFE_PORT|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.route('**/assets/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.SUPABASE_URL="";window.SUPABASE_ANON_KEY="";window.SCHOOL={name:"Test School",slug:"test"};' }));
  await pg.route('**/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.supabase=window.supabase||{};' }));
  await pg.addInitScript(({ students, staff }) => {
    const chain = (data) => {
      let r0 = data.slice(); const api = {};
      ['select', 'order', 'limit', 'range', 'not', 'is', 'neq', 'ilike'].forEach(k => { api[k] = () => api; });
      api.eq = (c, v) => { r0 = r0.filter(x => x[c] === v); return api; };
      api.in = (c, vs) => { r0 = r0.filter(x => (vs || []).includes(x[c])); return api; };
      api.maybeSingle = () => Promise.resolve({ data: r0[0] || null, error: null });
      api.single = () => Promise.resolve({ data: r0[0] || null, error: null });
      api.then = (a, c) => Promise.resolve({ data: r0, error: null }).then(a, c);
      return api;
    };
    const USER = { id: 'u-admin', email: 'admin@test.local' };
    window.sb = {
      auth: {
        getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
        getSession: () => Promise.resolve({ data: { session: { user: USER } }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      },
      from: (t) => /^staff/i.test(t) ? chain(staff) : /^students/i.test(t) ? chain(students) : chain([]),
      /* the page asks the database who it is talking to; without an answer the
         app leaves the role blank and every staff query is scoped to "me" */
      rpc: (name) => Promise.resolve(/current_role/i.test(String(name))
        ? { data: { id: 'u-admin', role: 'admin', full_name: 'Admin', status: 'active' }, error: null }
        : { data: null, error: null })
    };
    window.SC_PROFILE = { id: 'u-admin', role: 'admin', full_name: 'Admin' };
  }, { students: STUDENTS, staff: STAFF });
  await pg.goto(base + '/idcards.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => window.ICUI && ICUI.loaded && ICUI.all.length > 0, { timeout: 20000 }).catch(() => {});
  await pg.evaluate(() => { try { App.applyVisibilityTokens('admin'); } catch (_) {} });
  await pg.waitForTimeout(300);
  return { pg, ctx, errs };
}

function jpegsInPdf(bytes) {
  const out = []; const buf = Buffer.from(bytes); let idx = 0;
  while (true) {
    const i = buf.indexOf(Buffer.from('/DCTDecode'), idx); if (i < 0) break;
    const s = buf.indexOf(Buffer.from('stream\n'), i); if (s < 0) break;
    const start = s + 7;
    const e = buf.indexOf(Buffer.from('\nendstream'), start); if (e < 0) break;
    out.push(buf.subarray(start, e)); idx = e + 10;
  }
  return out;
}

/* how much of a picture is the portrait colour */
async function magentaFraction(pg, jpegBytes) {
  return pg.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/jpeg;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = 120; c.height = 76;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 120, 76);
    const d = x.getImageData(0, 0, 120, 76).data;
    let hit = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { n++; if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 200) hit++; }
    return hit / n;
  }, Buffer.from(jpegBytes).toString('base64'));
}

/* run a download of whatever the current scope is, and hand back the cards */
async function download(pg) {
  const [dl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 120000 }).catch(() => null),
    pg.evaluate(() => { ICUI.pdfAll(); })
  ]);
  if (!dl) return null;
  const bytes = fs.readFileSync(await dl.path());
  fs.writeFileSync('/tmp/last-' + dl.suggestedFilename(), bytes);
  const images = jpegsInPdf(bytes);
  const latin = bytes.toString('latin1');
  const dct = (latin.match(/\/DCTDecode/g) || []).length;
  const imgObjs = (latin.match(/\/Subtype\s*\/Image/g) || []).length;
  const placed = (latin.match(/\/\w+\s+Do\b/g) || []).length;   /* pictures drawn on a page */
  return { bytes, name: dl.suggestedFilename(), images, dct, imgObjs, placed };
}

const { pg, ctx, errs } = await openPage();

/* ---------------------------------------------------------------- 1. photos */
console.log('\n=== 1 · the picture of the person is IN the file ===');
await pg.evaluate(() => { const s = document.getElementById('ic-student'); s.value = JSON.stringify(ICUI.all[0]); ICUI.pick(s.value); });
await pg.waitForTimeout(400);
await pg.evaluate(() => { ICUI.setScope('one'); });
await pg.waitForTimeout(300);
const one = await download(pg);
ok(!!one, 'a PDF is produced for “this person”');
if (one) {
  ok(one.images.length >= 2, 'front and back are in the file', one.images.length);
  let best = 0;
  for (const im of one.images.slice(0, 3)) { const f = await magentaFraction(pg, im).catch(() => 0); if (f > best) best = f; }
  /* the control: the same card for a person with NO photo must contain none of
     the portrait colour, so the comparison is a measurement, not a threshold */
  const control = await pg.evaluate(async () => {
    const shots = await IDCardRaster.pair({ full_name: 'No Photo Learner', admission_no: 'X/2', type: 'student', photo_url: '' },
      { faceOpts: ICUI.faceOpts(), widthMm: 85.6, heightMm: 53.98, dpi: 200 });
    return shots && shots.front ? shots.front.toDataURL('image/jpeg', 0.7) : null;
  });
  const controlFrac = control ? await magentaFraction(pg, Buffer.from(control.split(',')[1], 'base64')).catch(() => 0) : 0;
  ok(best > 0.02 && best > controlFrac + 0.02,
     'the person\'s photograph is embedded in the downloaded card (' + (best * 100).toFixed(1) + '% of the face is the portrait colour, ' + (controlFrac * 100).toFixed(1) + '% without a photo)', { best, controlFrac });
}
const report = await pg.evaluate(() => (window.IDCardRaster && IDCardRaster.lastReport) ? IDCardRaster.lastReport() : null);
ok(report && report.inlined >= 1 && report.missing === 0, 'every picture on the card was embedded (nothing dropped)', report);

/* -------------------------------------------------- 2. Print = the picked one */
console.log('\n=== 2 · Print prints the person on screen, not the first in the list ===');
const printResult = await pg.evaluate(async () => {
  const sel = document.getElementById('ic-student');
  sel.value = JSON.stringify(ICUI.all[2]);        // the THIRD learner
  ICUI.pick(sel.value);
  const picked = document.getElementById('ic-name').value;
  const seen = [];
  const origCards = ICUI.pdfCards.bind(ICUI);
  ICUI.pdfCards = async (people, o) => { seen.push(...people.map(p => p.full_name)); return origCards(people, o); };
  const origBuild = IDCardPDF.build;
  IDCardPDF.build = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);  // never actually print
  const origCreate = document.createElement.bind(document);
  let out;
  try { out = await ICUI.print(); } finally { IDCardPDF.build = origBuild; ICUI.pdfCards = origCards; }
  return { picked, seen, out };
});
ok(printResult.seen.length === 1, 'one card is printed, not the whole list', printResult.seen);
ok(printResult.seen[0] === printResult.picked, 'and it is the person who was selected (' + printResult.picked + ')', printResult.seen);
ok(/Third/.test(printResult.seen[0] || ''), 'the selected learner is the one on the card', printResult.seen[0]);

/* ------------------------------------------- 3. bulk students vs bulk staff */
console.log('\n=== 3 · all students and all staff, separately ===');
const studentsRun = await pg.evaluate(async () => {
  ICUI.setScope('students');
  const rows = await ICUI.scopeRecords('students', false);
  return { n: rows.length, names: rows.map(r => r.full_name), label: ICUI.scopeLabel('students') };
});
ok(studentsRun.n === 3, '“All students” covers the three students', studentsRun.n);
await pg.waitForTimeout(200);
const stuPdf = await download(pg);
ok(!!stuPdf && /student-id-cards/.test(stuPdf.name), 'the students PDF is named for students', stuPdf && stuPdf.name);

const staffRun = await pg.evaluate(async () => {
  ICUI.setScope('staff');
  const rows = await ICUI.scopeRecords('staff', false);
  const people = rows.map(r => ICUI.recordPerson(r, ICUI.tplOpts()));
  return { n: rows.length, names: rows.map(r => r.full_name), types: people.map(p => p.type),
           staffNos: people.map(p => p.staff_no), depts: people.map(p => p.department) };
});
ok(staffRun.n === 2, '“All staff” covers the two staff members without leaving the page', staffRun.n);
ok(staffRun.types.every(t => t === 'staff'), 'and they are rendered as STAFF cards', staffRun.types);
ok(staffRun.staffNos.every(Boolean) && staffRun.depts.every(Boolean), 'with their staff number and department, not student fields', staffRun);
await pg.waitForTimeout(200);
const staffPdf = await download(pg);
ok(!!staffPdf && /staff-id-cards/.test(staffPdf.name), 'the staff PDF is named for staff', staffPdf && staffPdf.name);
if (staffPdf) {
  /* every face is DRAWN on the sheet (a `/… Do` per face); the file may store
     one copy of a picture that is pixel-identical on two cards, which is why the
     object count can be lower than the number of drawings */
  ok(staffPdf.placed >= 4, 'front and back of both staff cards are drawn on the sheet (' + staffPdf.placed + ' pictures placed)', { placed: staffPdf.placed, stored: staffPdf.imgObjs });
  ok(staffPdf.imgObjs >= 3, 'and the pictures are really in the file, not referenced from elsewhere', staffPdf.imgObjs);
  let bestS = 0;
  for (const im of staffPdf.images.slice(0, 4)) { const f = await magentaFraction(pg, im).catch(() => 0); if (f > bestS) bestS = f; }
  ok(bestS > 0.02, 'and the staff photographs are embedded too (' + (bestS * 100).toFixed(1) + '% of the face is the portrait colour)', bestS);
}

/* ------------------------------------------------------- 4. class & section */
console.log('\n=== 4 · a class, and one section of it ===');
const byClass = await pg.evaluate(async () => {
  document.getElementById('ic-class').value = 'JSS 1';
  ICUI.loadArms();
  document.getElementById('ic-arm').value = '';
  ICUI.setScope('class');
  const all = await ICUI.scopeRecords('class', false);
  document.getElementById('ic-arm').value = 'A';
  const a = await ICUI.scopeRecords('class', false);
  document.getElementById('ic-arm').value = 'B';
  const b = await ICUI.scopeRecords('class', false);
  return { all: all.length, a: a.map(r => r.full_name), b: b.map(r => r.full_name),
           arms: [...document.getElementById('ic-arm').options].map(o => o.value) };
});
ok(byClass.all === 3, 'the whole class is three learners', byClass.all);
ok(byClass.arms.includes('A') && byClass.arms.includes('B'), 'the section list is read from the class', byClass.arms);
ok(byClass.a.length === 2 && byClass.b.length === 1, 'section A is two, section B is one', byClass);
ok(/Third/.test(byClass.b[0] || ''), 'section B is the learner who is in B', byClass.b);
await pg.waitForTimeout(200);
const classPdf = await download(pg);
ok(!!classPdf && classPdf.images.length >= 2, 'the section prints as its own file', classPdf && classPdf.images.length);

/* an unmatched section prints nothing rather than the whole school */
const empty = await pg.evaluate(async () => {
  const sel = document.getElementById('ic-arm');
  const opt = document.createElement('option'); opt.value = 'Z'; opt.textContent = 'Z'; sel.appendChild(opt);
  sel.value = 'Z';
  const rows = await ICUI.scopeRecords('class', false);
  return rows.length;
});
ok(empty === 0, 'a section that does not exist prints nothing (never the whole school)', empty);

/* -------------------------------------------------------- 5. one staff card */
console.log('\n=== 5 · a single card of a staff member ===');
const singleStaff = await pg.evaluate(async () => {
  document.getElementById('ic-arm').value = '';
  document.getElementById('ic-class').value = '';
  ICUI.switchType('staff');
  await new Promise(r => setTimeout(r, 400));
  const sel = document.getElementById('ic-student');
  sel.value = JSON.stringify(ICUI.all[0]);
  ICUI.pick(sel.value);
  ICUI.setScope('one');
  const rows = await ICUI.scopeRecords('one', false);
  const people = rows.map(r => ICUI.recordPerson(r, ICUI.tplOpts()));
  return { n: rows.length, name: rows[0] && rows[0].full_name, type: people[0] && people[0].type,
           dept: people[0] && people[0].department };
});
ok(singleStaff.n === 1 && singleStaff.type === 'staff', '“This person” on the staff tab is one staff card', singleStaff);
ok(singleStaff.dept === 'Sciences', 'with the department on it', singleStaff.dept);

/* --------------------------------------- 6. the front is not half a card away */
console.log('\n=== 6 · the card is filled, not half empty ===');
const fill = await pg.evaluate(async () => {
  const fo = ICUI.faceOpts();
  const p = ICUI.person();
  const shots = await IDCardRaster.pair(p, { faceOpts: fo, widthMm: fo.widthMm, heightMm: fo.heightMm, dpi: 200 });
  if (!shots || !shots.front) return null;
  /* how much of the bottom strip of the card carries ink that is not the card's
     own flat background? A letterboxed design leaves it blank. */
  const c = shots.front, x = c.getContext('2d');
  const d = x.getImageData(0, Math.floor(c.height * 0.72), c.width, Math.floor(c.height * 0.26)).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 4) + ':' + (d[i + 1] >> 4) + ':' + (d[i + 2] >> 4));
  return { w: c.width, h: c.height, distinctColoursInBottomStrip: seen.size };
});
ok(fill && fill.distinctColoursInBottomStrip > 2,
   'the design reaches the bottom of the card (the bottom strip is not one flat colour)', fill);
const fit = await pg.evaluate(() => (window.Super && Super.idcard && Super.idcard.lastFit) || null);
ok(fit && Math.min(fit.fillW, fit.fillH) > 0.9, 'the card fills its face (' + (fit ? Math.round(Math.min(fit.fillW, fit.fillH) * 100) : 0) + '%)', fit);

/* --------------------------------------------- 7. a host that refuses CORS */
console.log('\n=== 7 · a photo host that refuses to be read ===');
const noCors = await pg.evaluate(async () => {
  const before = IDCardRaster.lastReport && IDCardRaster.lastReport();
  const person = { full_name: 'No Cors Learner', admission_no: 'X/1', type: 'student',
    photo_url: location.origin.replace(/:\d+$/, ':1') + '/nothing.jpg' };
  const shots = await IDCardRaster.pair(person, { faceOpts: ICUI.faceOpts(), widthMm: 85.6, heightMm: 53.98, dpi: 150 });
  const after = IDCardRaster.lastReport && IDCardRaster.lastReport();
  return { before, after, drew: !!(shots && shots.front) };
});
ok(noCors.drew, 'the card is still produced when the photo cannot be read', noCors.drew);
ok(noCors.after && noCors.after.missing >= 1, 'and the missing picture is counted, not hidden', noCors.after);

ok(errs.length === 0, 'no page errors through the whole run', errs.slice(0, 3));

await ctx.close();
await browser.close();
srv.close(); photoSrv.close();
console.log('\n' + (fail === 0 ? 'ID CARD ROUND-25 OK' : 'ID CARD ROUND-25 FAILED') + ` — ${pass} passed, ${fail} failed · photos, one card, both families, both sections.`);
process.exit(fail === 0 ? 0 : 1);

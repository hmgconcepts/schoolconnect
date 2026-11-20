/* V12.77 — THE TWO FACES OF ONE CARD
   ---------------------------------------------------------------------------
   The report that started this: "the back page of the ID card for the different
   professional templates is fixed to landscape orientation" and "when the
   orientation is the same, front and back do not have the same size".

   Both are measurable, so this harness measures them in a real browser for
   every professional template, in both orientations, at two real card sizes:

     • front and back must be THE SAME BOX (width and height, ±1 px);
     • the artwork inside each face must be SCALED BY THE SAME FACTOR, so the
       two faces cannot look like different cards even when a design has to be
       letterboxed to fit;
     • a design drawn for the card's own shape must FILL it (≥95%), because a
       card that is 40% margin is not a card;
     • every template in the registry must render, must carry its own back
       family, and must be offered by the page's dropdown.

   Run:  node tools/verification/t42-idcard-faces.mjs [repoRoot]
   ========================================================================== */
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = process.argv[2] || '/home/user/repos/gosaportal';
const srv = http.createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/' || p === '/blank.html') {
    rs.writeHead(200, { 'content-type': 'text/html' });
    return rs.end('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="host"></div></body></html>');
  }
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
  const type = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
  rs.writeHead(200, { 'content-type': type });
  fs.createReadStream(f).pipe(rs);
});
await new Promise(r => srv.listen(0, '0.0.0.0', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const fails = [], notes = [];
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await pg.goto(base + '/blank.html', { waitUntil: 'domcontentloaded' });
await pg.addScriptTag({ url: base + '/assets/js/super.js' });
await pg.addScriptTag({ url: base + '/assets/js/qrcode-generator.js' });

const result = await pg.evaluate(async () => {
  window.Super.school = {
    name: 'GoSA International College', shortName: 'GOSA', motto: 'Knowledge · Character · Service',
    address: '12 Marina Road, Lagos', phone: '+234 800 000 0000', email: 'office@gosa.test',
    primary: '#1e3a8a', accent: '#0ea5e9', logoExt: 'svg'
  };
  if (window.Super.init) { try { window.Super.init(null, window.Super.school); } catch (_) {} }
  const id = Super.idcard;
  const person = {
    full_name: 'Olatunbosun Faith Oladunni', admission_no: 'GOSA/2026/0005',
    class: 'SSS 1', arm: 'A', date_of_birth: '2009-04-12', blood_group: 'O+',
    gender: 'female', type: 'student', phone: '+234 701 234 5678'
  };
  const sizes = { id1: [85.6, 53.98], custom: [100, 60] };
  const host = document.getElementById('host');
  const out = { templates: id.TEMPLATES.map(t => t.id), rows: [] };

  for (const tpl of id.TEMPLATES.map(t => t.id)) {
    for (const [sizeName, mm] of Object.entries(sizes)) {
      for (const orient of ['landscape', 'portrait']) {
        const w = orient === 'portrait' ? mm[1] : mm[0];
        const h = orient === 'portrait' ? mm[0] : mm[1];
        const opts = { widthMm: w, heightMm: h, template: tpl, pc: '#1e3a8a', ac: '#0ea5e9' };
        host.innerHTML = '<div style="position:absolute;left:0;top:0">' + id.pairHtml(person, opts) + '</div>';
        const faces = [...host.querySelectorAll('.sc-idcard-face')];
        if (faces.length !== 2) { out.rows.push({ tpl, sizeName, orient, error: 'expected 2 faces, saw ' + faces.length }); continue; }
        /* decorations are meant to run off the edge; only in-flow content that
           is cut off counts as a defect */
        const inFlowOverflow = (card, axis) => {
          const r = card.getBoundingClientRect();
          let maxR = r.left, maxB = r.top;
          card.querySelectorAll('*').forEach(n => {
            const cs = getComputedStyle(n);
            if (cs.position === 'absolute' || cs.position === 'fixed') return;
            const b = n.getBoundingClientRect();
            if (!b.width && !b.height) return;
            if (b.right > maxR) maxR = b.right;
            if (b.bottom > maxB) maxB = b.bottom;
          });
          return axis === 'x' ? Math.max(0, Math.round(maxR - r.right)) : Math.max(0, Math.round(maxB - r.bottom));
        };
        const measure = (f) => {
          const r = f.getBoundingClientRect();
          const scale = f.querySelector('.sc-idcard-scale');
          const s = scale ? scale.getBoundingClientRect() : null;
          const card = f.querySelector('.sc-idcard');
          return {
            w: Math.round(r.width), h: Math.round(r.height),
            cw: s ? Math.round(s.width) : Math.round(r.width),
            ch: s ? Math.round(s.height) : Math.round(r.height),
            scrollW: card ? card.scrollWidth : 0, cardW: card ? card.clientWidth : 0,
            html: card ? card.outerHTML.slice(0, 600) : '',
            /* the ARTWORK's own painted box — the thing the eye compares */
            aw: card ? Math.round(card.getBoundingClientRect().width) : 0,
            ah: card ? Math.round(card.getBoundingClientRect().height) : 0,
            /* is anything inside the painted card cut off? */
            clipX: card ? inFlowOverflow(card, 'x') : 0,
            clipY: card ? inFlowOverflow(card, 'y') : 0
          };
        };
        const front = measure(faces[0]), back = measure(faces[1]);
        out.rows.push({
          tpl, sizeName, orient,
          expected: { w: Math.round(w * 96 / 25.4), h: Math.round(h * 96 / 25.4) },
          front: { w: front.w, h: front.h, cw: front.cw, ch: front.ch, aw: front.aw, ah: front.ah, clipX: front.clipX, clipY: front.clipY },
          back: { w: back.w, h: back.h, cw: back.cw, ch: back.ch, aw: back.aw, ah: back.ah, clipX: back.clipX, clipY: back.clipY },
          family: (host.querySelector('[data-back-family]') || {}).dataset ?
                  host.querySelector('[data-back-family]').dataset.backFamily : '',
          frontTpl: (host.querySelector('.sc-idcard[data-template]') || {}).dataset ?
                    host.querySelector('.sc-idcard[data-template]').dataset.template : '',
          backTpl: (host.querySelector('[data-back-template]') || {}).dataset ?
                   host.querySelector('[data-back-template]').dataset.backTemplate : '',
          hasQr: host.innerHTML.split('<img').length - 1,
          /* V12.77 — the front must actually BE this template. Two templates
             that render the same bytes mean the choice is being ignored, which
             is exactly the bug a size-only test cannot see. */
          frontHash: (function(){ let h=0; const t=front.html; for(let i=0;i<t.length;i++) h=((h<<5)-h+t.charCodeAt(i))|0; return (h>>>0).toString(36); })(),
          frontLen: front.html.length
        });
      }
    }
  }
  host.innerHTML = '';
  return out;
});

await b.close(); srv.close();

/* ---------------------------------------------------------------- checks ---- */
const rows = result.rows || [];
if (!rows.length) fails.push('nothing rendered');
const tplIds = new Set(result.templates);
for (const t of ['premium', 'executive', 'minimal', 'gradient', 'badge', 'smart', 'heritage', 'vertical', 'corporate', 'crest', 'clinical', 'aurora', 'metro'])
  if (!tplIds.has(t)) fails.push('the template registry does not offer ' + t);

let worstBox = 0, worstContent = 0, worstArt = 0, checked = 0;
for (const r of rows) {
  if (r.error) { fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: ${r.error}`); continue; }
  checked++;
  const dW = Math.abs(r.front.w - r.back.w), dH = Math.abs(r.front.h - r.back.h);
  const dCw = Math.abs(r.front.cw - r.back.cw), dCh = Math.abs(r.front.ch - r.back.ch);
  worstBox = Math.max(worstBox, dW, dH);
  worstContent = Math.max(worstContent, dCw, dCh);
  if (dW > 1 || dH > 1) fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: FRONT AND BACK ARE DIFFERENT SIZES (${r.front.w}x${r.front.h} vs ${r.back.w}x${r.back.h})`);
  if (dCw > 1 || dCh > 1) fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: the artwork in the two faces is scaled differently (${r.front.cw}x${r.front.ch} vs ${r.back.cw}x${r.back.ch})`);
  /* the painted card itself, not its wrapper: a back drawn on a smaller canvas
     and scaled by the front's factor passes every wrapper test and still looks
     like a smaller card — which is precisely what was reported */
  const dAw = Math.abs(r.front.aw - r.back.aw), dAh = Math.abs(r.front.ah - r.back.ah);
  worstArt = Math.max(worstArt, dAw, dAh);
  if (dAw > 1 || dAh > 1) fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: THE BACK CARD IS A DIFFERENT SIZE (${r.front.aw}x${r.front.ah} vs ${r.back.aw}x${r.back.ah})`);
  /* nothing may be cut off: a name, an ID number or a rule that runs off the
     card is a printing defect, not a design choice */
  if (r.front.clipX > 2 || r.front.clipY > 2) fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: the FRONT is clipped (${r.front.clipX}px across, ${r.front.clipY}px down)`);
  if (r.back.clipX > 2 || r.back.clipY > 2) fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: the BACK is clipped (${r.back.clipX}px across, ${r.back.clipY}px down)`);
  /* both faces must be the CARD's own box, not their own idea of it */
  if (Math.abs(r.front.w - r.expected.w) > 2 || Math.abs(r.front.h - r.expected.h) > 2)
    fails.push(`${r.tpl}/${r.sizeName}/${r.orient}: the face is ${r.front.w}x${r.front.h}px but the card is ${r.expected.w}x${r.expected.h}px`);
  /* the back must belong to the family of its front, and to its template */
  if (!r.family) fails.push(`${r.tpl}: the back carries no family marker`);
  if (r.backTpl !== r.tpl) fails.push(`${r.tpl}: the back was drawn for "${r.backTpl || 'nothing'}" instead of this template`);
  if (r.frontTpl && r.frontTpl !== r.tpl) fails.push(`${r.tpl}: the front tagged itself "${r.frontTpl}"`);
  if (r.hasQr < 2) fails.push(`${r.tpl}/${r.orient}: a face is missing its QR code`);
}
/* every template must render DIFFERENTLY — a menu that changes nothing is worse
   than a short menu */
/* within ONE size and ONE orientation every template must render differently:
   a menu whose options all draw the same card is worse than a short menu */
for (const sizeName of ['id1', 'custom']) {
  for (const orient of ['landscape', 'portrait']) {
    const group = rows.filter(r => !r.error && r.sizeName === sizeName && r.orient === orient);
    const distinct = new Set(group.map(r => r.frontHash));
    if (distinct.size !== tplIds.size)
      fails.push(`at ${sizeName}/${orient}, ${tplIds.size} templates produced only ${distinct.size} distinct designs — the choice is being ignored`);
  }
}

if (errs.length) fails.push('page errors: ' + errs.slice(0, 4).join(' | '));

/* every template must FILL a card of its own shape (no 40%-margin card) */
const native = rows.filter(r => r.sizeName === 'id1' &&
  ((r.orient === 'portrait') === new Set(['badge', 'vertical', 'metro']).has(r.tpl)));
for (const r of native) {
  const fillW = r.front.cw / r.front.w, fillH = r.front.ch / r.front.h;
  const fill = Math.min(fillW, fillH);
  if (fill < 0.95) fails.push(`${r.tpl}/${r.orient}: the design fills only ${(fill * 100).toFixed(1)}% of a card of its own shape`);
}

/* the page must offer every template the engine knows */
const page = fs.readFileSync(path.join(ROOT, 'idcards.html'), 'utf8');
if (!/refreshTemplateMenu/.test(page)) fails.push('idcards.html never builds its dropdown from the registry');
if (!/templateOptions/.test(page)) fails.push('idcards.html does not call templateOptions()');
for (const t of tplIds) {
  if (!new RegExp('value="' + t + '"').test(page)) fails.push('the dropdown has no option for ' + t);
}

console.log(`rendered ${checked} card pairs across ${tplIds.size} templates`);
console.log(`worst face-size difference: ${worstBox}px · worst wrapper difference: ${worstContent}px · worst painted-card difference: ${worstArt}px`);
console.log('pageerrors:', errs.length);
if (fails.length) {
  console.error('\nID CARD FACES FAILED:\n  ' + fails.slice(0, 25).join('\n  '));
  process.exit(1);
}
console.log('\nID CARD FACES OK — one card, two faces, one size, one orientation, every professional template.');

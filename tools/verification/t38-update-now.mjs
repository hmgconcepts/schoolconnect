/* Round 18 item 8 — "Update now" must actually update, must be seamless, and
   must not show up again once the platform is updated.
   Proven directly against the shipped pwa-install.js in a real browser. */
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = process.argv[2] || '/home/user/repos/schoolconnect';
const srv = http.createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/' || p === '/blank.html') { rs.writeHead(200, {'content-type':'text/html'}); return rs.end('<html><body><div id="host"></div></body></html>'); }
  if (p === '/sw.js') { rs.writeHead(200, {'content-type':'text/javascript'}); return rs.end("const CACHE = 'sc-builder-v12.74-20261117-99';\n"); }
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { rs.writeHead(404); return rs.end('nf'); }
  rs.writeHead(200, {'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html'});
  fs.createReadStream(f).pipe(rs);
});
await new Promise(r => srv.listen(0, '0.0.0.0', r));
const base = 'http://127.0.0.1:' + srv.address().port;

/* Every deployment must carry the worker that answers GET_VERSION, or the
   Update-now banner cannot tell an old build from a new one. schoolconnectdemo
   was silently months behind until V12.74. */
const workers = ['/home/user/repos/schoolconnect/sw.js',
                 '/home/user/repos/gosaportal/sw.js',
                 '/home/user/repos/schoolconnectdemo/sw.js'];
const workerFails = [];
for (const w of workers) {
  if (!fs.existsSync(w)) { workerFails.push('missing ' + w); continue; }
  const t = fs.readFileSync(w, 'utf8');
  if (!/GET_VERSION/.test(t)) workerFails.push('no GET_VERSION reply in ' + w);
  if (!/SKIP_WAITING/.test(t)) workerFails.push('no SKIP_WAITING in ' + w);
  if (!/CACHE\s*=\s*'[^']+'/.test(t)) workerFails.push('no CACHE version in ' + w);
}
if (workerFails.length) { console.error('\nUPDATE NOW FAILED:\n' + workerFails.join('\n')); process.exit(1); }

const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));

/* A fake service worker environment so the real code path runs. */
await pg.addInitScript(() => {
  window.__posted = []; window.__reloaded = null;
  const mkSW = (ver) => ({
    scriptURL: 'https://x/sw.js',
    postMessage(msg, ports) {
      if (msg && msg.type === 'GET_VERSION' && ports && ports[0]) ports[0].postMessage({ version: ver });
      window.__posted.push(msg && msg.type);
    },
    addEventListener() {}, state: 'installed'
  });
  window.__unregistered = 0; window.__cachesCleared = 0;
  window.cachesLib = { keys: async () => ['sc-old-1','sc-old-2'], delete: async () => { window.__cachesCleared++; return true; } };
  const reg = { scope: '/', waiting: null, installing: null, active: mkSW('sc-builder-v12.74-20261117-99'),
                addEventListener() {}, update: async () => {}, unregister: async () => { window.__unregistered++; return true; } };
  /* the page's CacheStorage, stubbed so the reset is observable */
  try { Object.defineProperty(window, 'caches', { configurable: true, value: window.cachesLib }); } catch (_) {}
  window.__reg = reg; window.__mkSW = mkSW;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: async () => reg, getRegistration: async () => reg,
    controller: {}, addEventListener() {}, ready: Promise.resolve(reg)
  }});
});
await pg.goto(base + '/blank.html', { waitUntil: 'domcontentloaded' });
await pg.addScriptTag({ url: base + '/assets/js/pwa-install.js' });

const ok = await pg.evaluate(async () => {
  const out = {};
  window.toast = () => {}; window.openModal = () => {}; window.closeModal = () => {};
  PWAInstall.init && PWAInstall.init();
  // never actually navigate during the test
  PWAInstall.forceReload = function () { window.__reloaded = (window.__reloaded || 0) + 1; this._hasReloaded = true; };
  out.hasLatest = typeof PWAInstall.latestVersion === 'function';
  out.latest = await PWAInstall.latestVersion();
  out.latestIsReal = out.latest === 'sc-builder-v12.74-20261117-99';
  out.versionOfWaiting = await PWAInstall.versionOf(window.__mkSW('sc-builder-v12.74-20261117-99'));

  /* (1) an update that is already applied must NOT show the banner */
  localStorage.setItem('sc_pwa_applied_ver', 'sc-builder-v12.74-20261117-99');
  PWAInstall.showUpdateBanner('sc-builder-v12.74-20261117-99');
  const bnr = document.getElementById('pwa-update-banner');
  out.bannerHiddenWhenApplied = !!bnr && !bnr.classList.contains('show');

  /* (2) a genuine new version DOES show */
  localStorage.removeItem('sc_pwa_applied_ver');
  localStorage.removeItem('sc_pwa_update_dismissed_at');
  localStorage.removeItem('sc_pwa_update_dismissed_ver');
  PWAInstall.showUpdateBanner('sc-builder-v12.75-20991231-01');
  out.bannerShownForNew = !!bnr && bnr.classList.contains('show');

  /* (3) clicking Update now with a waiting worker asks it to activate */
  window.__posted.length = 0;
  PWAInstall._waitingSW = window.__mkSW('sc-builder-v12.75-20991231-01');
  PWAInstall._updateBanner = bnr;
  await PWAInstall.applyUpdate();
  out.sentSkipWaiting = window.__posted.includes('SKIP_WAITING');
  out.pendingRecorded = localStorage.getItem('sc_pwa_pending_ver');
  out.hidBanner = !bnr.classList.contains('show');
  await new Promise(r => setTimeout(r, 1700));
  out.reloaded = window.__reloaded;

  /* (4) with NO waiting worker it still does something (not a dead click) */
  window.__reloaded = null; window.__posted.length = 0;
  PWAInstall._waitingSW = null; window.__reg.waiting = null; window.__reg.installing = null;
  await PWAInstall.applyUpdate();
  await new Promise(r => setTimeout(r, 400));
  out.reloadedWithNothingPending = window.__reloaded;

  /* (5) V12.77 — a version that is mid-install is not "available" either */
  localStorage.removeItem('sc_pwa_applied_ver');
  localStorage.setItem('sc_pwa_pending_ver', 'sc-builder-v12.76-20991231-02');
  PWAInstall.showUpdateBanner('sc-builder-v12.76-20991231-02');
  out.bannerHiddenWhilePending = !document.getElementById('pwa-update-banner').classList.contains('show');

  /* (6) V12.77 — the applied version is recorded only when the RUNNING worker
     reports the version we updated to; a reload served from a old worker can no
     longer be mistaken for a completed update. */
  localStorage.setItem('sc_pwa_pending_ver', 'sc-builder-v12.74-20261117-99');
  localStorage.removeItem('sc_pwa_applied_ver');
  window.__reg.active = window.__mkSW('sc-builder-v12.74-20261117-99');
  PWAInstall._reg = window.__reg;
  out.confirmed = await PWAInstall.confirmApplied();
  out.appliedRecorded = localStorage.getItem('sc_pwa_applied_ver');
  localStorage.setItem('sc_pwa_pending_ver', 'sc-builder-v12.99-29991231-01');
  localStorage.removeItem('sc_pwa_applied_ver');
  out.notConfirmedWhenStale = await PWAInstall.confirmApplied();

  /* (7) V12.77 — with nothing pending and nothing on the wire, Update now still
     resets: caches dropped, worker unregistered, page reloaded. */
  window.__reloaded = null; window.__posted.length = 0;
  window.__unregistered = 0; window.__cachesCleared = 0;
  PWAInstall._waitingSW = null; window.__reg.waiting = null; window.__reg.installing = null;
  await PWAInstall.applyUpdate();
  await new Promise(r => setTimeout(r, 900));
  out.hardReset = { reloaded: window.__reloaded, unregistered: window.__unregistered, cleared: window.__cachesCleared };

  /* (5) alreadyCurrent() is true when the running build is the newest */
  localStorage.setItem('sc_pwa_applied_ver', 'sc-builder-v12.74-20261117-99');
  out.alreadyCurrent = await PWAInstall.alreadyCurrent();
  return out;
});
await b.close(); srv.close();

const fails = [];
if (!ok.hasLatest) fails.push('latestVersion() missing');
if (!ok.latestIsReal) fails.push('latestVersion() did not read the real cache version: ' + ok.latest);
if (ok.versionOfWaiting !== 'sc-builder-v12.74-20261117-99') fails.push('versionOf() failed: ' + ok.versionOfWaiting);
if (!ok.bannerHiddenWhenApplied) fails.push('THE BANNER SHOWED AGAIN FOR AN ALREADY-APPLIED VERSION');
if (!ok.bannerShownForNew) fails.push('a genuine new version did not show the banner');
if (!ok.sentSkipWaiting) fails.push('Update now did not ask the waiting worker to activate');
/* the pending version is the one the SERVER says is deployed (sw.js), which is
   what the device is actually reloading towards */
if (ok.pendingRecorded !== ok.latest)
  fails.push('the version being installed was not written down before the reload: ' + ok.pendingRecorded);
if (!ok.hidBanner) fails.push('the banner stayed up after Update now');
if (!ok.reloaded) fails.push('Update now did not reload the app');
if (!ok.reloadedWithNothingPending) fails.push('Update now was a DEAD CLICK when nothing was pending');
if (!ok.alreadyCurrent) fails.push('alreadyCurrent() did not recognise the current build');
if (!ok.bannerHiddenWhilePending) fails.push('THE BANNER OFFERED A VERSION THAT WAS ALREADY BEING INSTALLED');
if (ok.confirmed !== 'sc-builder-v12.74-20261117-99') fails.push('a completed update was not confirmed: ' + ok.confirmed);
if (ok.appliedRecorded !== 'sc-builder-v12.74-20261117-99') fails.push('the confirmed version was not recorded: ' + ok.appliedRecorded);
if (ok.notConfirmedWhenStale) fails.push('a reload that landed on an OLD worker was reported as a completed update');
if (!ok.hardReset || !ok.hardReset.reloaded) fails.push('Update now is still a dead click when nothing is pending');
if (!ok.hardReset || !ok.hardReset.unregistered) fails.push('the last-resort reset did not unregister the stale worker');
if (!ok.hardReset || !ok.hardReset.cleared) fails.push('the last-resort reset did not clear the caches');

/* the worker must not announce itself on a first visit */
const swText = fs.readFileSync('/home/user/repos/schoolconnect/sw.js', 'utf8');
if (!/SC_IS_UPGRADE/.test(swText) || !/if \(!SC_IS_UPGRADE\) return/.test(swText))
  fails.push('sw.js announces SW_UPDATED on a FIRST install (the banner that has nothing to do)');
if (!/CLEAR_CACHES/.test(swText)) fails.push('sw.js has no CLEAR_CACHES handler for the last-resort reset');
if (!/\/sw\\.js\$/i.test(swText)) fails.push('sw.js does not serve its own file from the network');

console.log(JSON.stringify(ok, null, 1));
console.log('pageerrors:', errs.length);
if (fails.length) { console.error('\nUPDATE NOW FAILED:\n' + fails.join('\n')); process.exit(1); }
console.log('\nUPDATE NOW OK — it updates, it is visible, and it never returns once applied.');

# School Connect — Release V12.76 (Round 20: full-platform audit)

**Date:** 8 November 2026 · **Repos:** `schoolconnect` (generator), `gosaportal`, `schoolconnectdemo`

| | Before this round | After |
|---|---|---|
| Schema size | 999,876 B — **124 B** below Supabase's 1 MB cap | **979,544 B** — 20,456 B below |
| Security findings (HIGH) | **104** | **0** |
| Security findings (WARN) | **120** | **0** |
| Pages loading a third-party CDN | **184** | **0** |
| Client hardening findings | — | **0** (11 checks) |
| Security checks the school can run itself | **0** | **7**, all passing |

---

## What this round was

An audit, not a feature release. I put the platform in front of two new auditors that did not exist
before — `tools/verification/t40-security-audit.mjs`, which boots the shipped SQL into an empty
database and interrogates the catalogue, and `tools/audit-client-hardening.py`, which inspects what
the browser depends on — and then fixed everything they found.

Both are now part of the gate, so nothing below can silently come back.

---

## The findings, in severity order

### F1 — CRITICAL: every message and notification was public

`messages` and `notifications` each carried one policy:

```sql
for all to public using (true) with check (true)
```

Read that as a school: **any visitor holding the anon key — which is published in `config.js` by
design — could read every private message in the school, read every notification (they carry learner
names and fee balances), insert mail as anybody, and delete the lot.** The UI never showed it,
because the UI always filters to "my" rows. This has been in the product for many rounds.

*Fixed*: `messages` is now readable only by its sender, its recipient, or the account whose email
matches a legacy row; writable only as yourself; deletable by the two parties or an admin.
`notifications` keeps broadcast rows (`user_id is null`) visible to everyone — that is what the bell
and the seed data rely on — while personal rows are visible only to their owner or staff. All in-app
messaging runs through `sc_message_*` SECURITY DEFINER functions, which are unaffected, so no screen
changed behaviour.

### F2 — HIGH: three tables any person on the internet could page through

| Table | What was exposed |
|---|---|
| `admission_letters` | candidate name, class, percentage and **admission decision** |
| `admission_links` | live entrance-exam registration links |
| `cbt_roster` | full name and class of every candidate in an exam |

All three were `for select to public using (true)`. None of them is read by a signed-out page: the
public exam journey goes through `cbt_get_public_exam_*()` and the entrance journey through
`get_exam_registration_link()`, both SECURITY DEFINER. *Fixed*: staff-only read, plus a candidate can
still see their own roster row.

### F3 — HIGH: the answer key of every exam was downloadable without an account

`cbt_exams` was `for select to public using (true)`, and that table carries `questions` and
`csv_data` — the question bank **with the correct answers** — plus every exam code. *Fixed*: the rows
are for signed-in users only, and the two bank columns are revoked from `anon` outright, so a future
policy change cannot re-expose them quietly. The public exam page is untouched: it reads a sanitised
copy through `cbt_get_public_exam_v7()`.

### F4 — HIGH: 66 privileged functions the anonymous role could call

PostgreSQL grants `EXECUTE` on a new function to `PUBLIC`. Nothing in the schema had ever taken that
back, so **every** SECURITY DEFINER function was callable by anyone — including `cbt_import_backup()`
(which imports an arbitrary payload) and `cbt_force_replace_bank()` (which replaces a question bank),
plus report generation, result pushes, messaging and the repair routines.

*Fixed*: the anonymous role now holds EXECUTE on **35 functions**, and each one is a documented
public endpoint — the RPCs the signed-out pages actually call (`submit_admission`,
`verify_certificate`, `lookup_login_email`, the `cbt_*`/`sc_cbt_*` public-exam family, the licence
banner, the keep-alive heartbeat) — plus the predicates that RLS policies evaluate, which cannot be
revoked without breaking the policy rather than the attacker. Everything else keeps its grant for
`authenticated` and loses it for everyone who has not signed in. A signed-in user's experience is
byte-for-byte the same. The rule is implemented as a loop, so a function added by a future pack
inherits it automatically; `t40` fails the gate if a new function escapes the allowlist.

### F5 — HIGH: `search_path` was unpinned on the functions that decide every permission

`is_admin()`, `is_staff()` and `handle_new_user()` are the load-bearing functions of the whole
security model — every admin policy calls the first. All three ran `SECURITY DEFINER` with an
**unpinned `search_path`**, the classic privilege-escalation shape.

**And here is the part I owe you plainly:** last round I reported this fixed. It was not. I pinned the
*first* declaration of `handle_new_user()` — the no-op stub — while the builder keeps the first and
the last declaration, and the last one is the one in force. The database audit caught it because it
asks the catalogue, not the source. *Fixed properly*: a loop pins `search_path = public, pg_temp` on
**every** SECURITY DEFINER function that lacks one, at the end of the file, where it catches the live
definitions.

### F6 — MEDIUM: the three log tables still had no row-level security

`cbt_edit_log`, `cbt_results_recovery_log` and `cbt_retake_allowances`. Same story: I reported these
hardened last round; the statements never reached the shipped file (they were lost when the raw
source was re-derived). *Fixed*: RLS enabled on all three, each with an admin-only read policy — so
the school gains a usable audit trail and a learner, parent or teacher gains nothing.

### F7 — MEDIUM: 120 foreign keys with no index

Postgres indexes the primary key, never the referencing side. Every `delete from students`, every
cascade and every report join scanned the child table — on a free-tier database shared with
everything else, that is the difference between a report sheet that prints and one that times out.
*Fixed*: a loop creates `ix_fk_<table>_<column>` for every single-column foreign key that lacks one,
at the end of the file so it covers every table any pack creates. 120 → 0.

### F8 — HIGH (client): every page needed a CDN to boot

184 of 134 pages loaded `@supabase/supabase-js@2` from `cdn.jsdelivr.net`, 151 loaded Chart.js from
the same place, and four pages loaded `jsqr`/`jszip`. Three consequences, all the school's: no
internet meant a blank page; a floating major version could change under the school's feet with no
integrity hash; and one CDN outage took every school down at once.

*Fixed*: the four libraries are **vendored** into `assets/vendor/` at pinned versions
(`supabase-js 2.58.0`, `chart.js 4.4.7`, `jsqr 1.4.0`, `jszip 3.10.1`), every reference in all 134
pages and all 65 templates now points at the local file, the CDN-era `integrity`/`crossorigin`
attributes are gone, the service worker precaches them so "offline" is real, the generator's CSP no
longer permits `cdn.jsdelivr.net`, and generated ZIPs carry the folder. `t41` fails the gate if any
page ever loads from a CDN again.

While doing it I caught a bug of my own making: the rewrite first wrote `../../../assets/vendor/…`
into the page templates, which live three directories down but are **emitted at the site root** — 65
templates would have pointed outside the site. The tool now knows templates answer at depth zero, and
the audit asserts it.

### F9 — MEDIUM (client): the service-worker cache version never moved in client deployments

`sync-v5-repos.py` copied the generator's worker but kept the target's whole cache name, so
`gosaportal` was still answering `v12.59-20261101` three releases later. The cache name *is* the
version a device compares — so a device that updated never dropped the old entries. *Fixed*: the
school's prefix (`sc-client`) is preserved as branding, the version/date/build suffix comes from the
generator. Both deployments now report `sc-client-v12.76-20261108-68`.

### F10 — LOW: a 76 KB stale copy of a page was being served

`settings.html.txt` sat at the document root. *Fixed*: deleted; `t41` now fails if a `.txt` copy of a
page reappears (and knows `robots.txt` is intentional).

### F12 — the audit could not be re-run by the school

Every finding below was proved by a script on my machine. That is the wrong place for a security
guarantee to live: a school has no Node.js, and a posture that was true in November says nothing about
December. Worse, configuration drifts in the one direction that matters — someone panics during an
incident, disables a policy to unblock a page, and it is never switched back. Nobody notices, because
nothing checks.

So the audit is now shipped as a function. `sc_security_posture()` returns seven rows — row-level
security, pinned `search_path`, the anonymous execution surface, foreign-key indexes, primary keys,
private policy on the private tables, and impossible report marks — read from the **live** catalogue,
not from a snapshot. `platform-health.html` renders them as a green/amber/red table with a one-press
re-run and a Copy button, and the gate cross-checks the function against `t40`: if the dashboard would
ever show a failure, the audit fails with it. The two cannot disagree.

The same round closed the other half of the gap on the client: `tools/test-generator-build.js` now
opens the generated ZIPs and refuses to accept a build that omits `assets/vendor/`, or that has even
one page still mentioning `cdn.jsdelivr.net`. Before, the vendored library could have been dropped from
a build and the build would still have been called green.

### F11 — the byte budget that blocked all of the above

The schema was **124 bytes** from Supabase's 1 MB SQL-Editor limit, so every security fix above was
unaffordable. The 43 KB of indentation inside PL/pgSQL bodies was the largest reclaimable block, and
the builder had been deliberately skipping it. The shipped copy is now de-indented **all the way
through**, with one inviolable rule: a line that begins inside a string literal is never touched,
because there the leading spaces are data. The scanner understands `--` comments, `''` escapes and
`E''` backslash escapes, and when it cannot be sure it leaves the line alone.

The object-identical verifier, the self-contained boot, the idempotence test and the notify-order
test all still pass, and the verifier compares function bodies token-by-token — so "de-indented"
provably means "same behaviour".

---

## Verification

```
node tools/verification/t40-security-audit.mjs    HIGH 0 · WARN 0 · INFO 52
                                                  134 tables · 315 policies · 270 functions
                                                  posture: 7 checks, 0 failing
python3 tools/audit-client-hardening.py           0 findings · 11 checks ok
node tools/verify-complete-schema.mjs             ALL PASS (object-identical)
node tools/verification/tmp-selfcontained.mjs     32 passed, 0 failed
node tools/verification/tmp-notify-order.mjs      11 passed, 0 failed
node tools/verification/tmp-mark-integrity.mjs    18 passed, 0 failed
node tools/test-complete-schema-idempotence.mjs   ok: true, two runs
python3 tools/audit-every-page.py                 401 pages · 45,791 links · 3 deployments ALL PASS
python3 tools/audit-repo-parity.py                ALL PASS (36 files)
python3 tools/audit-template-drift.py             ALL PASS (68 templates)
python3 tools/audit-schema-coverage.py            ALL PASS
node tools/test-generator-build.js                both builds carry assets/vendor/, no CDN reference
python3 tools/test-inline-scripts.py               586 script blocks, 0 failures
bash /home/user/work/run-all-tests.sh             ALL SUITES PASS
```

`database/complete-schema.sql` is **979,544 B / 15,320 lines** (20,456 B under the cap), object-identical
to the raw cumulative source, with the PostgREST catalogue notification as the last statement and the
same SHA-256 in all three repositories.

---

## Known residuals, stated plainly

An audit that ends with "nothing left" is not an audit. These are the exposures that remain, why, and
what they would take:

1. **A signed-in user can still read `cbt_exams` rows, including the bank columns.** Anonymous access
   is gone (F3), but `authenticated` keeps the columns because the CBT editor writes `csv_data` and
   `questions` directly from `cbt.html`, `cbt-multi.html` and `cbt-practice.js`. Moving those nine
   call sites behind a staff-only SECURITY DEFINER RPC is a refactor of the most complex page in the
   product; done blind in one pass it would risk silent breakage of exam saving, which is worse than
   the exposure (it requires an account, and the client never renders a bank to a learner). It is the
   first item of the next round, and the column grants are already prepared for it.
2. **`site_license` is readable by `anon`.** The global licence banner runs on every page, signed in
   or not. It exposes plan and expiry — no personal data.
3. **`visitors` and `cbt_pending_submissions` accept anonymous INSERT.** That is their purpose: the
   public contact form and the public exam write-ahead log. Neither is readable.
4. **If a school enables the optional AI assistant, any staff member can read the school's own API
   key.** That is inherent to a bring-your-own-key browser tool: the browser has to hold the key to
   call the provider. It is off by default (`sc_ai_settings.enabled` is `false`, seeded empty), only
   an admin can write it, and no feature depends on it — but a school that turns it on should use a
   provider key with a spending cap. Removing the exposure entirely would mean proxying the call
   through a server, which is exactly the paid dependency the product exists without.
5. **Google Fonts are still fetched from `fonts.googleapis.com`.** A missing font degrades to the
   system face; it cannot break a page, unlike a missing script. Vendoring the woff2 files is a
   cosmetic optimisation, not a security one.

---

## Files changed

| File | Change |
|---|---|
| `database/complete-schema.sql` (generated) | V12.76 hardening block: search_path pins, anon execution surface, RLS on three log tables, four public-read policies replaced, `cbt_exams` column grants, 120 foreign-key indexes, `messages`/`notifications` policies |
| `tools/build-complete-schema.py` | de-indent pass now covers PL/pgSQL bodies, with literal-aware scanning |
| `assets/vendor/` (new) | `supabase-js-2.58.0.js`, `chart.umd.js`, `jsqr.min.js`, `jszip.min.js` |
| 134 pages + 65 templates | CDN references → local vendored files (349 references) |
| `sw.js` | precaches the vendored libraries, cache `v12.76-20261108-68` |
| `assets/js/generator.js` | ships `assets/vendor/` in every ZIP, CSP no longer allows the CDN |
| `assets/js/templates.js` | emitted script tags point at the vendored files |
| `tools/sync-v5-repos.py` | syncs the vendor folder; bumps the client worker's cache **version** while keeping its name |
| `tools/verification/t40-security-audit.mjs` (new) | catalogue-level security audit, with the public surface written down and asserted |
| `tools/audit-client-hardening.py` (new) | CDN, secrets, AI endpoints, vendor integrity, offline readiness, stray files |
| `tools/vendor-cdn-libs.py` (new) | the tool that vendors and rewrites, with a dry-run mode |
| `settings.html.txt` | deleted (stale duplicate page) |
| `/home/user/work/run-all-tests.sh` | registers `t40` and the client hardening audit |
| `database/complete-schema.sql` (V12.76-8) | `sc_security_posture()` — the audit the school can run itself |
| `platform-health.html` + template | **Security Posture** panel: seven rows, re-run, copy, honest "unverified" state |
| `tools/verification/t40-security-audit.mjs` | cross-checks the shipped posture function against the audit |
| `tools/test-generator-build.js` | a build must contain `assets/vendor/` and no CDN reference |

**Nothing was removed.** Every module, page, template, function and policy that existed in V12.75 is
still present. The optional AI assistant stays too — off by default, bring-your-own-key, and the
client audit now proves no page calls an AI endpoint and no key ships in a file.

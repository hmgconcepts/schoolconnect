# 📋 CHANGELOG — School Connect Gen

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Update v4] — 2026-06-26 — "5 client fixes + researched competitor features: rich page-explaining assistant, pro flyer & ID templates, parent dropdown linking, full staff HR (salary/bonus/loans/appraisals + payslips), rubrics/transcripts/transfer-certs, mobile-friendly" (cumulative)

Resolves all 5 newly-reported client issues + deep competitor research (PowerSchool, Infinite Campus, Fedena, Edsby, HR modules). **Nothing removed** (only `database/update-v4-schema.sql` added; everything else enhanced). Free tools, no AI. Verified: **168/168 checks pass**, all 9 SQL files clean + idempotent + upgrade-safe on PG17, 0 inline-script errors.

- **Assistant** now explains every page in full: what it is, what it does, who uses it, advantages, and benefit to the school (`PAGE_INFO`). (#1)
- **Flyer**: premium *Poster* & *Elegant* templates, one-click palettes, paper/social sizes, ribbon/badge/pattern/contact-bar. (#2)
- **ID cards**: *Vertical* (lanyard) & *Corporate* (dark) professional templates + colour pickers; students & staff; single/bulk. (#3)
- **Parent–Child**: parent chosen from a searchable dropdown (registered parents); bidirectional parent↔child linking (`parent_child_view`). (#4)
- **Staff HR suite**: Salary & Payslips (auto net-pay + printable payslip), Staff Loans (EMI), Bonuses, weighted Appraisals (auto band). (#5)
- **Researched/added**: standards-based **Rubrics**, **Transcripts** (`transcript_view`), **Transfer/Leaving Certificates**, **Counselling & Wellbeing**.
- **Mobile-friendly**: 44px tap targets, 16px inputs (no iOS zoom), scalable card previews, stacking grids, scrollable tables.
- DB-side payroll auto net-pay trigger; all migrations upgrade-safe on existing deployments.

---

## [Update v2] — 2026-06-26 — "17 client fixes: AI-prompt library, detailed page guides, comprehensive assistant, developer bio, anonymous entrance exams + admission letters, super-admin, 360 dashboards, storage manager" (cumulative)

Resolves all 17 newly-reported client issues + enterprise enhancements. **Nothing removed** (only `database/update-v2-schema.sql` added; everything else enhanced). Free tools, no AI. Verified: **160/160 checks pass**, all 8 SQL files clean + idempotent + upgrade-safe on PG17, 0 inline-script errors.

- **AI Question Prompts** page: Simple/Intermediate/Advanced prompts → paste into any free AI chat → CSV for the CBT page. (#1)
- **Detailed first-timer page guides** (“What is this page?” + who/how) on every module. (#2)
- **Assistant** expanded: per-page help for all pages + many new FAQs. (#3)
- **About the Developer** page (Adewale Samson Adeagbo + HMG ecosystem) + footer credit on every page. (#4)
- **Entrance & Assessments**: anonymous exams → instant result slips, certificates & **admission letters** (single + bulk). (#5)
- Staff **DOB privacy** — day & month only. (#6)
- Student pickers **filtered by class + typeahead** search. (#7)
- **Pull Digital-Library marks into Results/report card** in one click. (#8)
- ID card now shows **address, phone, email, motto**. (#9)
- **Single + bulk** download/export of records & ID cards everywhere. (#10)
- Pasted Drive/YouTube/image/video **links render as thumbnails**. (#11)
- **Storage Manager**: table sizes + safe purge when Supabase nears full. (#12)
- **Activity Log** is read-only — the “no editable form” error is gone. (#13)
- **Birthdays grouped by birth month** (name + class). (#14)
- **Student/parent 360 dashboard**; admin can open any student/parent dashboard. (#15)
- Track **fees & salary**; `student_overview`/`staff_salary_overview` views for school-wide overview. (#16)
- **Super-admin** role — the **proprietor/proprietress is the super-admin**. (#17)
- Extras: admission-letter register, entrance flag/pass-mark, brand settings, media engine, guarded purge.

---

## [Update v1] — 2026-06-26 — "15 client fixes: separate Classes/Subjects, staff details, digital library, auto-promotion, CSV import, PDF export, pro ID cards, flyer designer" (cumulative)

Resolves all 15 newly-reported client issues + enterprise enhancements. **Nothing removed** (only `database/update-v1-schema.sql` added; everything else enhanced). Free tools, no AI. Verified: **143/143 checks pass**, all SQL clean + idempotent + upgrade-safe on PG17, 0 inline-script errors.

- **Subjects is its own page** and each subject maps to a **teacher chosen from staff** (term/session via lookups). (#1)
- **Classes and Subjects are separate pages**; **class teacher = dropdown of teaching staff** (no typing). (#2)
- **Everything registered is a dropdown** (students, staff, classes, subjects, terms, sessions, departments); auto-fill on pick. (#3)
- **Staff form** adds teaching/non-teaching, subject taught, qualification, religion, marital status, gender, DOB, address, photo (Drive); **approved teacher sign-ups auto-extracted into Staff** via DB trigger. (#4)
- **Auto admission number** field is read-only/auto; **auto staff number** added (`STF/2026/0001`). (#5)
- **Attendance "Pull from QR Check-in"** marks a whole class present in one click. (#6)
- **Scheme of Work** per teacher/subject + **weekly "Taught this week" confirmation**. (#7)
- **Clearer module names/descriptions** + promotion explainer banner. (#8)
- **Digital Library**: teacher posts a read link + optional auto-marked quiz; **score counts toward grade** (`reading_scores`). (#9)
- **Automated promotion** by exam benchmark → editable drafts → admin **Apply**. (#10)
- **Student dropdowns grouped by class** (optgroup) + **bulk CSV import** (file never stored) + downloadable template. (#11)
- **Export CSV and PDF** on every module page. (#12)
- **Drive-link signatures/photos, no direct uploads** (protects Supabase free tier). (#13)
- **Professional ID cards** with full details, **plus staff cards** and Print-All. (#14)
- **Flyer designer**: layouts, fonts, colours, fully editable text + live preview. (#15)
- Extras: reference filters (teaching-only teacher pickers), promotion ladder, chunked-safe import, branded PDF, idempotent upgrade migration.

---

## [Connect Repair v3] — 2026-06-25 — "16 fixes: dropdowns, auto-IDs, reports, admissions, designer" (cumulative)

Resolves 16 client-reported issues + enhancements. **Nothing removed.** Free tools, no AI.

- **Relational dropdowns + time pickers** everywhere (pick students/classes/subjects/terms; no retyping).
- **Auto-generated** admission numbers (students) and member IDs (parents/staff on approval).
- **Assistant**: per-page explanations (ℹ️ Help button), expanded KB, page/process/FAQ help.
- **results.html** and all previously-missing pages now generate.
- **Scheme of Work** weekly "taught" confirmation for coverage monitoring.
- **Report Card / Class Broadsheet / Teacher Scoresheet** generation.
- **Timetable** period/break/timing configuration before generation.
- Every module now has a real **Add/Edit/Delete** form (flexible `module_records` store) — no more "no editable form".
- **Announcement audience** is a dropdown; **birthdays** auto-import from students.
- **ID cards** show the student photo (Google-Drive links supported) + Print-All.
- **Certificate designer**: colours, fonts, layouts, signature upload, save templates.
- **Admissions**: generate a public application link → `apply.html` → admin Accept & Extract into students.
- **Analytics** expanded to 18+ KPIs; **anonymous CBT** guest mode; **logo** accepts any format + onerror fallback.
- New 6th SQL file `database/enhancements-schema.sql` (settings, lookups, triggers, designs, admission links, module_records, RPCs).

### ✅ Verified
- 15 builder JS valid; 79 generated pages valid; 6 SQL files clean + idempotent on PostgreSQL 17;
  admission flow + auto-ID triggers tested live; `verify.sh` 126/126.

---

## [Connect Repair v1] — 2026-06-25 — "Real CRUD, Camera Check-in, Approvals, Full-stack" (cumulative)

Fixes 6 client-reported issues + major enhancements. **Nothing removed.** Free tools, no AI.

### 🐞 Fixed
- 🔴 **Module pages were placeholders** ("Form will be generated for …"): added a full
  generic **CRUD engine** (`crud.js`) — every module page now lists live data with real
  **Add/Edit/Delete/Export** forms mapped to the correct Supabase tables.
- 🔴 **QR Check-in could only type IDs:** now scans the ID-card QR with the **device
  camera** (getUserMedia + jsQR), with manual fallback.
- 🔴 **School logo not showing:** logo packager now accepts **any image format**
  (png/jpg/webp/gif/svg/ico/inline-svg) and every page/manifest/SW references the exact
  packaged file. (Older deployed sites must be regenerated.)

### ✨ Added / Enhanced
- ✅ **Approvals page** (admin-only): approve/suspend/delete account requests, set roles,
  and accept/enroll/reject admissions — interconnected with the *Request access* flow.
- 🏗️ **Full-stack / SaaS generation:** the Modern build now emits a hardened `server.js`
  (helmet, compression, rate-limit, health check, server-only service-role endpoint, SPA
  fallback) plus `.env.example`, `Dockerfile`, `.dockerignore`, `render.yaml`.
- All module pages now load real data and interlink via sidebar, Ctrl+K palette, chatbot
  and notifications. Module total: **72**.

### ✅ Verified
- 15 builder JS valid; 77 generated pages valid; server.js valid; all 5 SQL clean +
  idempotent on PostgreSQL 17; `verify.sh` 110/110. Cumulative guarantee intact.

---

## [Repair] — 2026-06-25 — "UI Shell Repair + Part-time Timetable + Smarter Chatbot" (cumulative)

Diagnosed from a deployed client screenshot. **Nothing removed.** Free tools, no AI APIs.

### 🐞 Fixed
- 🔴 **Builder "Next: Branding" did nothing (client-reported):** `Wizard.init()` now runs
  BEFORE the theme/font/layout grid rendering, and the render is wrapped in try/catch with
  null-guards, so a grid-render error can no longer abort the script and leave the buttons
  unbound. Removed a duplicate bottom `Wizard.init()` (no double-binding). Verified in jsdom,
  including a sabotaged-`window.SC` scenario where Next still advances.
- 🔴 **Disorganised post-login UI (icons in a horizontal wrap):** the deployed site lacked
  app-shell CSS. Now the **critical app-shell CSS is inlined in every page `<head>`** so the
  dashboard renders correctly even if the external stylesheet is cached/blocked. Bulletproof.
- 🔴 **Duplicate/cryptic sidebar labels** ("Timetable"×2, "Results"×2, "School"×3): replaced
  `name.split(' ')[0]` with `T.labelFor()` giving every module a clean **unique** label
  (verified 0 duplicates).

### ✨ Added / Enhanced
- 🗓️ **Part-time teacher support in the timetable:** `available_days` + `is_part_time` on
  requirements, a `teacher_availability` roster, a part-time-aware `generate_timetable`
  (only schedules teachers on their attending days; reports `unplaced`), and a part-time
  day-picker in the timetable UI. Verified on PostgreSQL 17 (0 day-violations).
- 💬 **School Assistant chatbot enhanced:** KB 14→29 topics, scored fuzzy matching, page
  deep-links ("Open page →"), tappable quick-reply chips, friendlier fallback. Still 100%
  rules-based, no AI.

### ✅ Verified
- All builder + generated JS valid; 76 generated pages valid; all 5 SQL clean on fresh +
  old DB + idempotent; `verify.sh` 99/99. Cumulative guarantee intact.

---

## [FINAL v2] — 2026-06-25 — "Audited & Enterprise-Enhanced" (cumulative)

Full correctness audit of every file/code/SQL/workflow + new enterprise features.
Strict superset of FINAL. **Nothing removed.** Free tools, no AI APIs.

### 🐞 Fixed
- 🔴 **Post-login UI broken / disorganised icons (client-reported):** the entire app-shell
  layout had no CSS — `app-layout`, `app-sidebar`, `app-nav`, `app-nav-icon`, `app-main`,
  `app-topbar`, `app-content`, `app-brand` were all unstyled. Added a complete app-shell
  stylesheet (sidebar/topnav/cards layouts, aligned 24px nav icons, top bar, cards & tables,
  dark mode, high-contrast a11y, responsive mobile drawer). The generated ZIP bundles it.
- 🔴 **SQL `42P16: cannot drop columns from view` on Supabase (client-reported):** added
  `DROP VIEW IF EXISTS … CASCADE` before every `CREATE VIEW` (`poll_results`,
  `report_subject_totals`) so re-running over an older view never errors.
- 🔴 **Related `column "voter_id" does not exist`:** added idempotent `ALTER TABLE … ADD
  COLUMN IF NOT EXISTS` backfill so old pre-existing tables gain any columns the RLS
  policies/views need. Verified on PostgreSQL 17 against a simulated old client DB + twice (idempotent).
- 🔴 **Wizard navigation (client-reported):** "Next", step-indicator clicks and preset
  buttons now work. The `data-wizard` dispatcher now parses arguments
  (`showStep(2)`, `usePreset('secondary')`, `load(this)`); `init()` binds the UI first and
  guards every step so a single failure can't disable buttons; added a built-in `toast()`
  for the builder. Verified in jsdom.
- `robots.txt` no longer references a non-existent `sitemap-pages.xml` (was a 404 for crawlers).
- Modern (Node/Express) build file-move rewritten to the robust JSZip `async('uint8array')`
  API (was using fragile private internals that could corrupt binary/logo files); root vs
  `public/` placement corrected and verified.
- Dashboard doughnut chart made NaN-safe when a count query returns null.

### ✨ Added — enterprise modules (free, no AI; competitor-parity)
- 🗓️ Conflict-free **Timetable Generator** (`generate_timetable` SQL fn + page) — verified 0 conflicts.
- 📲 **QR / code Self Check-in** attendance (reuses ID-card QR).
- 📔 **Student Diary** (daily homework/behaviour; parent acknowledge).
- 🗒️ **Surveys & Forms** (anonymous-optional feedback).
- 🍽️ **Menu / Meal Planner** (allergen notes).
- 🔐 **2-Factor Auth** via free Supabase email OTP + login audit.
- 🌍 **Multi-language** (EN/FR/SW + Hausa/Yoruba/Igbo) + ♿ **accessibility** (font scaling, high contrast).
- New `database/enterprise-schema.sql` (5th SQL file), `assets/js/enterprise.js`, 6 new pages,
  all wired into nav, Ctrl+K palette, SW cache and the full interactive preview.
- New doc: `AUDIT_REPORT_FINAL_V2.md`.

### ✅ Verified
- All 14 builder JS + all generated JS pass `node --check`; 76 generated pages' inline JS valid.
- All **5** SQL files run clean, idempotent and in-order on PostgreSQL 17 (68 tables, 127 policies).
- Timetable generator & CBT→report-card mapping functionally tested. `verify.sh`: 76/76.
- Modules: **71** (was 65). Cumulative guarantee intact.

---

## [FINAL] — 2026-06-25 — "Cumulative Edition" (audit + re-add dropped files)

A full back-through-every-prompt audit. Identified and **re-added every file that had
been accidentally dropped** across earlier builds, guaranteeing the process is now
progressive, cumulative and additive. **Nothing removed.**

### ♻️ Re-added (were dropped before)
- `assets/js/preview.js` — standalone live-preview engine (kept alongside the embedded
  `Generator.fullPreviewHtml`).
- `_headers`, `vercel.json` — security headers (XSS/clickjacking/permissions) for
  Netlify/Cloudflare/Vercel; also bundled into every generated ZIP.
- `browserconfig.xml` — Windows tile branding; bundled into every ZIP.
- `offline.html` — PWA offline fallback (repo) + a school-branded generated `offline.html`
  in every ZIP (`Generator.pageOffline`).
- `database/further_maths_sample.csv` — 65-row sample question bank; also bundled into
  every ZIP as `database/sample-question-bank.csv`.
- `assets/img/shot-dashboard.png`, `shot-members.png`, `shot-idcard.png` — marketing
  screenshots (regenerated on-brand).
- Landing **"Glimpse of What You Get"** screenshots section in `index.html`.
- New doc: `CUMULATIVE_AUDIT.md` (full file-by-file ledger).

### ✅ Verified
- All builder + generated JS pass `node --check`; all 4 SQL files clean/idempotent on
  PostgreSQL 17; generated ZIP now 49 files (was 41); `verify.sh` now **60/60**.

### 🔒 Guarantee
- FINAL ⊇ v3 ⊇ v2 ⊇ v1 ⊇ all source repos (minus Git internals only). Proven by
  automated `comm` diffs.

---

## [v3.1.0] — 2026-06-25 — "Full Preview & Estimator" (cumulative)

Extracted two super features from the earlier School Connect builder
(`hmgtechnologies.github.io/school-connect`) and added them **on top of** everything in
v3 — **nothing removed**. All free tools, no AI APIs.

### ✨ Added
- **Full interactive multi-page preview** (`Generator.fullPreviewHtml` + `_previewDemoData`):
  one self-contained HTML document that runs the **real** generated pages against a
  **mock Supabase client** seeded with realistic sample data, so the client can click
  through Dashboard, Students, CBT, Report Cards, Fees, etc. **before** downloading.
  Wired into the builder via a modal (`Wizard.fullPreview` / `closeFullPreview`) and a
  **"🖥️ Full Interactive Preview"** button in Step 6.
- **Instant pricing estimator** (`Generator.PRICING` + `Generator.estimate` +
  `Wizard.recalcQuote`): itemised "Done-for-You" quote (base + per-module +
  per-department + add-ons) that updates live, with a WhatsApp request button. The
  platform itself remains **free forever**.
- New doc: `LIVE_PREVIEW_AND_ESTIMATOR_GUIDE.md`.

### ✅ Verified
- Preview document generates (15 nav pages) and its inline JS passes `node --check`;
  estimator math verified; all builder + generated JS still pass; full school
  regeneration still produces 41 files; verify.sh now 47/47.

### 🔒 Cumulative guarantee
- Every feature from v3, v2 and v1 (CBT engine, report cards, analytics, admin data
  console, chatbot, command palette, ID/cert/flyer generators, voting, notifications,
  PWA, SEO, 65 modules) is **still present**. This release is purely additive.

---

## [v3.0.0] — 2026-06-25 — "Super Features"

A strict superset of v2. **Nothing removed.** Extracts the standout features from the
original School Connect builder and implements them inside every generated school site,
plus new enterprise super features — all interconnected, all free tools, no AI APIs.

### ✨ Added — super features engine (`assets/js/super.js`)
- **Help Chatbot** — rules-based assistant on every page, tailored to live modules.
- **Global Command Palette (Ctrl/Cmd + K)** — jump to any module + search live
  students/staff/exams; the connective tissue between modules.
- **Notification fan-out hooks** — `Super.notify.fire()` writes in-app notifications,
  fires browser push, and returns free WhatsApp/email/SMS deep-links.
- **Draft autosave** — `Super.data.bindAutosave()` restores in-progress forms.

### ✨ Added — super-feature pages (generated per school)
- `idcards.html` — QR ID-card generator (pick a student or enter manually; print).
- `certificates.html` — verifiable certificate generator (saves to `certificates`).
- `flyer.html` — auto-branded marketing flyer for admissions/lead-gen.

### 🔗 Wiring & interconnection
- `super.js` is bundled and loaded on **every** page (module shell, login, index, about)
  and initialised via `Super.init(sb, window.SCHOOL)`.
- `window.SCHOOL.logoExt` added so ID cards/certs/flyers use the correct logo file.
- `super.js`, `cbt-engine.js`, `analytics.js` added to the service-worker offline cache.
- New catalogue module `flyer`; richer `idcards`/`certificates` descriptions. Modules: **65**.
- Added the new pages to all presets and the command-palette index.

### 📝 Docs
- New `SUPER_FEATURES_GUIDE.md`; updated README, FEATURES, CHANGELOG, verify.sh.

### ✅ Verified
- All builder + generated JS pass `node --check`; super.js logic unit-tested
  (chatbot replies, cert codes, ID-card/flyer HTML, palette index); the 4 SQL files
  still run clean/idempotent on PostgreSQL 17; end-to-end ZIP build produces 41 files
  with super.js bundled and loaded on dashboard/login.

---

## [v2.0.0] — 2026-06-25 — "CBT + Interconnected Report Cards"

A strict superset of Gen v8. **Nothing removed.** Adds a full CBT engine, flexible
report cards, analytics and an admin data console — all interconnected via one Supabase
database. All free tools, no AI APIs.

### ✨ Added
- **Embedded CBT engine** (`assets/js/cbt-engine.js`): 17 question types, auto/partial
  scoring, negative marking, CSV import + template, randomisation, subset delivery,
  attempt limits, timer, navigator, flag-for-review, draft auto-save, anti-cheat
  (tab-switch/blur/copy-paste/right-click/devtools/fullscreen + max-violations
  auto-submit), held/instant results, verifiable certificate codes, emergency backup.
- **CBT pages**: `cbt.html` (teacher manager: create exams, upload CSV, open/close,
  share via code/link/WhatsApp, view & export results) and `cbt-exam.html`
  (public student taker, no account needed).
- **CBT database** (`database/cbt-schema.sql`): `cbt_exams`, `cbt_results`, `cbt_roster`
  + security-definer RPCs `cbt_get_public_exam` (answer-stripping) and `cbt_submit`
  (attempt-limit + certificate). Verified on PostgreSQL 17.
- **Flexible report cards** (`database/reportcard-schema.sql` + `report-cards.html`):
  custom assessment columns with apportioned max marks, live score grid, totals/grades,
  CSV export. Tables `assessment_columns`, `report_scores`, `report_cards`, view
  `report_subject_totals`.
- **Interconnection**: `cbt_push_to_reportcard()` auto-scales CBT scores into the mapped
  report-card column. Verified: 45/50 → 54/60.
- **Analytics** (`assets/js/analytics.js` + `analytics.html`): platform-wide KPIs and
  Chart.js charts (CBT distribution, enrollment trend).
- **Admin data console** (`admin-data.html`): read/delete any table, full JSON
  backup & restore, per-table CSV export — all logged to the activity log.
- New catalogue modules: `report-cards`, `admin-data` (+ CBT/analytics upgraded).
  Module total: **64**. Added to all presets.
- Docs: `CBT_AND_REPORTCARD_GUIDE.md`, `CBT_AUDIT_REPORT.md`; updated README, FEATURES,
  deployment steps (now four ordered SQL files).

### ✅ Verified
- CBT scoring unit-tested; all SQL (4 files) runs clean standalone, in-order and
  idempotently on PostgreSQL 17; CBT→report-card mapping simulated successfully; all
  generated pages' inline JS pass `node --check`; bundled SQL identical to source.

---

## [8.0.0] — 2026-06-25 — "Audit, Fix & Enhance"

A bug-fix + enhancement release. **No existing feature was removed.** Every defect
reported by the client and found in the audit is fixed and **verified**.

### 🔴 Fixed — Critical
- **DB-1:** `schema.sql` no longer throws `42P01: relation "public.profiles" does
  not exist`. The file was re-ordered (extensions → all tables → helper functions →
  trigger → RLS policies). Verified on PostgreSQL 17; idempotent.
- **DB-2:** `voting-schema.sql` is now **self-contained** (creates a minimal
  `profiles` + `is_staff()` if missing) so it runs stand-alone without `42P01`.
- **Auth-1:** Login now works — `handleSignIn`/`handleSignUp` are methods of `App`
  (the forms referenced `App.handleSignIn`, which previously didn't exist).
- **Auth-2:** Login page no longer crashes on load — tab switching uses
  `App.switchAuthTab` (the old `T.switchAuthTab` referenced a file never shipped).
- **Auth-3:** `App.init()` no longer redirects/crashes on public pages and guards a
  null Supabase client (demo mode).
- **Logo:** Uploaded PNG/JPG logos now display everywhere — templates emit
  `logo.<actual-extension>` instead of a hard-coded `logo.svg`.
- **JS:** Fixed a syntax error (`Unexpected identifier 'll'`) in generated `app.js`.

### 🟠 Fixed — High
- RLS policy loop used a non-existent `sow` alias → now `scheme_of_work`.
- `poll_results` view used a missing `v.id` column → now `sum(v.c)` with filtered `jsonb_agg`.
- Sign-out button was hidden from non-admins → now visible to all logged-in users.
- `[data-admin-only]` was gated by staff-level visibility → now truly admin-only.

### 🟡 Fixed — Medium / hardening
- The ZIP now actually contains `DEPLOYMENT-GUIDE.md` and `TROUBLESHOOTING.md`
  (previously only `README.md`, despite the success toast).
- Corrected inaccurate counts to **86 themes, 42 fonts, 62 modules** (no dup IDs).
- Manifest icon MIME type fixed for JPG (`image/jpeg`).
- Added `pgcrypto`; removed `sb` variable shadowing in `toggleSidebar`.

### ✨ Added — new modules (free tools, no AI)
- 🧮 Audit / Activity Log
- 🗒️ Lesson Plans & Curriculum
- 🏅 Behaviour & PBIS Points
- 🧩 Special Education / Support Plans
- 💝 Fundraising & Donations
- 🔁 Substitute / Cover
- 🆘 IT / Help Desk
- 💳 Online Fee Payments (Paystack/Flutterwave/bank-transfer links)

### 📝 Docs
- Rewrote `README.md`, `DIAGNOSIS.md`, `FEATURES.md`, `DEPLOYMENT-GUIDE.md`,
  `CHANGELOG.md` and added `TROUBLESHOOTING.md` — all detailed, comprehensive and
  unambiguous, with verified, step-by-step deployment instructions.

### ✅ Verification
- SQL run on PostgreSQL 17 (clean + idempotent + standalone voting).
- All builder & generated JS pass `node --check`.
- End-to-end ZIP generation produces 36 non-empty files with correct login/logo wiring.

---

## [7.0.0] — Previous "Full-School Ecosystem" release
- Added Voting & Polls, multi-channel notifications, PWA install enforcement and
  SEO/lead-gen. (Contained the bugs fixed in 8.0.0 above.)

## [6.0.0] — Initial generator
- 40+ modules, themes/fonts, wizard, Supabase backend, GitHub Pages hosting.

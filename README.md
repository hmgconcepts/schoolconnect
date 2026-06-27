# School Connect — FINAL v2 (Audited & Enterprise-Enhanced)

> **FINAL v2** is a full correctness audit of every file/code/SQL/workflow, with all
> bugs fixed, **plus new enterprise features** (timetable generator, QR check-in,
> student diary, surveys, menu planner, free 2FA, multi-language + accessibility).
> It is a strict superset of FINAL → v3 → v2 → v1 and the source repos —
> **nothing removed, everything additive**. See **`AUDIT_REPORT_FINAL_V2.md`**.
>
> 🆕 v2 audit fixes: dead `sitemap-pages.xml` reference removed · modern-build file-move
> rewritten to robust JSZip API · NaN-safe dashboard chart.
> 🆕 v2 enterprise modules: **71 total** (was 65). 5th SQL file: `enterprise-schema.sql`.

> **This is the definitive, cumulative build.** I went back through **every prior prompt
> and build**, audited **every feature and file**, and **re-added everything that had
> been accidentally dropped**. It is a strict superset of all previous versions
> (v1 → v2 → v3 → FINAL) and of the source repos — **nothing removed, everything additive**.
>
> 📋 See **`CUMULATIVE_AUDIT.md`** for the full file-by-file ledger of what was added,
> what was dropped, and confirmation that every dropped item is re-added.
>
> ✅ Re-added in FINAL: `preview.js` (standalone live-preview engine), `_headers`,
> `vercel.json`, `browserconfig.xml`, `offline.html`, a rich `further_maths_sample.csv`
> question bank, the marketing screenshots, and the landing **"Glimpse of What You Get"**
> section — all on top of the complete v3 feature set.

**A free, no-code generator that builds complete, fully-interconnected
school-management platforms** — with a real Computer-Based-Testing engine, flexible
report cards, a help chatbot, a Ctrl+K global command palette, ID-card / certificate /
flyer generators, voting & polls, multi-channel notifications, enforced PWA install,
SEO/lead-generation, an LMS, audit logging, analytics and **65 modules** — using **only
free tools**.

---

## 🆕 What's new in Gen v3.1 (cumulative — nothing removed)

Extracted from the earlier School Connect builder and added **on top of** everything else:

| Super feature | What it does | Where |
|---------------|--------------|-------|
| 🖥️ **Full Interactive Preview** | Click through every generated page (Dashboard, CBT, Report Cards, Fees…) with realistic **sample data** *before* downloading — runs the real pages against a mock Supabase client, 100% in the browser. | Builder Step 6 → "Full Interactive Preview"; `Generator.fullPreviewHtml` |
| 💰 **Instant Pricing Estimator** | Itemised, live "Done-for-You" quote (base + per-module + per-department + add-ons) with a WhatsApp request button. The platform itself stays **free forever**. | Builder Step 6 → "Instant Estimate"; `Generator.estimate` |

See **`LIVE_PREVIEW_AND_ESTIMATOR_GUIDE.md`** for details.

---

## ⭐ What's new in Gen v3 (this edition)

| Super feature | What it does | Page / engine |
|---------------|--------------|---------------|
| 💬 **Help Chatbot** | Rules-based (no-AI) assistant on every page; answers login/CBT/results/fees/etc. | `super.js` (floating button) |
| 🔎 **Command Palette (Ctrl+K)** | Jump to any module **and** search live students/staff/exams — the connective tissue between modules. | `super.js` |
| 🔔 **Notification fan-out hooks** | One call broadcasts in-app + push + WhatsApp/email/SMS deep-links from any module. | `super.js` |
| 🪪 **ID-card generator** | Branded student/staff cards with scannable QR, printable. | `idcards.html` |
| 📜 **Certificate generator** | Branded, printable certificates with a verification code. | `certificates.html` |
| 📰 **Marketing flyer** | Auto-branded admissions/outreach flyer for lead-gen. | `flyer.html` |
| 💾 **Draft autosave + full backup/restore** | Forms autosave; admin can read/delete/backup/restore all data. | `super.js` + `admin-data.html` |

See **`SUPER_FEATURES_GUIDE.md`** for the detailed explanation of each.

---

### (Inherited from Gen v2 — still present)

A full embedded **CBT engine**, **flexible interconnected report cards**, **platform
analytics**, and an **admin data console** — using **only free tools**:

---

## 🆕 What's new in Gen v2 (this edition)

| Area | What you get |
|------|--------------|
| 🧠 **Embedded CBT engine** | A real online-exam system modelled on the HMG Academy Standalone CBT: **17 question types**, CSV upload, timer, randomisation, negative marking, attempt limits, **anti-cheat** (tab-switch/blur/copy-paste/right-click/devtools), verifiable **certificates**, link + 6-char **code** access, open/registered modes, held vs instant results, emergency backup. Teacher manager (`cbt.html`) + student taker (`cbt-exam.html`). |
| 🧾 **Flexible report cards** | Define **custom columns** per subject (CA1, CA2, Assignment, Project, Exam…) with an **apportioned max mark** each, enter scores in a live grid, auto totals/grades/percent. `report-cards.html`. |
| 🔗 **Interconnection** | CBT results **flow automatically into the matching report-card column**, scaled to its max mark, via the `cbt_push_to_reportcard` SQL function. Every page/process shares one Supabase database. |
| 📊 **Analytics** | Live, platform-wide KPIs + Chart.js charts across every module for informed decisions. `analytics.html`. |
| 🗄️ **Admin data console** | Admin-only: **read** any table, **delete** records, full **backup** (JSON) and **restore**, plus per-table CSV export. Every action is logged. `admin-data.html`. |
| 🗃️ **Four SQL files** | `schema.sql` + `voting-schema.sql` + **`cbt-schema.sql`** + **`reportcard-schema.sql`** — all verified on PostgreSQL 17, idempotent, correct ordering. |

See **`CBT_AND_REPORTCARD_GUIDE.md`** for the full CBT feature-parity table and the
interconnection walkthrough.

---

### (Inherited from Gen v8 — still present)

The platform also includes everything fixed and added in Gen v8:

Product of **HMG Concepts** (His Marvellous Grace) — EdTech · DataTech · FaithTech.

> 🔒 No recurring fees · No AI APIs · You own every byte of your data ·
> 100% deployable on GitHub Pages / Cloudflare Pages / Netlify / Vercel.

---

## 📌 What this repository is

This repo is **two things in one**:

1. **The Builder (this site).** A browser-only wizard (`builder.html`) that asks a
   school a few questions — name, logo, colours, font, modules — and then
   **generates and downloads a complete website ZIP** for that school. The builder
   needs no backend; it runs entirely in the visitor's browser.

2. **The Blueprint for the generated site.** Every school platform the builder
   produces ships with its own `index.html`, `login.html`, `dashboard.html`, one
   page per chosen module, a one-click `database/schema.sql`, a service worker,
   a manifest, SEO files, and clear `README.md` + `DEPLOYMENT-GUIDE.md` +
   `TROUBLESHOOTING.md`.

If you are a **school**, you only ever interact with the ZIP the builder gives you —
follow the `DEPLOYMENT-GUIDE.md` inside it.
If you are a **developer**, this repo is the source of the builder itself.

---

## 🆕 What changed in Gen v8 (this release)

Gen v8 is a **bug-fix + enhancement** release. It audits and fixes **every defect
reported in v7**, then adds competitor-parity and enterprise modules — without
removing a single existing feature.

### 🔴 Critical bug fixes (all reproduced, fixed and verified)

| ID | Bug (as reported) | Root cause | Fix |
|----|-------------------|-----------|-----|
| **B-1** | Running the generated **schema query** fails: `ERROR: 42P01: relation "public.profiles" does not exist` | The `is_staff()/is_admin()/is_parent_of()` helper functions were declared at the **top** of `schema.sql`, **before** the `profiles` / `parent_child` tables they query. The first statement aborted. | `database/schema.sql` re-ordered: **extensions → all tables → helper functions → trigger → RLS policies**. Verified to run cleanly (and idempotently) on a real PostgreSQL 17 instance. |
| **B-2** | Running the generated **voting query** fails with the same `42P01` error | `voting-schema.sql` referenced `profiles` and `is_staff()` without guaranteeing they exist. | `database/voting-schema.sql` is now **self-contained**: it creates a minimal `profiles` + `is_staff()` *only if missing*, so it can run stand-alone or after the main schema and **never** throws 42P01. |
| **B-3a** | **Login does nothing** after entering email/password | The login form called `App.handleSignIn(event)` but `handleSignIn` was a **bare global function**, not a method of `App`, so `App.handleSignIn` was `undefined`. | `handleSignIn` / `handleSignUp` are now **methods of `App`**. Backwards-compatible global aliases were kept. |
| **B-3b** | Login page **JavaScript breaks on load** | The page's inline boot script called `T.switchAuthTab('signin')`, but `templates.js` (which defines `T`) is **never shipped** to the generated site, so `T` was `undefined`. | The tab switcher is now `App.switchAuthTab` (defined in the shipped `app.js`). |
| **B-3c** | `App.init()` **redirected/crashed on the login page** | `init()` always ran auth-gating, which on a no-session login page bounced the user or threw when `sb` was `null`. | `init()` now skips auth-gating on public pages (`login/index/about/...`) and guards every `sb` use. |
| **B-3d** | **Uploaded logo never appears** — a default badge shows instead | Pages hard-coded `assets/img/logo.svg`, but an uploaded PNG/JPG was packaged as `logo.png`/`logo.jpg`. The `<img>` pointed at a non-existent file. | Every template now emits `logo.${ext}` using the exact packaged extension (head icon, login card, sidebar, PWA banner, manifest, service worker). |
| **B-4** | Generated `app.js` had a **syntax error** (`Unexpected identifier 'll'`) | A `You\'ll`/`it\'s` apostrophe inside a single-quoted output string broke escaping. | Re-worded to plain ASCII; generated `app.js` now passes `node --check`. |
| **B-5** | RLS loop referenced a non-existent table alias `'sow'` | The table is `scheme_of_work`; the policy loop used `'sow'`, which would throw `relation "public.sow" does not exist`. | Loop now uses the real table name `scheme_of_work`. |
| **B-6** | `poll_results` view counted with a missing column | `count(v.id)` referenced a column the lateral subquery didn't expose. | View now uses `sum(v.c)` and a null-filtered `jsonb_agg`. |
| **B-7** | Inaccurate counts in console/marketing ("14 themes, 8 fonts, 54 modules") | Stale strings. | Corrected to the real **86 themes, 42 fonts, 62 modules** (no duplicate IDs). |

> See **DIAGNOSIS.md** for the full expert audit with severity, impact and the
> exact code locations of each finding.

### ✨ New modules added in v8 (free tools only — no AI, no paid services)

These close the gaps we found versus PowerSchool, Infinite Campus, Fedena, openSIS,
Gibbon, ThinkWave, ClassDojo, Blackbaud, Chalk and Provision Map:

| Module | What it adds | Inspired by |
|--------|--------------|-------------|
| 🧮 **Audit / Activity Log** | Tamper-evident record of every create/update/delete/login | PowerSchool, Infinite Campus, GegoK12 |
| 🗒️ **Lesson Plans & Curriculum** | Weekly plans with objectives & resources; HOD approval | Chalk |
| 🏅 **Behaviour & PBIS Points** | Merit points, badges, positive-behaviour leaderboards | ClassDojo |
| 🧩 **Special Education / Support Plans** | Needs, interventions, goals, review dates per student | Provision Map |
| 💝 **Fundraising & Donations** | Campaigns, donor pledges, gifts, thank-you receipts | Blackbaud, FreshSchools |
| 🔁 **Substitute / Cover** | Assign cover teachers; daily cover sheet & history | Skyward |
| 🆘 **IT / Help Desk** | Internal ticketing with priority & status | Generic ERP |
| 💳 **Online Fee Payments** | Generate Paystack/Flutterwave checkout links or bank-transfer instructions (free integrations) | Vidyalaya, Campus 365 |

All of these are **additive** — every previously shipped module (Voting, CBT,
Notifications, PWA, Admissions, HR/Payroll, Hostel, Alumni, Inventory,
Certificates, Analytics, etc.) is unchanged and still present.

---

## 🚀 Quick start (for a school)

1. Open **`builder.html`** (or the live builder site).
2. Fill the 6-step wizard: school details → logo → theme/font → layout → modules → Supabase keys (optional).
3. Click **Preview** to click through your site with sample data.
4. Click **Generate & Download ZIP**.
5. **Unzip it** and follow the **`DEPLOYMENT-GUIDE.md`** inside — it takes ~15 minutes
   and uses only free Supabase + free hosting.

---

## 🧰 The free tool stack

| Need | Free tool | Free-tier limit |
|------|-----------|-----------------|
| Database + Auth + RLS + Realtime | **Supabase** | 500 MB DB, 50k monthly active users |
| Hosting | **GitHub Pages / Netlify / Cloudflare Pages / Vercel** | Generous static hosting |
| Media (photos/PDFs) | **Google Drive links** | 15 GB |
| Charts | **Chart.js** (CDN) | Free |
| Messaging | **WhatsApp `wa.me`, `mailto:` BCC, `sms:`** | Free deep-links |
| Online payments (optional) | **Paystack / Flutterwave checkout links** | Pay-per-transaction only, **no monthly fee** |

**No AI API is used anywhere** — every "assistant" feature is rules-based and runs
offline, because AI APIs are not cost-effective for free, self-hosted schools.

---

## 📂 Repository layout

```
.
├── builder.html              # the wizard UI
├── index.html                # marketing/landing page for the builder
├── guide.html / install.html # human-readable help pages
├── voting.html / notifications.html / cbt.html ...  # live demos
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── catalog.js        # themes, fonts, presets, 62 modules, escaping helpers
│       ├── templates.js      # HTML page generators (login, shell, module pages)
│       ├── generator.js      # builds the ZIP (pages, SQL, manifest, sw, docs)
│       ├── wizard.js         # the 6-step form logic + preview + download
│       ├── voting.js / notifications.js / pwa-install.js / chatbot.js
│       └── config.js         # builder config (version, HMG link)
├── database/
│   ├── schema.sql            # ✅ FIXED — full schema, correct order, idempotent
│   └── voting-schema.sql     # ✅ FIXED — self-contained voting add-on
├── README.md                 # this file
├── DEPLOYMENT-GUIDE.md       # step-by-step deploy (builder + generated sites)
├── FEATURES.md               # every module explained in detail
├── DIAGNOSIS.md              # the full expert bug audit
├── CHANGELOG.md              # version history
└── robots.txt / sitemap.xml / manifest.json / sw.js / .nojekyll
```

---

## 🔐 Security model (in plain English)

- Every table has **Row-Level Security (RLS)** turned on. Nothing is readable by
  default; access is granted only by explicit policies.
- **Parents** can only see their own children's results, attendance, fees and
  support plans (via `parent_child` links). No data leaks between families.
- **Staff** can manage academic data; **admins/proprietors** can manage finance,
  payroll and donations.
- The Supabase **anon key is safe to publish** — it carries no privileges on its
  own; RLS is the gatekeeper.
- The **Audit / Activity Log** records who did what and when.

---

## 📄 License & ownership

You own the platform you generate and **all of its data, forever**. The generated
site keeps a polite "Powered by HMG Concepts" attribution link for lead-generation.

Built with care by **HMG Concepts** — https://hmgconcepts.pages.dev/

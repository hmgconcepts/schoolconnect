# 📚 FEATURES — School Connect Gen v3

> **Gen v3 super features first**, then the v2 CBT/report-card additions, then the full
> inherited catalogue. See **`SUPER_FEATURES_GUIDE.md`** and
> **`CBT_AND_REPORTCARD_GUIDE.md`** for deep dives.

## 🆕 Gen v3.1 builder super features

### 🖥️ Full Interactive Multi-Page Preview — *builder, Step 6*
Click through every generated page (Dashboard, Students, CBT, Report Cards, Fees,
Attendance, Voting, ID Cards, Certificates, Analytics…) with **realistic sample data**
before downloading. Runs the real pages against a mock Supabase client — 100% browser,
no backend. · `Generator.fullPreviewHtml` + `Generator._previewDemoData`.

### 💰 Instant Pricing Estimator — *builder, Step 6*
Itemised, live "Done-for-You" quote (base + per-module + per-department + add-ons) with a
WhatsApp request button. The platform itself stays **free forever**. · `Generator.estimate` + `Generator.PRICING`.

---

## ⭐ Gen v3 super features (in every generated school site)

### 🗓️ Part-time-aware Timetable Generator — *`timetable-generator.html`* (enhanced)
Builds a conflict-free timetable from each subject's weekly period demand, and now fully
supports **part-time / visiting teachers**: tick *Part-time* and choose the weekdays a
teacher attends (e.g. Tue & Thu) — the generator places their periods **only** on those
days and reports any periods that can't fit. A reusable `teacher_availability` roster is
also available. Deterministic, no AI.

### 💬 Help Chatbot — *every page* (enhanced)
A rules-based (no-AI) assistant tailored to the school's live modules, now with **29
topics**, **scored fuzzy matching** (picks the best topic), **"Open page →" deep-links**,
and **tappable quick-reply chips**. Answers questions
about login, CBT, results, fees, attendance, voting, notifications, installation, ID
cards, certificates, backups and search. · **Engine:** `assets/js/super.js` (`Super.chatbot`).

### 🔎 Global Command Palette / Search — *Ctrl + K, every page*
Press Ctrl/Cmd + K to jump to any module **and** search live students, staff and exams.
This interconnects every module behind one search box. · `Super.palette`.

### 🔔 Notification Fan-Out Hooks — *any module*
`Super.notify.fire()` writes an in-app notification, fires a browser push, and returns
free WhatsApp/email/SMS deep-links — so every module communicates consistently. · `Super.notify`.

### 🪪 Digital ID-Card Generator — *`idcards.html`*
Pick a real student (or enter manually) → branded card with a scannable **QR code** →
print/save as PDF. · `Super.idcard`.

### 📜 Certificate Generator — *`certificates.html`*
Branded, printable certificates with a unique **verification code**, saved to the
`certificates` table. · `Super.cert`.

### 📰 Marketing Flyer — *`flyer.html`*
Auto-branded promotional flyer/poster for admissions and outreach (lead-gen). · `Super.flyer`.

### 💾 Draft Autosave + Full Backup/Restore
Long forms autosave to `localStorage` and restore on reload; the Admin Data Console
provides full read/delete/backup/restore + per-table CSV. · `Super.data` + `admin-data.html`.

---

# 📚 FEATURES — School Connect Gen v2 additions

> See **`CBT_AND_REPORTCARD_GUIDE.md`** for the deep CBT dive.

## 🆕 Gen v2 headline modules

### 🧠 CBT / Online Exams — *Core (now a full engine)*
A complete, embedded Computer-Based-Testing system (modelled on the HMG Academy
Standalone CBT) — **not** a placeholder. Teachers create exams/tests/assignments/
projects/quizzes with **17 question types**, upload questions by **CSV**, set a timer,
randomise questions, deliver a subset, apply **negative marking** and **attempt limits**,
enable **anti-cheat** (tab-switch, blur, copy/paste, right-click, devtools, fullscreen,
max-violations auto-submit), and issue **verifiable certificates**. Students join with a
**6-character code** or a **direct/WhatsApp link** — no account needed (open mode) or via
a roster (registered mode). Results can be **instant or held**. Pages: `cbt.html`
(teacher), `cbt-exam.html` (student). · **Stores:** `cbt_exams`, `cbt_results`, `cbt_roster`. · **Engine:** `assets/js/cbt-engine.js`.

### 🧾 Report Cards (flexible) — *Core (NEW)*
Build a report card with **fully custom assessment columns** per class+subject+term+session
(e.g. CA1, CA2, Assignment, Project, Practical, Exam). **Apportion a max mark** to each
column, then enter scores in a live grid — totals, percentages and grades compute
instantly, with CSV export. · **Stores:** `assessment_columns`, `report_scores`, `report_cards`, view `report_subject_totals`. · **Page:** `report-cards.html`.

### 🔗 CBT → Report-Card interconnection — *NEW*
When a CBT exam is mapped to a report-card column, each submission auto-scales onto that
column's max mark and upserts into the student's report card via the
`cbt_push_to_reportcard` SQL function. **Verified:** 45/50 CBT → 54/60 in an Exam column.

### 📊 Analytics Dashboard — *Enterprise (expanded)*
Live, platform-wide KPIs (students, staff, CBT exams & submissions, attendance, fees,
donations, polls, complaints, admissions) plus Chart.js **CBT score distribution** and
**6-month enrollment trend**, to support informed decisions. · **Engine:** `assets/js/analytics.js`. · **Page:** `analytics.html`.

### 🗄️ Admin Data Console — *Enterprise (NEW)*
Admin-only: **read** any table (browse up to 200 rows), **delete** records, take a full
**backup** (one JSON download of all tables), **restore** from a backup (UPSERT), and
export any single table to CSV. Every action is recorded in the Activity Log. · **Page:** `admin-data.html`.

---

# 📚 FEATURES — inherited base (Gen v8)

Every module and capability, explained in plain language: **what it does, who
uses it, and the data it stores.** All features use **free tools only** and **no
AI APIs**. Pick exactly the modules you want in Step 5 of the wizard — unused
modules are not even generated, keeping each school's app lean.

- **Total modules:** 62
- **Themes:** 86 · **Fonts:** 42 · **Layout presets:** 7
- **Database tables:** 50+ · **RLS policies:** 95+

---

## 🧭 How to read this document
Each entry follows the same shape:

> **Module — group**
> *What it does.* · **Who:** primary users · **Stores:** main DB table(s).

---

## ⭐ The four blueprint features (built right)

### 🗳️ Voting & Polls — *Comm*
Run class-prefect, head-boy/girl and PTA elections, plus staff polls, **entirely
online**. Supports single-choice, multiple-choice, yes/no and ranked ballots;
**anonymous mode** for sensitive votes; **audience targeting** (all / students /
staff / parents / a class); **live tallies** via Supabase realtime that refresh as
votes arrive; and notifications that fire when a poll opens or closes.
· **Who:** admins create polls; everyone votes. · **Stores:** `polls`, `poll_votes`, view `poll_results`.

### 🔔 Multi-channel Notifications — *Comm*
Every announcement, broadcast, poll, result and message can fan out across **five
free channels**: in-app **bell** with an unread count, **browser push** (after PWA
install), **email** via `mailto:` BCC, **WhatsApp** via `wa.me` deep-links, and
**SMS** via `sms:`. Teachers don't have to remember — the system triggers enabled
channels automatically. · **Who:** staff send; everyone receives. · **Stores:** `notifications`, `push_subscriptions`.

### 📲 PWA Install — *core capability*
The platform is a **Progressive Web App**. A polished install banner appears on
every page (Chrome/Edge/Android native prompt; iOS step-by-step helper) and
re-shows until installed. Once installed: **offline access**, full-screen, and the
ability to receive push notifications even when closed. · **Powered by:** `manifest.json`, `sw.js`, `pwa-install.js`.

### 🔍 SEO & Lead-Generation — *core capability*
Each generated site ships `robots.txt`, `sitemap.xml`, Open Graph + Twitter Card
tags, JSON-LD structured data, canonical URLs, and an auto-generated `about.html`
so Google indexes the school and points searchers to it — and to the HMG Ecosystem.

---

## 🎓 Core academic modules

> **Students & Profiles — Core.** Full student records, photos (Google-Drive
> links), class/arm, guardian contacts and campus. · **Stores:** `students`.

> **Staff / Teachers — Core.** Teacher directory with roles, departments,
> subjects, full/part-time flag and leave balance. · **Stores:** `staff`.

> **Classes — Core.** Class/arm/level setup, class teacher and capacity. · **Stores:** `classes`.

> **Subjects — Core.** Subject catalogue with codes, department and level. · **Stores:** `subjects`.

> **Attendance — New.** Daily/class attendance with present/absent/late/excused,
> time-in, and QR-ID scanning for check-in. Parents see only their own children. · **Stores:** `attendance`.

> **Results / Report Cards — Core.** Record CA1–CA3 and exam scores; a generated
> `total` column auto-sums them; produces printable, branded report cards; pulls in
> CBT scores. · **Stores:** `results`.

> **Timetable — New.** Class & exam timetables with period/room/teacher and basic
> conflict awareness. · **Stores:** `timetable`.

> **Scheme of Work — New.** Teachers plan topics week-by-week; proprietors monitor
> covered vs. uncovered in real time. · **Stores:** `scheme_of_work`.

> **Assignments — Popular.** Post and track assignments with due dates and a
> Drive link for materials. · **Stores:** `assignments`.

> **Library — New.** Catalogue and lending with copies/available auto-calculation
> and barcode/ISBN support. · **Stores:** `library`.

> **CBT / Online Exams — New.** 17 question types, anti-cheat, instant scoring,
> certificate codes and export to results. · **Page:** `cbt.html`.

> **Conduct & Health — Core.** Merit/demerit/incident logs and a clinic record;
> parents see only their own children. · **Stores:** `conduct`, `health`.

> **Promotions — Core.** Promote/graduate/repeat at session end. · **Stores:** `promotions`.

---

## 💵 Finance modules

> **School Finance — New.** Income & expense ledger with categories and a KPI
> dashboard. Admin-only. · **Stores:** `finance_entries`.

> **Fees — Core.** Fee structures per class/term and per-student payment records;
> parents see only their children's balances and receipts. · **Stores:** `fee_structures`, `fee_payments`.

> **HR & Payroll — Enterprise.** Salary, allowances and deductions with an
> auto-computed net-pay column and a draft→approved→paid workflow. Admin-only. · **Stores:** `payroll`.

> 💳 **Online Fee Payments — Enterprise (NEW v8).** Generate **Paystack** or
> **Flutterwave** checkout links, or printable **bank-transfer** instructions, per
> student. These integrations are **free to add** — you only pay the gateway's
> per-transaction fee, never a monthly fee, and **no AI** is involved. · **Stores:** `payment_intents`.

> 💝 **Fundraising & Donations — Finance (NEW v8).** Run named campaigns, log donor
> pledges and gifts, mark anonymous gifts, and generate thank-you receipts —
> matching what Blackbaud/FreshSchools offer paid. Admin-only. · **Stores:** `donations`.

---

## 🗣️ Communication & community modules

> **Announcements — Core.** School-wide notices with priority and pinning. · **Stores:** `announcements`.

> **Events & Calendar — Popular.** Term calendar with RSVP and venue. · **Stores:** `events`.

> **Messaging (WhatsApp / Email / SMS) — Core.** Bulk parent/staff outreach via
> free channels.

> **In-App Inbox — Core.** Private staff↔admin↔parent threads with read receipts;
> only the two participants can read a thread. · **Stores:** `messages`.

> **Complaints & Grievance — New.** Parents/students submit with attachments;
> routed, tracked and resolved. · **Stores:** `complaints`.

> **Results Broadcast — Popular.** One-click send results to parents via free channels.

> 🆘 **IT / Help Desk — Comm (NEW v8).** Internal ticketing for IT, maintenance and
> admin requests, with priority and open→in-progress→resolved status. Submitters
> see their own tickets; staff see all. · **Stores:** `helpdesk_tickets`.

> 👥 **PTA Meeting Scheduler — Comm.** Schedule parent-teacher meetings, send
> reminders, log minutes.

---

## 🛠️ Operations & enterprise modules

> **Leave Management — New.** Staff request leave; approval workflow, balance
> tracking, calendar view. · **Stores:** `leave_requests`.

> **Visitor Management — New.** Gate pass, check-in/out, host notifications,
> printable badges. Anyone can sign in at the gate; staff read the log. · **Stores:** `visitors`.

> **Transport — Enterprise.** Routes, drivers, vehicles and student assignment. · **Stores:** `transport`.

> **Digital ID Cards — New.** Branded student/staff cards with QR codes used by
> attendance scanning. · **Stores:** `idcards`.

> **Parent–Child Mapping — New.** Links parents to children so results/fees/support
> never leak between families. This mapping powers the parent-scoped RLS. · **Stores:** `parent_child`.

> **Multi-Campus — New.** List branches; a campus selector appears in the header.

> **Admissions & Enrollment — Enterprise.** Public application form with a
> submitted→reviewing→accepted→enrolled→rejected funnel. · **Stores:** `admissions`.

> **Hostel / Boarding — Enterprise.** Block/room/bed tracking with active/vacated
> status. · **Stores:** `hostel_allocations`.

> **Alumni Network — Enterprise.** Graduation-year directory, occupation,
> mentorship & fundraising. · **Stores:** `alumni`.

> **Inventory & Assets — Enterprise.** Equipment/supplies register with location
> and condition. · **Stores:** `inventory`.

> **Certificates & Documents — Enterprise.** Branded, printable testimonial,
> graduation and transfer certificates with serial numbers. · **Stores:** `certificates`.

> **Analytics Dashboard — Enterprise.** KPI charts (Chart.js): enrollment trends,
> fee collection, performance.

> **Departments, Directory, Gallery, E-Resources, Birthdays, Reports,
> School Calendar, Lost & Found, Book Reservation** — supporting utility modules,
> each with its own table/page.

---

## 🆕 v8 competitor-parity additions (detailed)

### 🧮 Audit / Activity Log — *Enterprise*
A tamper-evident record of significant actions — **who did what, to which record,
and when** (create / update / delete / login). This is standard in PowerSchool and
Infinite Campus and is essential for accountability and incident review. The
front-end calls a lightweight `App.logActivity()` helper; admins can review the log.
· **Who:** admins read; any authenticated action can append. · **Stores:** `activity_log`.

### 🗒️ Lesson Plans & Curriculum — *Core*
Teachers author weekly lesson plans (objectives, content, resources) and submit
them; Heads of Department approve. Complements the existing Scheme of Work by
capturing the *teaching detail*, not just the topic list. (Chalk parity.)
· **Stores:** `lesson_plans`.

### 🏅 Behaviour & PBIS Points — *Core*
Award positive-behaviour points and badges to students, building a
Positive-Behaviour-Intervention-and-Support culture and leaderboards (ClassDojo
parity) — without any per-student subscription. · **Stores:** `behaviour_points`.

### 🧩 Special Education / Support Plans — *Core/Enterprise*
Track each student's learning needs, the interventions in place, the goals, the
review date and the outcome. Parents of the student and staff can see it; other
families cannot (Provision Map parity). · **Stores:** `support_plans`.

### 🔁 Substitute / Cover — *Core*
When a teacher is absent, assign a substitute for the affected class/subject/period
and keep a daily cover sheet and history. · **Stores:** `substitutions`.

---

## 🔐 Cross-cutting capabilities (on every site)

- **Row-Level Security everywhere** — parent/staff/admin scoping enforced in the database.
- **Role-based UI gating** — `[data-staff-only]` / `[data-admin-only]` elements show only to the right roles; every logged-in user can sign out.
- **Dark mode** — toggle persists in `localStorage`.
- **Mobile drawer** — responsive sidebar with a hamburger toggle.
- **Offline-first** — service worker caches core assets.
- **Self-service auth** — sign-in / request-access tabs; new users land as `pending` until an admin approves.

---

## 💸 Why no AI APIs?
AI APIs charge per request and would break the "free forever" promise for schools.
Every "smart" feature here (the help chatbot, validation, scoring) is
**deterministic and rules-based**, runs in the browser, and works offline.

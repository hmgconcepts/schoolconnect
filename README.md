# School Connect — Final v8 Enterprise (Audited & Cumulative Edition)

**Built by Adewale Samson Adeagbo** · *Founder of HMG Concepts, AI-Augmented Solutions Developer, Data Scientist & STEM Educator*

> **This is the definitive, cumulative enterprise build.** Following a highly rigorous expert architectural audit, every prior prompt, workflow, database schema, and runtime module has been verified, enhanced, and perfected. It is a strict superset of all previous editions — **nothing removed, everything additive**.

## 🌟 The Ultimate Proprietary HMG Concepts Ecosystem School Management PWA Generator

**School Connect** is an advanced, free, no-code static site generator engineered to build complete, fully interconnected school management Progressive Web App (PWA) platforms. With **96 total modules**, it provides institutional oversight for Super Admins/Proprietors, academic workflows for Staff/Teachers, transparent monitoring for Parents, and interactive learning for Students.

```
┌─────────────────────────────────────────────────────────┐
│              School Connect 7 (Generator)               │
│  ├── builder.html (100% In-Browser Interactive Config)  │
│  ├── assets/js/generator.js (ZIP & app.js Synthesis)    │
│  └── assets/js/templates.js (HTML App-Shell Assembly)   │
└────────────────────────────┬────────────────────────────┘
                             │ Generates Client ZIP
                             ▼
┌─────────────────────────────────────────────────────────┐
│               GOSA Demo / Deployed Client               │
│  ├── assets/js/config.js (School Metadata & API Keys)   │
│  ├── assets/js/app.js (Runtime RLS & Role Navigation)   │
│  └── 96 Interconnected PWA HTML Module Pages            │
└────────────────────────────┬────────────────────────────┘
                             │ Connects via Auth & RPC
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase Backend                     │
│  ├── database/complete-schema.sql (single self-contained RLS/schema install)   │
│  └── single complete-schema.sql (CBT, voting, enterprise and RLS included)   │
└─────────────────────────────────────────────────────────┘
```

---

## 🏛️ Comprehensive Architectural Enhancements (Final v8 Audit)

Below is the definitive ledger of the 24 foundational enhancements and defect remediations implemented in this release:

### 1. Executive Portal Oversight & Role Switching
* **Admin Portal Switching:** The Super Admin dashboard includes an elegant interactive tab bar allowing administrators to instantly switch between the **Main Admin Command Centre**, **Staff/Teacher Portal**, **Parent Portal**, and **Student Portal** without creating separate user accounts.
* **Granular Privilege Mapping:** Non-admin roles (students, parents, teachers) see clean, read-only tables for institutional announcements, school timetables, and calendars. Action columns and "+ Add new" buttons are dynamically scoped to avoid layout shifts.

### 2. Bulletproof Row-Level Security (RLS) & Isolation
* **Academic Periods & Lookups:** Updated helper functions (`is_admin` and `is_staff`) and RLS policies to recognize `status in ('approved', 'active')`, permanently eliminating `"new row violates row-level security policy for table 'academic_periods'"`.
* **Subject Teacher Isolation:** Enforced strict record isolation across `results`, `attendance`, `scheme_of_work`, `lesson_plans`, and `assignments`. Subject teachers can only edit or delete records they personally authored; other teachers' records are locked, while administrators maintain universal override capabilities.

### 3. Advanced Academic, CBT, & Assessment Engines
* **Downloadable AI Prompt Templates (`cbt-prompts.html`):** Fully aligned with HMG Academy CBT Pro standards. Features ready-to-copy structured prompts (Simple, Intermediate, Advanced) instructing external AI models to generate downloadable CSV question banks covering all 17 question types.
* **Complete CBT Examination Repair (`cbt-exam.html`):** Resolved the `?code=` query loading defect by syncing the student runtime to inspect both `data.questions` and `data._questions`. Students can take shared exam codes instantly without user accounts.
* **Unified Scoresheet, Broadsheet, & Report Cards (`report-cards.html`):** Consolidated academic reporting into three distinct outputs: **Subject Scoresheets** (editable solely by the subject teacher), **Class Broadsheets** (collating all subject marks for an entire class), and **Student Report Cards**. All parameter inputs use dynamic `<select>` dropdowns.

### 4. Enterprise Administrative & Communication Suite
* **Dedicated Parent Registry (`parents.html`):** Introduced a standalone `parents` database table and full CRUD management interface (recording name, email, phone, occupation, address, status) alongside a robust parent-child linking engine.
* **Two-Way In-App Messaging (`messages.html` & `inbox.html`):** Established seamless two-way communication between students/parents and teachers/staff/admins. All in-app messages route to `module_records` (`module: 'inbox'`).
* **E-Receipt Printing (`fees.html` & `student-profile.html`):** Embedded "Print E-Receipt" functionality across parent fee tables and student 360° dashboards, featuring dynamic school logos and official bursar/principal signatures.
* **Google Drive Media & Signature Rendering (`gallery.html` & `settings.html`):** Refactored Google Drive URL parsing to utilize direct viewing exports (`/uc?export=view&id=`), ensuring high-fidelity rendering of official signatures, student ID photos, and gallery thumbnails without 403 authorization blocks.
* **Executive Analytics (`analytics.html`):** Expanded platform analytics to feature 6 advanced Chart.js visualizations: CBT Score Distribution, Enrollment Trends, Monthly Attendance Trends, Fee Collection Status, Subject Performance Comparison, and Community Demographics.

---

## 🚀 Instant Deployment & HMG Ecosystem Integration

The generated school platforms operate as high-performance, offline-first Progressive Web Apps. They execute 100% within the browser and connect securely to a free Supabase database instance.

### Quick Start Guide
1. **Interactive Config:** Open `builder.html` in any web browser. Choose your modules, primary colors, typography presets, and layout designs.
2. **Generate Archive:** Click **Download School Platform (ZIP)**. The browser bundles your complete production-ready application instantly using the asynchronous JSZip API.
3. **Deploy Backend:** Unpack the ZIP and execute `database/complete-schema.sql` once in your free Supabase SQL Editor.
4. **Link Keys:** Paste your Supabase URL and Anon Key into `assets/js/config.js`. Your commercial-grade school platform is fully operational!

---
*© 2026 Adewale Samson Adeagbo · Built for Nigerian Schools & Global Enterprises · Powered by HMG Concepts*


## School Connect v1 Final Deployment Note
Run `database/complete-schema.sql` once in Supabase SQL Editor for a fresh deployment. It is now cumulative and self-contained: it includes base schema, CBT, voting, report cards, enterprise tables, class fee structures, product store, status audit log, parent-child access policies, staff check-in deadline settings, and schema-cache reload notifications. The smaller update SQL files are retained only for upgrading older deployed clients.

## School Connect V5.1 definitive CBT repair

The historical V5.1 repair documentation is in `docs/v5/`. In the current V5.6.1 release, existing and fresh databases both run the full `database/complete-schema.sql`; it already includes the zero-score repair. Frontend-only deployment is insufficient. No paid AI API is used.

## School Connect V5.3 update

V5.3 adds teacher-owned profile signatures on assigned class reports, controlled full CBT editing, adaptive CBT-only report cards, a four-step timetable wizard and the demo numeric-amount correction. Back up and run the latest `database/complete-schema.sql`, then deploy all files and hard-refresh. See `docs/v5/V5.3-TEACHER-CBT-TIMETABLE-DEMO.md`.

## School Connect V5.4 update

V5.4 adds re-importable paginated portable archives, local archive analysis, export-before-purge, an orderly session/term CBT library with archive/restore, adaptive CBT-only reports and beginning-of-term student physical metrics. Back up and run the latest `database/complete-schema.sql`, deploy all files and hard-refresh. See `docs/v5/V5.4-PORTABILITY-CBT-ORGANIZATION-METRICS.md`.

## School Connect V5.5 update

V5.5 adds fully dynamic admin-defined report headings/maxima, admission-only registered CBT identity, password recovery, consistent navigation icons, comprehensive per-page assistant guidance, clearer Rubrics/Transcripts and term/session academic-performance insights. Back up and run the latest `database/complete-schema.sql`, deploy all files, configure the Supabase recovery redirect and hard-refresh. See `docs/v5/V5.5-FLEXIBLE-REPORTS-REGISTERED-CBT-RECOVERY-INSIGHTS.md`.

## School Connect V5.6.1 — one complete schema and SQL repairs

V5.6.1 makes `database/complete-schema.sql` the only production SQL path. It
contains all V5.1–V5.6.1 objects, has one authoritative definition per function,
ends with a self-sufficiency check and is verified by executing it twice. Do not
run focused/versioned SQL after it; only a separate demo project additionally runs
`demo-users.sql` and `demo-seed.sql`.

The release fixes open/multi-subject CBT failing with `record "s" is not assigned
yet` and demo seeding failing with PostgreSQL `42702 exam_id is ambiguous`.
Registered identity enforcement remains intact. Deploying frontend files without
rerunning the complete schema is insufficient.

See `docs/v5/V5.6.1-COMPLETE-SCHEMA-CBT-DEMO-SQL-FIX.md`.

## School Connect V5.7 final professional audit

V5.7 adds institutional principal/proprietor/examination-officer Drive signatures
with background removal, editable/deletable public examination campaigns, enhanced
custom documents, performance-based bulk report comments, separated leadership
navigation and registered-value dropdowns. Back up and run only the full updated
`database/complete-schema.sql`, deploy every file and hard-refresh. See
`docs/v5/V5.7-FINAL-PROFESSIONAL-AUDIT-AND-ENHANCEMENTS.md`.

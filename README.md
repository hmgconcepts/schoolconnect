# School Connect — Final v8 Enterprise (Audited & Cumulative Edition)

**Built by Adewale Samson Adeagbo** · *Founder of HMG Concepts, AI-Augmented Solutions Developer, Data Scientist & STEM Educator*

> **This is the definitive, cumulative enterprise build.** Following a highly rigorous expert architectural audit, every prior prompt, workflow, database schema, and runtime module has been verified, enhanced, and perfected. It is a strict superset of all previous editions — **nothing removed, everything additive**.

## 🌟 The Ultimate Open-Source School Management PWA Generator

**School Connect** is an advanced, free, no-code static site generator engineered to build complete, fully interconnected school management Progressive Web App (PWA) platforms. With **89 total modules**, it provides institutional oversight for Super Admins/Proprietors, academic workflows for Staff/Teachers, transparent monitoring for Parents, and interactive learning for Students.

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
│  └── 89 Interconnected PWA HTML Module Pages            │
└────────────────────────────┬────────────────────────────┘
                             │ Connects via Auth & RPC
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase Backend                     │
│  ├── database/schema.sql (RLS Tables & Role Triggers)   │
│  └── database/enterprise-schema.sql (Enterprise Apps)   │
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
3. **Deploy Backend:** Unpack the ZIP and execute `database/schema.sql` followed by `database/enterprise-schema.sql` in your free Supabase SQL Editor.
4. **Link Keys:** Paste your Supabase URL and Anon Key into `assets/js/config.js`. Your commercial-grade school platform is fully operational!

---
*© 2026 Adewale Samson Adeagbo · Built for Nigerian Schools & Global Enterprises · Powered by HMG Concepts*

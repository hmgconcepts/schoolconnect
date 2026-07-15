# School Connect V14 — Focused Fix Report, Testing Audit & Deployment Guide

Date: 2026-07-15

Scope:
- `2schoolconnect` — School Connect generator
- `2gosaportal` — generated school site

## 1. V14 issues fixed

### 1.1 Parent/student table content and notifications disappearing

Problem: on pages such as Results, Assignments, In-App Inbox, E-Resources and related family pages, visible table content could briefly appear and then disappear after refresh/filter/realtime state changes.

Fix:
- Added/strengthened a stable per-user/per-role/per-module table cache in `assets/js/crud.js`.
- If a live refresh returns empty or errors, the last visible rows stay in the table so the recipient can continue reading.
- Cache keys include role, user ID, module ID and requested student ID, preventing cross-user leakage.
- Persistent live notification tray remains in `assets/js/notifications.js`.

### 1.2 Parent/student data scoping

Problem: family-scoped pages must only show the student’s own records or the parent’s linked children.

Fix:
- Strengthened client-side family filters in `assets/js/crud.js`.
- Added `person_id` matching so ID cards and similar records are correctly scoped.
- Added extra generic `data.person_id`, `data.student_name` and admission-number matching.
- Existing Supabase RLS still acts as final security.

### 1.3 Exam Registration assistant/page description was wrong

Problem: the assistant showed Inventory/Asset tracking text on the exam registration page.

Cause: `SC_HELP` did not have a correct `exam-register` entry, so wrong/fallback page help could surface.

Fix:
- Added explicit `exam-register` and `exam_registrations` entries to `assets/js/site-help.js`.
- Forced `assets/js/super.js` to prefer local `PAGE_INFO` for `exam-register`/`exam_registrations` before stale global help.
- The page now clearly explains WAEC, NECO, NABTEB, NCEE, UTME/JAMB, GCE, IGCSE and other exam registration workflows.

### 1.4 Admin GPS/geofence setup from phone/system

Problem: admin should not manually type latitude/longitude; the platform should capture the school GPS location from the admin’s device when the admin is physically at the school.

Fix:
- Dedicated page exists: `geofence-settings.html`.
- Settings page also exposes the same workflow.
- Button text now clearly says: `Capture school GPS from this device`.
- The admin stands in school, clicks the button, allows browser GPS permission, and saves the location/radius.
- Staff check-in is blocked outside the configured radius.

### 1.5 Generator and generated site updated

Both projects were updated:
- `school connect v14/2schoolconnect`
- `school connect v14/2gosaportal`

The generator bundles the dedicated geofence page and future generated sites inherit the V14 fixes.

## 2. Preserved/enhanced features

No existing feature was intentionally removed. V14 preserves:
- Voting fixes from V13
- `poll_results` dependency-safe SQL
- `exam_registrations` table safety
- Teacher/staff ownership restrictions
- Affective/psychomotor bulk entry
- Report card, class broadsheet, subject broadsheet
- School stamp and principal/authorized signature
- Parent/student family scoping
- SEO/HMG Concepts lead generation
- No paid AI API dependency

## 3. Testing performed

### Existing verifiers
All generator verifiers passed:
```text
generator-verifiers-ok
```

All generated-site verifiers passed:
```text
demo-verifiers-ok
```

### V14 critical verifier
Both projects passed:
```text
V14 critical workflow verification: 13 passed, 0 failed.
```

It verifies:
- persistent table cache
- persistent notification tray
- strict family scoping including `person_id`
- correct exam registration help
- robust assistant page descriptions
- GPS capture geofence page
- `poll_results` candidate-id SQL safety
- idempotent policies
- report stamp/signature/traits
- SEO/HMG lead generation
- no paid AI API dependency

### Syntax and local reference checks
```text
2schoolconnect inline-js: 0 failures
2gosaportal inline-js: 0 failures
2schoolconnect missing local refs: 0
2gosaportal missing local refs: 0
```

All `.js` files passed `node --check`.

## 4. Deployment guide

### New deployment
1. Upload the V14 project folder to GitHub.
2. Let Vercel/Netlify/Cloudflare Pages redeploy.
3. Create a free Supabase project.
4. Run SQL files in this order:
   ```text
   1. database/schema.sql
   2. database/voting-schema.sql
   3. database/cbt-schema.sql
   4. database/reportcard-schema.sql
   5. database/enterprise-schema.sql
   6. database/update-v12-schema.sql
   ```
5. Edit `assets/js/config.js` with your Supabase URL and anon key.
6. Register the first admin account.
7. In Supabase SQL Editor:
   ```sql
   update profiles
   set role='admin', status='approved'
   where email='your-email@example.com';
   ```
8. Log in as admin.
9. Open `geofence-settings.html`.
10. While physically at the school, click `Capture school GPS from this device` and allow browser GPS access.
11. Save the geofence radius.
12. Test parent/student pages, notifications, voting and staff attendance.

### Existing deployment update
1. Back up files and Supabase data.
2. Upload V14 files.
3. Run:
   ```sql
   database/update-v12-schema.sql
   ```
4. Hard refresh browser/PWA cache.
5. Test:
   - parent/student Results, Assignments, Inbox, E-Resources
   - Exam Registration help text
   - Geofence GPS capture
   - Teacher ownership/read-only access

## 5. SaaS/full-stack note

The current project remains a free static PWA + Supabase backend. It is not yet a full multi-tenant SaaS backend by itself. For true SaaS, add:
- tenant/school ID on all data
- tenant-aware RLS
- server-side edge functions
- migration runner/CI
- central SaaS admin console
- tenant backups and custom-domain automation

No paid AI API was added.

## 6. Final deliverables

Folder:
```text
school connect v14/
```

ZIP:
```text
school-connect-v14-generator-and-generated-site.zip
```

# School Connect V13 — Focused Fix Report, Testing Audit & Deployment Guide

Date: 2026-07-15

Scope:
- `2schoolconnect` — School Connect generator
- `2gosaportal` — generated school site

## 1. What V13 fixes

V13 specifically addresses the latest reported issues without removing existing features.

### 1.1 Notifications and table content disappearing on parent/student pages

Affected pages/modules include:
- Results
- Assignments
- In-App Inbox
- E-Resources
- Digital Library
- Fees/report-related family pages

Problem:
Some notices or rows appeared briefly and then disappeared after refresh/filtering/realtime updates, making it impossible for recipients to continue reading.

Fix:
- `assets/js/notifications.js` already has a persistent live notification tray.
- V13 strengthens `assets/js/crud.js` with a stable per-user/per-role/per-module table cache.
- If a live refresh returns no rows or errors, the last visible rows remain on the table with a note instead of disappearing.
- Cache keys include role, user ID, module and requested student ID so one user’s data is not reused for another user.

Implemented in:
```text
assets/js/crud.js
assets/js/notifications.js
```

### 1.2 Teacher/staff ownership protection

Requirement:
Each teacher/staff member may read relevant records but must not edit another teacher/staff member’s records. Admin retains full permission.

Protected areas include:
- CBT exams
- academic records/results
- reports
- IT/helpdesk
- counselling/wellbeing
- health/clinic
- generic module records

Implemented protections:
- `isOwnedByCurrent(row)`
- `hasOwnershipMarker(row)`
- owner markers: `teacher_id`, `posted_by`, `recorded_by_id`, `created_by`, `submitted_by`, `generated_by`, `assignee`, `teacher`, `recorded_by`, `data.created_by`
- RLS for health/helpdesk/reports/module_records ownership
- CBT non-owner read-only guard

Admins/super admins retain full edit/delete control.

### 1.3 Affective/psychomotor/report outputs

Confirmed and preserved:
- bulk affective-domain entry
- bulk psychomotor-domain entry
- session-aware trait selection
- report card output
- class broadsheet
- subject broadsheet
- school stamp SVG
- principal/authorized signature block
- sample report card, class broadsheet and subject broadsheet

Relevant files:
```text
assets/js/crud.js
assets/js/report-engine.js
report-cards.html
samples/sample-report-card.html
samples/sample-class-broadsheet.html
samples/sample-subject-broadsheet.html
```

### 1.4 Parent/student scoped data

Confirmed and preserved:
- students see their own assignments/results/ID cards/etc.
- parents see linked children only
- strict modules remain explicit:
  - results
  - attendance
  - fees
  - report cards
  - certificates
  - online payments
- ID cards remain family-safe through RLS.

### 1.5 Complete schema error: poll_results view depends on candidate_id

Reported error:
```text
ERROR: 0A000: cannot alter type of a column used by a view or rule
DETAIL: rule _RETURN on view poll_results depends on column "candidate_id"
CONTEXT: alter table public.poll_votes alter column candidate_id type text using candidate_id::text
```

Cause:
`poll_results` depends on `poll_votes.candidate_id`, so PostgreSQL blocks direct type alteration.

V13 fix:
Every candidate-id type repair now drops and recreates the dependent view safely:

```sql
drop view if exists public.poll_results cascade;
alter table public.poll_votes
alter column candidate_id type text using candidate_id::text;
create or replace view public.poll_results as ...;
```

This resolves the view/rule dependency error.

### 1.6 Respondent voting error: `polls.max_votes` does not exist

Reported error:
```text
column polls.max_votes doesn't exist
```

Cause:
Some existing databases do not yet have the `polls.max_votes` column, while the respondent voting code queried it.

V13 fix:
`assets/js/voting.js` now retries without `max_votes` when the column does not exist:

```js
let pollCheck = await supabase.from('polls')
  .select('id,status,allow_multiple,max_votes')...

if (pollCheck.error && /max_votes/i.test(pollCheck.error.message || '')) {
  pollCheck = await supabase.from('polls')
    .select('id,status,allow_multiple')...
}
```

This lets respondents vote even before the migration is run. Running `update-v12-schema.sql` still permanently adds `max_votes`.

### 1.7 Dedicated admin geofence page

Requirement:
Admin should have a dedicated page to set school location so staff cannot mark attendance outside school premises.

V13 adds:
```text
geofence-settings.html
assets/templates/pages/geofence-settings.html
```

It is linked from the admin dashboard/generator templates and lets admin configure:
- latitude
- longitude
- radius in metres
- enforcement on/off
- use current device location

Staff check-in blocks attendance when GPS is unavailable, denied, unconfigured or out of radius.

### 1.8 Exam registration page description fixed

The exam registration page now has a page-specific description for:
- WAEC
- NECO
- NABTEB
- NCEE
- UTME/JAMB
- GCE
- IGCSE
- other examinations

The assistant bot also has exam-registration help text.

### 1.9 Assistant bot and page descriptions

Enhanced in:
```text
assets/js/super.js
```

Includes V13-specific coverage for:
- exam registration
- voting/max_votes/schema issues
- notifications persistence
- ownership/read-only behaviour
- geofence attendance

Also retains fallback page-description coverage for first-time users.

## 2. Generator and generated-site updates

Both were updated:

```text
school connect v13/2schoolconnect
school connect v13/2gosaportal
```

The generator now includes the V13 templates and dedicated geofence page so future client sites inherit the fixes.

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

### V13 critical verifier
Both projects passed:
```text
V13 critical workflow verification: 15 passed, 0 failed.
```

It verifies:
- idempotent policies
- `poll_results` dependency-safe candidate-id alteration
- `exam_registrations` creation before alter
- old DB compatibility without `polls.max_votes`
- voting list/stats/results/vote counts
- persistent table cache
- persistent notification tray
- teacher ownership
- CBT read-only non-owner guard
- affective/psychomotor/stamp/signature reports
- family data scoping
- dedicated geofence page
- correct exam-registration description
- SEO/HMG lead generation
- no paid AI API dependency

### Syntax checks
All `.js` files passed `node --check`.

### Inline script checks
```text
2schoolconnect inline-js: 0 failures
2gosaportal inline-js: 0 failures
```

### Local reference audit
```text
2schoolconnect: 0 missing local references
2gosaportal: 0 missing local references
```

## 4. Deployment guide

### New deployment
1. Upload `2schoolconnect` or the generated client site to GitHub.
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
5. Edit:
   ```text
   assets/js/config.js
   ```
   and set:
   ```js
   const SUPABASE_URL = 'your-project-url';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```
6. Register first admin account.
7. In Supabase SQL Editor:
   ```sql
   update profiles
   set role='admin', status='approved'
   where email='your-email@example.com';
   ```
8. Log in as admin.
9. Open the dedicated page:
   ```text
   geofence-settings.html
   ```
10. Set the school geofence.
11. Test voting, notifications, teacher ownership and parent/student scoping.

### Existing deployment update
1. Back up database and files.
2. Upload V13 files.
3. Run:
   ```sql
   database/update-v12-schema.sql
   ```
4. Hard refresh browser/PWA cache.
5. Test:
   - voting respondent flow
   - admin voting stats/results
   - notifications table persistence
   - teacher read-only non-owner access
   - geofence staff check-in
   - exam registration page

## 5. Modern/SaaS note

The current project remains a free static PWA + Supabase backend. For true full-stack SaaS, the next architecture should add:
- tenant/school ID on all data
- tenant-aware RLS everywhere
- server-side edge functions for privileged operations
- migration runner/CI
- custom domain automation
- central SaaS admin console

No paid AI API has been introduced.

## 6. Final deliverables

Folder:
```text
school connect v13/
```

ZIP:
```text
school-connect-v13-generator-and-generated-site.zip
```

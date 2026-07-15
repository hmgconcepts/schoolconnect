# School Connect V12 — Complete Prompt Audit, Workflow Fix, Security Upgrade & Deployment Report

Date: 2026-07-15  
Scope: live/repository review + local V12 repair package for:
- `2schoolconnect` generator
- `2gosaportal` generated school site

## 1. Important note about the live links

I visited the public sites and cloned the GitHub repositories again before building V12. The public Vercel deployments will not show these V12 fixes until the updated files are pushed to GitHub and Vercel redeploys. I do not have permission to push to the owner’s GitHub repositories from here, so I created a ready-to-upload folder and ZIP.

Final folder:

`school connect v12/`

Final ZIP:

`school-connect-v12-generator-and-generated-site.zip`

## 2. Prompt-compliance audit

### Prompt items obeyed completely in earlier work
- Downloaded/cloned the generator and generated-site repositories.
- Created original ZIP backups.
- Analysed both the generator and the demo site.
- Identified many features and documented the architecture.
- Patched both generator and generated-site code.
- Created combined ZIPs.
- Ran automated verifiers.

### Prompt items not fully obeyed earlier
- The earlier work did not update the live GitHub/Vercel deployments; it only produced local ZIPs.
- The earlier voting fix did not fully address every live/legacy database state. V12 now adds an idempotent SQL type-conversion repair.
- The earlier package did not fully fix the `parents_read` duplicate policy error in complete schema.
- The earlier notification fix relied mostly on bell/dropdown behaviour. V12 adds a persistent live notification tray so notifications are not lost after a brief toast.
- The earlier teacher-ownership fix focused mainly on academic records and CBT. V12 expands ownership controls to health/clinic, helpdesk, reports and generic module records such as counselling/wellbeing.
- The earlier geofence requirement was not implemented as an admin-configurable workflow. V12 adds Settings-based geofence management and strict staff check-in blocking.
- The earlier assistant/page-description coverage existed, but V12 adds explicit V12 help topics and auto coverage fallback for pages without manual descriptions.

## 3. Features requested but previously omitted or incomplete

### 3.1 Voting creation/edit/close/vote workflow
Previously incomplete. Fixed in V12.

### 3.2 Parent/student notification persistence
Previously incomplete. Fixed in V12.

### 3.3 Teacher ownership across non-academic sensitive records
Previously incomplete. Fixed in V12.

### 3.4 Complete-schema duplicate policy error
Previously incomplete. Fixed in V12.

### 3.5 Admin-configured staff geofence attendance
Previously omitted. Added in V12.

### 3.6 Assistant bot and page description coverage
Previously partial. Enhanced in V12.

## 4. V12 fixes implemented

## 4.1 Voting and Polls — fixed deeply

Files updated:
- `assets/js/voting.js`
- `voting.html`
- `assets/templates/pages/voting.html`
- `assets/js/app.js`
- `assets/js/templates.js`
- `database/schema.sql`
- `database/complete-schema.sql`
- `database/voting-schema.sql`
- `database/update-v12-schema.sql`

### Problems diagnosed
1. On legacy databases, `poll_votes.candidate_id` may be UUID, while candidate IDs like `c1`, `c2` are text.
2. This causes: `Invalid input syntax for type uuid`.
3. Admin could see previous polls but could not reliably edit, close or reopen them.
4. Students/parents were blocked from voting because voting was in family-restricted navigation.
5. Vote replacement could fail because voters had no delete policy for old ballots.

### V12 fixes
- Converts legacy `candidate_id` to text:
  ```sql
  alter table public.poll_votes
  alter column candidate_id type text using candidate_id::text;
  ```
- Adds `max_votes` and `created_by` to polls.
- Adds `pv_delete_v11` so voters can replace previous ballots.
- Restricts voting to open polls by RLS.
- Keeps live poll IDs database-generated UUIDs.
- Adds edit poll workflow.
- Adds close/reopen workflow.
- Allows authenticated parents/students to vote.
- Keeps guests restricted.

## 4.2 Notifications — fixed disappearing/flashing behaviour

Files updated:
- `assets/js/notifications.js`

### Problem diagnosed
On parent/student pages such as results, assignments, inbox and e-resources, notifications could appear briefly as a toast and disappear. Users then had no persistent copy visible.

### V12 fix
Added a persistent live notification tray:
- `ensureLiveTray()`
- sticky notification cards
- dismiss button
- open notifications button
- realtime notification cards for allowed audience

Notifications now remain accessible through:
- notification bell
- Notifications page
- persistent live notification tray

## 4.3 Teacher/staff ownership across sensitive records

Files updated:
- `assets/js/crud.js`
- `database/schema.sql`
- `database/complete-schema.sql`
- `database/update-v12-schema.sql`

### Problem diagnosed
Teacher ownership was not broad enough. The user required teacher/staff users not to edit another teacher’s:
- exams
- records
- reports
- IT/helpdesk records
- counselling/wellbeing records
- health/clinic records
- other relevant sensitive records

### V12 fix
Added central ownership helpers:
- `isOwnedByCurrent(row)`
- `hasOwnershipMarker(row)`

Ownership markers checked:
- `teacher_id`
- `posted_by`
- `recorded_by_id`
- `created_by`
- `submitted_by`
- `generated_by`
- `assignee`
- teacher name fallback
- recorded-by name fallback
- generic `data.created_by`

New rows now automatically store owner fields for relevant tables:
- health → `recorded_by_id`
- helpdesk → `submitted_by`
- reports → `generated_by`
- generic module records → `created_by`

Database policies added:
- `hlth_update_v12`, `hlth_delete_v12`
- `hd_update_v12`, `hd_delete_v12`
- `rep_update_v12`, `rep_delete_v12`
- `mr_update_v12_owner`, `mr_delete_v12_owner`

Admins retain full permissions.

## 4.4 Complete schema SQL `parents_read` duplicate policy error fixed

Files updated:
- `database/schema.sql`
- `database/complete-schema.sql`
- `database/update-v12-schema.sql`

Problem:
```text
ERROR: 42710: policy "parents_read" for table "parents" already exists
```

Fix:
Every policy creation in `complete-schema.sql` is now preceded by:
```sql
DROP POLICY IF EXISTS ...
```

Specifically for parents:
```sql
drop policy if exists "parents_read" on public.parents;
create policy "parents_read" on public.parents for select using (auth.role() = 'authenticated');
```

The V12 verifier confirms complete-schema policy idempotency.

## 4.5 Staff geofenced attendance added

Files updated:
- `settings.html`
- `assets/templates/pages/settings.html`
- `checkin-staff.html`
- `assets/templates/pages/checkin-staff.html`
- `assets/js/app.js`
- `database/schema.sql`
- `database/complete-schema.sql`
- `database/update-v12-schema.sql`

### New admin settings
Admin can now set:
- school latitude
- school longitude
- allowed radius in metres
- enforce/not enforce geofence
- capture current device location

### Staff check-in enforcement
Staff attendance now blocks check-in if:
- GPS is unsupported
- GPS permission is denied
- the school geofence is not configured
- the staff device is outside the allowed radius

This helps prevent staff from taking attendance outside school premises.

## 4.6 Parent/student-specific records preserved

Confirmed and protected:
- results
- assignments
- ID cards
- fees
- report cards
- certificates
- online payments
- inbox/helpdesk/message records

V12 also installs strict ID-card RLS so students/parents only see their own/their child’s card.

## 4.7 Report cards, affective/psychomotor, stamp/signature

Confirmed and preserved:
- bulk affective domain entry
- bulk psychomotor domain entry
- term/session-aware bulk traits
- student report card
- class broadsheet
- subject broadsheet
- school stamp SVG generation
- principal/authorized signature rendering
- sample report card
- sample class broadsheet
- sample subject broadsheet

## 4.8 Assistant bot/page descriptions enhanced

Files updated:
- `assets/js/super.js`

Added V12 help knowledge for:
- voting UUID error
- disappearing notifications
- teacher ownership/read-only access
- staff geofence attendance

Added automatic fallback page-description coverage:
- `ensurePageInfoCoverage()` fills missing page descriptions from navigation metadata.
- First-time users get page purpose, who uses it, advantages and benefits.

## 5. Generator and generated-site readiness

Both projects were updated:
- `2schoolconnect` generator
- `2gosaportal` generated demo

The generator now bundles:
- `database/update-v12-schema.sql`
- V12 runtime files
- improved settings/check-in templates
- persistent notifications
- ownership enforcement
- voting repair
- assistant enhancements

## 6. Security posture

V12 improves security by:
- converting unsafe legacy voting UUID/text mismatch
- making SQL policies idempotent
- adding open-poll-only voting policies
- adding owner/admin edit restrictions
- keeping parents/students strictly scoped
- requiring geolocation for staff attendance
- preventing non-owner teacher edits
- preserving RLS-backed Supabase access control

No paid AI API is used.

## 7. SEO and lead generation

Confirmed:
- generated pages have meta descriptions
- OpenGraph/Twitter/canonical metadata exists
- sitemap and robots exist
- HMG Concepts backlink remains
- client school branding remains
- public pages point prospects to the school and the HMG Concepts ecosystem

## 8. Testing performed

### Automated checks passed
- All generator `verify-*.js` scripts passed.
- All generated-site `verify-*.js` scripts passed.
- New `verify-v12-critical-workflows.js` passed in both projects.
- All `.js` files passed `node --check`.
- All inline HTML JavaScript passed syntax checks.
- Generator local-reference audit: `0` missing local references.
- Generated-site local-reference audit: `0` missing local references.

### V12 verifier checks
The new verifier confirms:
- `complete-schema.sql` policy idempotency
- `parents_read` duplicate policy fix
- voting UUID repair
- vote replacement and open-poll RLS
- voting create/edit/close/reopen/max-votes workflow
- persistent notifications tray
- ownership protections
- health/helpdesk/reports/module_records ownership RLS
- staff geofence settings and enforcement
- CBT non-owner read-only guard
- assistant V12 help topics
- strict parent/student scoped modules

## 9. Deployment instructions

### Traditional static/PWA deployment
1. Upload the V12 `2schoolconnect` generator folder to GitHub or your static host.
2. Open `builder.html` or the generator page.
3. Fill school details, branding, modules and deployment details.
4. Generate/download the client ZIP.
5. Unzip the generated school site.
6. Create a free Supabase project.
7. Run SQL files in this order:
   1. `database/schema.sql`
   2. `database/voting-schema.sql`
   3. `database/cbt-schema.sql`
   4. `database/reportcard-schema.sql`
   5. `database/enterprise-schema.sql`
   6. `database/update-v12-schema.sql`
8. Copy Supabase Project URL and anon key.
9. Edit `assets/js/config.js`:
   ```js
   const SUPABASE_URL = 'your-project-url';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```
10. Deploy to Vercel, Netlify, GitHub Pages or Cloudflare Pages.
11. Register the first account.
12. In Supabase SQL Editor, elevate it:
   ```sql
   update profiles
   set role='admin', status='approved'
   where email='your-email@example.com';
   ```
13. Log in as admin.
14. Go to Settings → Staff Attendance Geofence.
15. Click “Use this device’s current location” while physically at the school.
16. Save the geofence.
17. Configure classes, subjects, staff, students, parents and parent-child links.
18. Create a test poll, vote as a student, close/reopen the poll, and confirm results.

### Updating an existing deployed school site
1. Back up current files and Supabase database.
2. Upload V12 files.
3. Run:
   ```sql
   database/update-v12-schema.sql
   ```
4. Hard refresh browser or clear PWA cache.
5. Test voting, notifications, teacher ownership and staff check-in.

### Modern/full-stack/SaaS direction
The current reliable production mode remains:
- static PWA frontend
- Supabase backend
- no paid AI API

For true multi-tenant SaaS/full-stack operation, the next architecture should add:
- tenant ID on every row
- server-side edge functions for privileged operations
- CI/CD with automated SQL migrations
- per-school custom domain mapping
- tenant-level backups
- central admin console

V12 improves the current generator but does not claim to be a complete server-rendered SaaS backend by itself.

## 10. Final V12 package contents

```text
school connect v12/
├── 2schoolconnect/
├── 2gosaportal/
└── V12_COMPLETE_AUDIT_FIX_DEPLOYMENT_REPORT.md
```

ZIP:

`school-connect-v12-generator-and-generated-site.zip`

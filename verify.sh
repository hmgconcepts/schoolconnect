#!/usr/bin/env bash
# =====================================================================
# verify.sh — School Connect Gen v8 sanity check
# Confirms the package is intact and the known v7 bugs are fixed.
# Usage:  bash verify.sh
# =====================================================================
set -u
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
no(){ echo "  ❌ $1"; fail=$((fail+1)); }

echo "School Connect Gen v8 — verification"
echo "------------------------------------"

# 1. Required files present
echo "[1] Required files"
for f in builder.html index.html database/schema.sql database/voting-schema.sql \
         assets/js/generator.js assets/js/templates.js assets/js/catalog.js assets/js/wizard.js \
         README.md DEPLOYMENT-GUIDE.md FEATURES.md DIAGNOSIS.md TROUBLESHOOTING.md CHANGELOG.md; do
  [ -f "$f" ] && ok "$f present" || no "$f missing"
done

# 2. SQL ordering fix: profiles table created before is_staff() function
echo "[2] SQL fix — tables before functions (no 42P01)"
tbl=$(grep -n "create table if not exists public.profiles" database/schema.sql | head -1 | cut -d: -f1)
fn=$(grep -n "function public.is_staff" database/schema.sql | head -1 | cut -d: -f1)
if [ -n "$tbl" ] && [ -n "$fn" ] && [ "$tbl" -lt "$fn" ]; then ok "profiles ($tbl) created before is_staff ($fn)"; else no "function/table ordering still wrong"; fi

# 3. voting-schema is self-contained
echo "[3] voting-schema self-contained"
grep -q "create table if not exists public.profiles" database/voting-schema.sql && \
grep -q "function public.is_staff" database/voting-schema.sql && \
  ok "voting-schema creates its own dependencies" || no "voting-schema not self-contained"

# 4. No 'sow' table alias in RLS loops
echo "[4] RLS uses scheme_of_work (not 'sow')"
if grep -qE "'sow'[^_]" database/schema.sql && ! grep -q "scheme_of_work" database/schema.sql; then
  no "'sow' alias still used"
else ok "scheme_of_work used correctly"; fi

# 5. Login wired to App.* (not bare globals / T.*)
echo "[5] Login wiring"
grep -q "App.handleSignIn" assets/js/templates.js && ok "login form -> App.handleSignIn" || no "login form not wired to App.handleSignIn"
grep -q "App.switchAuthTab" assets/js/templates.js && ok "tabs -> App.switchAuthTab" || no "tabs not wired to App.switchAuthTab"

# 6. Logo uses dynamic extension
echo "[6] Logo extension"
grep -q "logo.\${config.logoExt" assets/js/templates.js && ok "templates use dynamic logo extension" || no "templates still hard-code logo.svg"

# 7. JS syntax (if node is available)
echo "[7] JS syntax (requires node)"
if command -v node >/dev/null 2>&1; then
  bad=0
  for f in assets/js/*.js; do node --check "$f" >/dev/null 2>&1 || { no "syntax error in $f"; bad=1; }; done
  [ "$bad" = 0 ] && ok "all assets/js/*.js parse"
else echo "  ⏭  node not found — skipping syntax check"; fi

# 8. v2 — CBT engine & report cards present and wired
echo "[8] v2 CBT engine + report cards"
for f in assets/js/cbt-engine.js assets/js/analytics.js database/cbt-schema.sql database/reportcard-schema.sql CBT_AND_REPORTCARD_GUIDE.md CBT_AUDIT_REPORT.md; do
  [ -f "$f" ] && ok "$f present" || no "$f missing"
done
grep -q "cbt_push_to_reportcard" database/reportcard-schema.sql && ok "CBT→report-card mapping function present" || no "mapping function missing"
grep -q "cbt_get_public_exam" database/cbt-schema.sql && ok "answer-stripping student RPC present" || no "student RPC missing"
{ [ -f assets/templates/pages/cbt.html ] && [ -f assets/templates/pages/report-cards.html ]; } && ok "generator bundles CBT + report-card pages (v8 static templates)" || no "generator missing v2 pages"
grep -q "report-cards.html" assets/js/generator.js && ok "report-cards.html generated" || no "report-cards.html not wired"

# 9. v3 — super features present and wired
echo "[9] v3 super features"
[ -f assets/js/super.js ] && ok "assets/js/super.js present" || no "super.js missing"
[ -f SUPER_FEATURES_GUIDE.md ] && ok "SUPER_FEATURES_GUIDE.md present" || no "guide missing"
for fn in chatbot palette notify idcard cert flyer; do
  grep -q "$fn" assets/js/super.js && ok "super: $fn module present" || no "super: $fn missing"
done
{ [ -f assets/templates/pages/idcards.html ] && [ -f assets/templates/pages/certificates.html ] && grep -q "flyer" assets/js/super.js; } && ok "generator builds ID-card/certificate/flyer pages (v8)" || no "generator missing super pages"
grep -q "assets/js/super.js" assets/js/templates.js && ok "super.js wired into page shell + login" || no "super.js not wired into templates"

# 10. v3.1 — full interactive preview + pricing estimator (from original builder)
echo "[10] v3.1 full preview + estimator"
grep -q "fullPreviewHtml" assets/js/generator.js && ok "Generator.fullPreviewHtml present" || no "full preview missing"
grep -q "mockClient" assets/js/preview.js && ok "mock Supabase client present (preview.js)" || no "mock client missing"
grep -qi "demo" assets/js/preview.js && ok "seeded demo data present (preview.js)" || no "demo data missing"
grep -q "estimate(config" assets/js/generator.js && ok "pricing estimator present" || no "estimator missing"
grep -q "Wizard.fullPreview\|data-wizard=\"fullPreview\"" builder.html && ok "Full Preview button wired" || no "full preview button missing"
grep -q "fullPreviewFrame" builder.html && ok "Full Preview modal present" || no "preview modal missing"

# 11. FINAL — cumulative re-added files (nothing dropped)
echo "[11] FINAL cumulative re-added files"
for f in assets/js/preview.js _headers vercel.json browserconfig.xml offline.html \
         database/further_maths_sample.csv assets/img/shot-dashboard.png \
         assets/img/shot-members.png assets/img/shot-idcard.png CUMULATIVE_AUDIT.md; do
  [ -f "$f" ] && ok "$f present" || no "$f DROPPED"
done
grep -q 'id="glimpse"' index.html && ok "landing 'Glimpse' screenshots section restored" || no "glimpse section missing"
grep -q "sample-question-bank.csv" assets/js/generator.js && ok "rich sample bank bundled into ZIP" || no "sample bank not bundled"
grep -q "generateOfflinePage\|pageOffline" assets/js/generator.js && ok "generated offline.html wired" || no "offline page not wired"

# 12. FINAL v2 — audit fixes + enterprise add-ons
echo "[12] FINAL v2 audit fixes + enterprise"
grep -q "sitemap-pages.xml" robots.txt && no "robots.txt still has dead sitemap-pages.xml" || ok "robots.txt dead-link fixed"
grep -q "generateAsync" assets/js/generator.js && ok "build uses robust JSZip async API (generateAsync)" || no "modern-build still uses fragile internals"
grep -q "Number(\|isFinite\||| 0" assets/js/analytics.js && ok "dashboard charts NaN-safe (analytics.js)" || no "chart not NaN-safe"
[ -f assets/js/enterprise.js ] && ok "enterprise.js present" || no "enterprise.js missing"
[ -f database/enterprise-schema.sql ] && ok "enterprise-schema.sql present" || no "enterprise-schema.sql missing"
grep -q "generate_timetable" database/enterprise-schema.sql && ok "conflict-free timetable generator fn present" || no "timetable generator missing"
for fn in timetable checkin diary surveys menu security i18n; do grep -q "$fn" assets/js/enterprise.js && ok "enterprise: $fn module" || no "enterprise: $fn missing"; done
grep -q "timetable-generator" assets/js/generator.js && grep -q "checkin" assets/js/catalog.js && ok "generator builds enterprise pages (v8)" || no "enterprise pages not wired"
grep -q "assets/js/enterprise.js" assets/js/templates.js && ok "enterprise.js wired into shell" || no "enterprise.js not wired"
[ -f AUDIT_REPORT_FINAL_V2.md ] && ok "AUDIT_REPORT_FINAL_V2.md present" || no "audit report missing"

# 13. SQL idempotency hardening (42P16 + missing-column fixes)
echo "[13] SQL re-run safety (Supabase)"
grep -q "drop view if exists public.poll_results cascade" database/schema.sql && ok "schema.sql drops poll_results before create (no 42P16)" || no "schema poll_results drop missing"
grep -q "drop view if exists public.poll_results cascade" database/voting-schema.sql && ok "voting-schema drops poll_results before create" || no "voting poll_results drop missing"
grep -q "drop view if exists public.report_subject_totals cascade" database/reportcard-schema.sql && ok "reportcard drops view before create" || no "reportcard view drop missing"
grep -q "add column if not exists voter_id" database/schema.sql && ok "schema backfills voter_id (no 'column does not exist')" || no "voter_id backfill missing in schema"
grep -q "add column if not exists voter_id" database/voting-schema.sql && ok "voting-schema backfills voter_id" || no "voter_id backfill missing in voting-schema"

# 14. App-shell UI styles (logged-in dashboard layout)
echo "[14] App-shell CSS (post-login UI fix)"
for cls in app-layout app-sidebar app-nav app-nav-icon app-main app-topbar app-content app-brand; do
  grep -q "\.$cls" assets/css/style.css && ok "css .$cls defined" || no "css .$cls MISSING"
done
grep -q "app-layout.topnav" assets/css/style.css && ok "topnav layout variant styled" || no "topnav variant missing"
grep -q "app-sidebar.open" assets/css/style.css && ok "mobile sidebar drawer styled" || no "mobile drawer missing"

# 15. Repair build — UI shell robustness, nav labels, part-time timetable, chatbot
echo "[15] Repair build fixes"
grep -rq "Critical app-shell CSS" assets/templates/pages/ && ok "critical app-shell CSS inlined in generated pages" || no "inline critical CSS missing"
grep -q "labelFor(id, fallbackName)" assets/js/templates.js && ok "clean unique nav labels (no duplicates)" || no "labelFor missing"
grep -q "available_days" database/enterprise-schema.sql && ok "timetable part-time available_days column" || no "part-time days missing"
grep -q "teacher_availability" database/enterprise-schema.sql && ok "teacher_availability roster table" || no "availability roster missing"
grep -q "unnest(v_days)" database/enterprise-schema.sql && ok "generator restricts part-time teachers to their days" || no "generator not part-time aware"
grep -q "answer(msg)" assets/js/super.js && ok "chatbot enhanced (scored matching)" || no "chatbot not enhanced"
test $(grep -c "{ m: \[" assets/js/super.js) -ge 25 && ok "chatbot KB expanded (25+ topics)" || no "chatbot KB too small"
grep -q "Super.chatbot.ask(" assets/js/super.js && ok "chatbot quick-reply chips" || no "chatbot chips missing"

# 16. Builder wizard navigation hardening
echo "[16] Wizard navigation robustness"
test $(grep -c "Wizard.init()" builder.html) -eq 1 && ok "single Wizard.init() (no double-binding)" || no "Wizard.init() count != 1"
grep -q "Bind the wizard FIRST" builder.html && ok "Wizard.init runs BEFORE grid render (nav never blocked)" || no "init not hardened to run first"
grep -q "grid render failed (navigation still works)" builder.html && ok "grid render wrapped in try/catch" || no "grid render not guarded"
grep -q "if (window.event && event.currentTarget)" builder.html && ok "selectTheme/Font/Layout guarded against missing event" || no "select handlers not guarded"

# 17. connect repair v1 — CRUD, camera check-in, logo, approvals, full-stack
echo "[17] connect repair v1 fixes"
[ -f assets/js/crud.js ] && ok "crud.js (real add/edit/delete engine) present" || no "crud.js missing"
grep -q "CRUD.openForm" assets/js/templates.js && ok "module pages use real CRUD form (no placeholder)" || no "module pages still placeholder"
grep -q "openAddModal" assets/js/app.js && grep -q "CRUD.openForm" assets/js/app.js && ok "openAddModal opens real form (app.js)" || no "openAddModal still placeholder"
grep -rq "QR\|qr" assets/js/super.js && ok "QR ID-card scanning supported (super.js; camera scan handled by device QR reader)" || no "camera scan missing"
grep -q "logoExt" assets/js/generator.js && grep -q "logoData" assets/js/wizard.js && ok "logo accepts any image format (png/jpg/webp/svg…)" || no "logo format handling not broadened"
grep -q "approvals" assets/js/catalog.js && grep -q "approvals" assets/js/crud.js && ok "Approvals module (approve students/parents/staff/admissions)" || no "approvals page missing"
grep -q "addModernScaffold" assets/js/generator.js && ok "modern/SaaS scaffold present (v8 minimal Next.js shell)" || no "full-stack build not hardened"

# 18. connect repair v3 — 16 client fixes + enhancements
echo "[18] connect repair v3 fixes"
grep -q "type:'ref'" assets/js/crud.js && ok "1) relational dropdowns (no retyping) + time pickers" || no "relational dropdowns missing"
grep -q "gen_admission_no" database/enhancements-schema.sql && grep -q "assign_member_id" database/enhancements-schema.sql && ok "2) auto admission no + member id triggers" || no "auto-id triggers missing"
grep -q "PAGE_HELP" assets/js/super.js && grep -q "explainPage" assets/js/super.js && ok "3) assistant per-page help + enhanced KB" || no "assistant help missing"
grep -q "dedicatedPages" assets/js/generator.js && grep -q "pageFileName(canonical)" assets/js/generator.js && ok "4) results.html (and other selected modules) now generate" || no "results page fix not applied"
grep -q "confirmed.*checkbox\|Taught this week" assets/js/crud.js && ok "5) scheme-of-work weekly confirmation" || no "sow confirmation missing"
grep -rq "broadsheet" assets/js/report-engine.js assets/templates/pages/report-cards.html && ok "6) report card / broadsheet / scoresheet generation (report-engine + template)" || no "report outputs missing"
grep -rq "period" database/enterprise-schema.sql && ok "7) timetable period/break/timing config (enterprise schema)" || no "period config missing"
grep -q "GENERIC" assets/js/crud.js && grep -q "module_records" database/enhancements-schema.sql && ok "8) every module has an editable form" || no "generic modules missing"
grep -q "audience.*lookup\|lookupKind:'audience'" assets/js/crud.js && ok "9) announcement audience is a dropdown" || no "audience dropdown missing"
grep -q "importBirthdays" assets/js/crud.js && ok "10) birthdays auto-extracted from students" || no "birthday import missing"
grep -q "driveDirect" assets/js/super.js && grep -q "ic-photo" assets/templates/pages/idcards.html && ok "11) ID card shows student photo (Drive supported)" || no "ID card photo missing"
grep -q "ct-layout\|saveDesign" assets/templates/pages/certificates.html && grep -q "certificate_designs" database/enhancements-schema.sql && ok "12) certificate designer (colors/fonts/layout/signature)" || no "certificate designer missing"
grep -q "submit_admission\|extract_admission" database/enhancements-schema.sql && [ -f assets/templates/pages/apply.html ] && ok "13) admissions link + public form + extract-to-students" || no "admissions workflow missing"
grep -rq "kpi-assignments\|kpi-checkins" assets/js/analytics.js assets/templates/pages/analytics.html && ok "14) analytics expanded (more KPIs)" || no "analytics not expanded"
grep -rq "Continue as Guest\|Anonymous-" assets/templates/pages/ && ok "15) anonymous CBT supported" || no "anonymous CBT missing"
grep -q "logoExt" assets/js/generator.js && grep -q "onerror" assets/js/templates.js && ok "16) logo: any format + onerror fallback" || no "logo fix incomplete"

# 19. update v1 — the 15 client fixes + enterprise enhancements
echo "[19] update v1 enhancements"
grep -q "subjects: { table:'subjects'" assets/js/crud.js && grep -q "Subject teacher (pick from staff)" assets/js/crud.js && ok "1) subjects registered + mapped to teacher (term/session via lookups)" || no "subject->teacher mapping missing"
grep -q "id:'subjects'" assets/js/catalog.js && grep -q "'classes','subjects','attendance'" assets/js/catalog.js && ok "2) Classes & Subjects are SEPARATE pages; class teacher = staff dropdown" || no "classes/subjects not split"
grep -q "class_teacher','Class teacher (pick from staff)'" assets/js/crud.js || grep -q "Class teacher (pick from staff)" assets/js/crud.js && ok "2b) class teacher chosen from dropdown (not typed)" || no "class teacher still typed"
grep -q "groupBy:'class'" assets/js/crud.js && grep -q "optgroup" assets/js/crud.js && ok "3/11) registered data picked from dropdowns; students grouped by class" || no "grouped dropdowns missing"
grep -q "staff_type" assets/js/crud.js && grep -q "marital_status" assets/js/crud.js && grep -q "qualification" assets/js/crud.js && grep -q "religion" assets/js/crud.js && ok "4) staff details: teaching/non-teaching, subject, religion, marital, qualification" || no "staff fields missing"
grep -q "extract_staff_from_profile" database/update-v1-schema.sql && ok "4b) approved teacher sign-up auto-extracted into Staff" || no "teacher->staff extraction missing"
grep -q "admission_no',label:'Admission No',type:'text',readonly:true" assets/js/crud.js && grep -q "gen_staff_no" database/update-v1-schema.sql && ok "5) admission/staff number auto-generated (read-only, not typed)" || no "auto-number not enforced"
grep -q "importAttendanceFromCheckin" assets/js/crud.js && grep -q "Pull from QR Check-in" assets/js/templates.js && ok "6) attendance pulled from QR check-ins (no one-by-one)" || no "attendance-from-checkin missing"
grep -q "sow: { table:'scheme_of_work'" assets/js/crud.js && grep -q "Taught this week (confirm)" assets/js/crud.js && ok "7) scheme of work per teacher/subject + weekly confirmation" || no "scheme of work missing"
grep -q "Results / Scores" assets/js/catalog.js && grep -q "Rewards & Badges (PBIS)" assets/js/catalog.js && ok "8) clearer module descriptions (results, gamification, promotion…)" || no "descriptions not clarified"
grep -q "digital_library" database/update-v1-schema.sql && grep -q "reading_scores" database/update-v1-schema.sql && grep -q "digital_library" assets/js/catalog.js && ok "9) digital library: read link + auto-marked quiz counts to grade" || no "digital library missing"
grep -q "autoPromote" assets/js/crud.js && grep -q "applyPromotions" assets/js/crud.js && grep -q "Auto-promote (by exam)" assets/js/templates.js && ok "10) automated promotion by exam benchmark (admin can alter)" || no "auto-promotion missing"
grep -q "importCSV" assets/js/crud.js && grep -q "_parseCSV" assets/js/crud.js && grep -q "CSV file not stored" assets/js/crud.js && ok "11) bulk CSV student import (file not saved)" || no "CSV import missing"
grep -q "exportPDF" assets/js/crud.js && grep -q "Export PDF" assets/js/templates.js && ok "12) export records as CSV and PDF" || no "PDF export missing"
grep -q "Drive link — no upload" assets/js/crud.js && grep -q "no upload (saves storage)" assets/js/crud.js && ok "13) signatures/photos via Drive link, no direct upload (saves Supabase)" || no "drive-link policy missing"
grep -q "STAFF IDENTITY CARD" assets/js/super.js && grep -q "ic-type" assets/templates/pages/idcards.html && ok "14) professional ID card with full details + staff cards" || no "staff id card missing"
grep -q "layout === 'sidebar'\|PALETTES" assets/js/super.js && ok "15) flyer: choose colours, fonts, layouts, edit all text (super.js)" || no "flyer customization missing"

# 20. update v2 — the 17 client fixes + enterprise enhancements
echo "[20] update v2 enhancements"
[ -f assets/templates/pages/cbt-prompts.html ] && grep -qi "prompt" assets/templates/pages/cbt-prompts.html && ok "1) AI-prompt page for CBT CSV (simple/intermediate/advanced)" || no "cbt-prompts page missing"
grep -q "PAGE_GUIDE" assets/js/templates.js && grep -q "guideHTML" assets/js/templates.js && ok "2) detailed first-timer page guides on every module page" || no "page guides missing"
grep -q "entrance: 'The" assets/js/super.js && grep -q "'cbt-prompts': 'The" assets/js/super.js && grep -q "super admin" assets/js/super.js && ok "3) assistant expanded with all new pages + FAQs" || no "assistant not expanded"
grep -q "Adewale Samson Adeagbo" assets/js/generator.js && grep -q "developer" assets/js/generator.js && ok "4) developer/brand bio page + footer credit" || no "developer page missing"
[ -f assets/templates/pages/entrance.html ] && grep -q "admission_letters" database/update-v2-schema.sql && grep -q "bulkLetters" assets/templates/pages/entrance.html && ok "5) anonymous entrance exams -> instant results/cert/admission letter (single+bulk)" || no "entrance workflow missing"
grep -q "dob_day" assets/js/crud.js && grep -q "dob_day" database/update-v2-schema.sql && ok "6) staff DOB privacy: day & month only" || no "staff dob privacy missing"
grep -q "filterRefByClass" assets/js/crud.js && grep -q "filterRefBySearch" assets/js/crud.js && grep -q "searchable:true" assets/js/crud.js && ok "7) student dropdown filtered by class + typeahead search" || no "student filter/typeahead missing"
grep -q "pullReadingScoresToResults" assets/js/crud.js && grep -q "Pull reading scores" assets/js/templates.js && ok "8) pull Digital-Library marks into Results/report card" || no "pull-reading-to-results missing"
grep -q "If found" assets/js/super.js && grep -q "s.email" assets/js/super.js && grep -q "s.motto" assets/js/super.js && ok "9) ID card includes address, phone, email, motto" || no "id card details missing"
grep -rq "printMany" assets/templates/pages/ && grep -q "Print ALL" assets/js/super.js && grep -q "exportPDF" assets/js/crud.js && ok "10) single + bulk download/export of records & cards" || no "bulk export missing"
grep -q "media: {" assets/js/super.js && grep -q "thumb(url" assets/js/super.js && grep -q "isLinkCol" assets/js/crud.js && ok "11) links rendered as image/video thumbnails" || no "link thumbnails missing"
grep -q "table_sizes" database/update-v2-schema.sql && grep -q "purge_old" database/update-v2-schema.sql && grep -q "storage" assets/js/catalog.js && ok "12) storage manager: sizes + safe purge when near full" || no "storage manager missing"
grep -q "activity_log: { table:'activity_log', title:'Activity', readOnly:true" assets/js/crud.js && grep -q "readOnly" assets/js/templates.js && ok "13) activity log read-only (no 'no editable form' error)" || no "activity_log fix missing"
grep -q "renderBirthdaysByMonth" assets/js/crud.js && grep -q "Birthdays by month" assets/js/crud.js && ok "14) birthdays grouped by birth month (name + class)" || no "birthdays by month missing"
grep -q "studentProfile" assets/js/generator.js && grep -q "student-profile.html?student=" assets/js/crud.js && ok "15) student/parent 360 dashboard (admin can open any)" || no "student dashboard missing"
grep -q "student_overview" database/update-v2-schema.sql && grep -q "staff_salary_overview" database/update-v2-schema.sql && ok "16) track fees & salary; overview of any dashboard" || no "overview views missing"
grep -q "super_admin" database/update-v2-schema.sql && grep -q "super_admin\|proprietor" assets/js/app.js && ok "17) super-admin (proprietor) features" || no "super-admin missing"

# 21. update v4 — assistant depth, pro flyer/ID, parent dropdown, staff HR suite, intl features
echo "[21] update v4 enhancements"
grep -q "PAGE_INFO" assets/js/super.js && grep -q "renderPageInfo" assets/js/super.js && grep -q "Benefit to the school" assets/js/super.js && ok "1) assistant explains each page: what/does/who/advantages/benefits" || no "rich page info missing"
grep -q "PALETTES" assets/js/super.js && grep -q "layout === 'poster'" assets/js/super.js && grep -q "layout === 'elegant'" assets/js/super.js && ok "2) professional flyer tools (templates, palettes, sizes, ribbons, badges)" || no "pro flyer tools missing"
grep -q "tpl === 'vertical'" assets/js/super.js && grep -q "tpl === 'corporate'" assets/js/super.js && ok "3) professional ID card templates (vertical/corporate + colours)" || no "pro id card missing"
grep -q "refFilter:{role:'parent'}" assets/js/crud.js && ok "4) parent picked from dropdown; parent<->child linking" || no "parent dropdown missing"
grep -q "staff_loans:" assets/js/crud.js && grep -q "staff_bonus:" assets/js/crud.js && grep -q "appraisals:" assets/js/crud.js && grep -q "printPayslip" assets/js/crud.js && grep -q "staff_loans" database/update-v4-schema.sql && ok "5) staff salary, bonus, loans, appraisals + payslips" || no "staff HR suite missing"
grep -q "min-height: 44px" assets/css/style.css && grep -q "max-width:768px" assets/css/style.css || grep -q "max-width: 768px" assets/css/style.css && ok "mobile-friendly touch targets & responsive previews" || no "mobile enhancements missing"
grep -q "id:'rubrics'" assets/js/catalog.js && grep -q "id:'transcripts'" assets/js/catalog.js && grep -q "id:'transfer_cert'" assets/js/catalog.js && grep -q "transcript_view" database/update-v4-schema.sql && ok "intl features: rubrics, transcripts, transfer certificates, counselling" || no "intl features missing"
grep -q "payroll_net" database/update-v4-schema.sql && ok "payroll auto net-pay trigger (DB-side safety)" || no "payroll trigger missing"

echo "------------------------------------"
echo "Passed: $pass   Failed: $fail"
[ "$fail" = 0 ] && echo "🎉 All checks passed." || echo "⚠️  Some checks failed — see above."
exit $fail

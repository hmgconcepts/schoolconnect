# School Connect Diagnosis

Date: 2026-06-27

## Primary issue found

Generated school sites rendered their sidebar/menu in the initial HTML, then `assets/js/app.js` ran role filtering and hid links with `display:none`. On sites with a real Supabase client, a student/parent/incomplete profile could cause most or all selected school modules to disappear after loading.

## Fix applied

- Updated the generated `App.applyRoleNav()` runtime in `assets/js/generator.js`.
- Navigation links are no longer removed after load.
- Restricted modules remain visible and are marked with `nav-locked`/lock styling instead of disappearing.
- `ensureNavNotBlank()` now forcibly keeps selected modules visible.
- Added matching CSS in both the generated inline shell (`assets/js/templates.js`) and shared stylesheet (`assets/css/style.css`).

## Other defects found and fixed

- Removed stray 1-byte placeholder files: `assets/css/a`, `assets/js/A`, `assets/img/a`, `database/a`, `tools/a`.
- Fixed a broken apple-touch-icon reference in `index.html` from missing `assets/img/logo-192.png` to existing `assets/img/logo.svg`.
- Added audit and troubleshooting documentation expected by the repository verification script.

## Validation performed

- Parsed all JavaScript files with `node --check`.
- Ran `node verify-generated-output.js`.
- Ran `bash verify.sh`.
- Ran a local HTML asset-link audit.

# CBT Audit Report — School Connect Gen v8 (fixed build)

Date: 2026-07-04

- `node --check` passes for `assets/js/cbt-engine.js`.
- `cbt_get_public_exam` RPC strips correct answers before sending exams to students.
- Anti-cheat defaults: tab-switch, window-blur, copy/paste, right-click, fullscreen, watermark, devtools, max 5 violations.
- `listExams()` scopes non-admin teachers to their own exams (`teacher_id = SC_PROFILE.id`).
- CSV importer accepts mark/score, difficulty, tags and section columns.
- Verified sample banks: `database/sample-question-bank.csv`, `database/sample-questions.csv`.

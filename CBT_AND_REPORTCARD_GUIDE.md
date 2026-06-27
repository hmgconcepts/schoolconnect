# 🧠 CBT Engine & Interconnected Report Cards — Gen v2 Guide

This guide documents the **embedded Computer-Based-Testing (CBT) engine** added in
Gen v2, the **flexible report-card builder**, how they are **interconnected**, and a
**feature-by-feature comparison** with the HMG Academy Standalone CBT System
(https://cbtsystem-hmgacademy.vercel.app/ · https://github.com/hmgacademyhub/cbt-system).

Everything here uses **free tools only** and **no AI APIs**.

---

## 1. Why this was added

The previous School Connect "CBT" module was only a placeholder page — it had no real
exam engine, no question types, no anti-cheat, no certificates and no link to report
cards. Gen v2 replaces it with a **full CBT engine** modelled on the standalone HMG
CBT system, and then goes further: exam results **flow automatically into the
student's report card**.

---

## 2. Feature parity with the HMG Standalone CBT System

| Feature (HMG Standalone CBT) | In School Connect Gen v2? | Where |
|------------------------------|---------------------------|-------|
| 17 question types | ✅ Yes | `assets/js/cbt-engine.js` (`CBT.TYPES`) |
| Auto + partial-credit scoring | ✅ Yes | `CBT.scoreQuestion` / `CBT.gradeSubmission` |
| Negative marking | ✅ Yes | exam `negative_mark`, applied in grading |
| CSV question upload + template | ✅ Yes | `CBT.parseCSV`, "CSV Template" button, `database/sample-questions.csv` |
| Manual question entry | ✅ Yes (paste CSV) | CBT teacher page |
| 6-character access code + direct link | ✅ Yes | `cbt_exams.code`, share modal, `cbt-exam.html?code=` |
| WhatsApp share | ✅ Yes | Share modal (`wa.me`) |
| Open mode (no account) | ✅ Yes | `exam_mode='open'`, public RPC |
| Registered mode (roster) | ✅ Yes | `exam_mode='registered'`, `cbt_roster` table |
| Attempt limit | ✅ Yes | `attempt_limit`, enforced in `cbt_submit` |
| Question count selection (deliver a subset) | ✅ Yes | `select_count` + `CBT.prepareForStudent` |
| Randomised questions | ✅ Yes | `randomise` + `CBT.shuffle` |
| Countdown timer + warnings | ✅ Yes | student page timer |
| Question navigator + flag-for-review | ✅ Yes | student page grid + flags |
| Draft auto-save | ✅ Yes | `localStorage` per exam code |
| One submission / submit confirmation | ✅ Yes | `_done` guard + confirm dialog |
| Held vs instant results | ✅ Yes | `release_results` |
| Verifiable certificate / submission code | ✅ Yes | `cert_code` generated in `cbt_submit` |
| Emergency JSON backup on save failure | ✅ Yes | student page fallback download |
| Anti-cheat: tab-switch, blur, copy/paste, right-click, devtools, fullscreen | ✅ Yes | `CBT.startAntiCheat` + `anti_cheat_config` |
| Max-violations auto-submit | ✅ Yes | student monitor |
| Teacher results table + CSV export | ✅ Yes | CBT teacher page |
| Start/close exam window | ✅ Yes | `start_at` / `close_at` + wait room |
| Answers never exposed to students | ✅ Yes | `cbt_get_public_exam` strips `correct`/`explanation` |
| PWA / offline shell | ✅ Yes (inherited) | `manifest.json`, `sw.js` |
| SEO / lead-gen | ✅ Yes (inherited) | `robots.txt`, `sitemap.xml`, JSON-LD |
| **NEW: results → report card auto-mapping** | ✅ **Beyond standalone** | `cbt_push_to_reportcard` |

> The standalone system stores correct answers in the exam row and scores in the
> browser. Gen v2 hardens this: a **security-definer RPC** (`cbt_get_public_exam`)
> sends questions to students **without** the answers, and grading is also re-checked
> server-side in `cbt_submit`. Answers can still be graded client-side for instant
> feedback, but the authoritative record is created by the database.

---

## 3. How a teacher uses the CBT engine

1. Open **CBT / Online Exams** in the sidebar.
2. Click **+ New Exam / Test**. Fill subject, class, term, session.
3. Choose **Assessment type** (Exam / Test / CA / Assignment / Project / Quiz / Practical).
4. **Map it to a report-card column** (e.g. type `Exam` or `CA1` in *Report-card column*)
   and set the **Max score in report card** (e.g. 60 for the exam column).
5. Paste your questions as CSV (or choose a `.csv` file). Use the **CSV Template** button
   for the exact format. The 17 types are supported via the `Type` column.
6. Set duration, negative marking, and how many questions to deliver (0 = all).
7. Click **Create exam** → you get a **6-character code**.
8. Click **Share** to copy the link or send via WhatsApp.
9. Click **Results** to see live submissions and **Export CSV**.

### CSV format (extended, HMG-compatible)
```
Question,A,B,C,D,CorrectAnswer,Explanation,Type,Tolerance,Unit,Accept,MRQ_AON,Pairs,Items,Difficulty,Tags,Section
```
- **Type** is one of: `mcq, mrq, truefalse, short, numeric, matching, ordering, cloze,
  essay, categorization, multinumeric, assertion, casestudy, image, matrix, hottext, code`.
- **CorrectAnswer**: a letter (`C`) for MCQ; `A|B` for multiple response; a number for numeric;
  `1=A|2=B` for matching; `a|b|c` for ordering/cloze; keywords (`photosynthesis|chlorophyll`) for essay.
- **Tolerance**: numeric tolerance (or minimum word count for essays).
- **Accept**: pipe-separated accepted alternatives for short answer.

---

## 4. How a student takes an exam

1. Open the shared link (`cbt-exam.html?code=ABC123`) or visit the exam page and type the code.
2. Enter name (and student ID if the exam is in *registered* mode).
3. Read the instructions, then answer. Use the **navigator** to jump, **flag** to revisit.
4. The **timer** counts down; the **anti-cheat monitor** logs tab-switches etc.
5. Click **Submit**. If results are released, the student sees score, grade and a
   **certificate code**; otherwise a "Submission Received" screen.

---

## 5. The flexible report card

Open **Report Cards** in the sidebar.

1. Enter **Class, Subject, Term, Session** → **Load / Build**.
2. **Add assessment columns** with any name and an apportioned **max mark**:
   e.g. `CA1 (10)`, `CA2 (10)`, `Assignment (5)`, `Project (15)`, `Exam (60)`.
3. A grid of students appears. **Type each score** — it is validated against the max
   and saved instantly. Totals, percentages and grades compute live.
4. **CBT-sourced columns** are filled automatically (see §6).
5. **Export** the report grid to CSV.

> The structure is fully custom — every subject can have a different set of columns.
> This satisfies "the teacher/admin should be able to create columns, add subjects,
> and apportion marks for each test, assignment, project, etc."

---

## 6. The interconnection (CBT → report card)

This is the key new capability:

1. When you create a CBT exam, you set **Report-card column** (e.g. `Exam`) and a
   **Max score** (e.g. 60).
2. When a student submits, the server function **`cbt_push_to_reportcard`**:
   - finds (or creates) the matching column for that class+subject+term+session,
   - **scales** the raw CBT score onto the column's max mark
     (`scaled = raw_score / raw_total × max_mark`),
   - upserts the student's score into `report_scores` with `source = 'cbt'`.
3. The score then appears in the Report Cards grid and in the
   `report_subject_totals` view.

**Worked example (verified):** a 45/50 CBT exam mapped to an `Exam` column (max 60)
becomes **54/60**. Add a manual `CA1` of 8/10 and the subject total is **62/70 = 88.57%**.

Because everything shares one Supabase database, **every page, process and record is
interconnected** — students, classes, CBT, report cards, analytics and the activity
log all reference the same data.

---

## 7. Deployment (the four SQL files, in order)

In the Supabase **SQL Editor**, run:

1. `database/schema.sql` — core platform
2. `database/voting-schema.sql` — voting
3. `database/cbt-schema.sql` — CBT engine
4. `database/reportcard-schema.sql` — flexible report cards + the mapping function

Each prints a success message. They are **idempotent** (safe to re-run) and were
**verified on PostgreSQL 17** to run cleanly standalone and in order. Then paste your
Supabase URL + anon key into `assets/js/config.js` and host the files (see
`DEPLOYMENT-GUIDE.md`).

---

## 8. Free-tools note
The whole engine is browser + Supabase only. Scoring is deterministic (no AI). Optional
online **fee payments** use Paystack/Flutterwave checkout links (free to integrate;
you only pay per transaction). Media uses Google Drive links. Charts use Chart.js.

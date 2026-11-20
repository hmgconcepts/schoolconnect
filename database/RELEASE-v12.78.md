# School Connect — Release V12.78

**Date:** 8 November 2026 · **Supersedes:** V12.77 · **Schema:** `database/complete-schema.sql` (999,867 bytes)

Two things a person could not do before this release:

1. **A learner could not find out that a prep exam existed, or when to sit it.** A
   prep exam (rehearsal) lived only in the CBT manager and was reachable by a
   `?code=` link somebody had to hand out. There was no timetable row for it, so
   the dashboard's *Upcoming Exams* panel and the Exam Timetable page knew nothing
   about it either.
2. **A student could not keep their own ID card.** The four download/print buttons
   were inside the staff-only control card, so a signed-in student saw their card
   rendered on screen and had no way to download or print it.

Both are fixed in the database and on the page, and both are now guarded by their
own regression suites.

---

## 1. A prep exam is a sitting, and a sitting is on the timetable

A teacher creates the paper exactly as before (**CBT → + New Exam / Test →
🧪 Prep Exam (rehearsal)**), now with an optional **venue**. From the moment it is
saved:

- `sc_prep_sync_exam()` writes **one** row into `exam_timetable` — date, start,
  end (= start + duration), class, subject, term, session, venue, and the exam code
  in the note. The trigger `cbt_exams_prep_schedule` calls it on every save of the
  fields that matter.
- `exam_timetable.exam_id` remembers which exam the row came from, and a unique
  index (`exam_timetable_one_per_exam`) makes a second row for the same exam
  impossible. Re-saving **moves** the sitting; changing the class, the time or the
  venue moves it with it.
- **Archiving** the exam deletes the sitting; restoring brings it back.
- **Only prep exams schedule themselves.** Terminal exams, tests, assignments and
  projects never write a timetable row — that sheet belongs to the school.
- The **school's clock** is used (`Africa/Lagos` by default): a paper set for
  18:30 UTC is written as 19:30.
- A scheduling fault **never** costs a tutor their question bank — the trigger
  swallows its own error.
- **🔄 Reschedule prep exams** (CBT toolbar) calls `sc_prep_sync_all()` and
  rebuilds every sitting in one click, reporting what it wrote and cleared.

### The portal half

`sc_my_prep_exams(class, tz)` answers *"what do I sit, and when?"* for the person
signed in — a student's own class, a parent's children's classes, the whole school
for staff — in date-and-time order, with status (upcoming / open / closed),
attempts used, the last percentage, and the door. It returns **no question, no
option and no answer key**: the portal is a signpost, not a peep-hole. A
signed-out visitor gets an empty list; `anon` holds no EXECUTE grant.

Surfaced in three places:

| Where | What it shows |
|---|---|
| Dashboard (student + parent) | **🧪 Prep Exams — what you sit, and when**: date, time range, duration, venue, status, last score, **Sit now →** |
| `exam-timetable.html#prep-exams` | the same list, one table, plus the count |
| Existing **🗓️ Upcoming Exams** panel | the synced row appears with no extra code, because it *is* a timetable row |

## 2. Your own ID card

The action bar (**⬇ Download PDF**, **🖨 Print ID Card**, **⬇ HTML proof**) now
stands outside the staff-only card and speaks to whoever is signed in:

- **Student** — their own card only. **🖨 Print ALL** is not offered; the
  design, card-type and class controls remain staff-only. The bar says so:
  *"This is your own card… You cannot see or print anyone else's card."*
- **Parent** — their linked children, labelled *my children*.
- **Staff / admin** — the whole school, with the class filter as before.

The safeguard is the data, not the button: every action works on `ICUI.all`,
which the loader has already scoped (a student's list holds exactly one record).
The PDF filename and `filterLabel()` no longer promise *whole school* to someone
who can only ever produce one card.

---

## 3. What was proved

| Suite | Checks | What it proves |
|---|---|---|
| `tools/verification/t45-prep-schedule.mjs` | 33 | one row per prep exam; an edit moves it; archive removes it; a non-prep exam writes nothing; the school clock; another class's paper invisible; parent sees their child; staff see the school; a signed-out visitor sees nothing; `anon` cannot execute either function; the repair path rebuilds every missing sitting |
| `tools/verification/t46-prep-portal.mjs` | 39 | in a real browser: the dashboard card renders open/upcoming/closed correctly, the *Sit now* link carries the code, a closed paper offers no way in, nothing question-related appears, the timetable panel links into the paper, the CBT form has the venue field, the explanation appears only for a prep exam, and the reschedule button reaches `CBTUI.resyncPrep` |
| `tools/verification/t47-idcard-self-service.mjs` | 36 | in a real browser: a student sees the bar, no bulk button, exactly one record in the list, and a real downloaded PDF that contains their card and no other name; a parent sees their two children only; staff keep the whole school and the design controls |

Full gate: `bash /home/user/work/run-all-tests.sh` → **ALL SUITES PASS** (68 suites,
`work/gate1278.log`).

## 4. Upgrading

1. Back up (Supabase → Database → Backups, or a `pg_dump`).
2. Paste `database/complete-schema.sql` once in the SQL editor. It is idempotent.
   You should see: `V12.78 installed — a prep exam set for a class is a timetable
   sitting, and every learner can find it`.
3. Upload the new files (or the ZIP) and hard-reload (Ctrl/Cmd + Shift + R).
4. Run the four checks in `DEPLOYMENT.md` §15.

**Rolling back.** V12.78 only adds objects — one column on `cbt_exams`, three on
`exam_timetable`, one unique index, three functions, one trigger — and changes no
column type. A file-only rollback is safe for readers; the database rollback needs
the backup.

## 5. Carried forward

- **Schema budget.** The pack is 999,867 bytes against Supabase's 1,000,000-byte
  paste limit. V12.78 fitted by compacting its own SQL; the next release must
  reclaim space from superseded migration narrative before it adds anything.
- V12.78 changes nothing in fees, reports, CBT scoring or the ID-card renderer
  itself; those engines are untouched and their suites still pass unchanged.

---

## 6. Getting the files (and why the preview panel cannot hand them over)

**Symptom.** The workspace viewer sits on *"Updating…"* and the ZIP never appears;
or a download button in the in-app preview does nothing at all.

**There are two separate causes, and neither one is a corrupt ZIP.**

1. **The workspace viewer publishes the whole workspace before it opens a file.**
   That is about **75 MB** of pages, schema, tools and release ZIPs (down from
   ~90 MB; two stale generator test archives and a font cache were removed this
   round). The spinner is that upload, not the file. It has nothing to do with
   the archive's contents.
2. **A sandboxed preview frame is not allowed to download.** The in-app preview
   renders pages inside a frame with `sandbox="allow-scripts"`, and browsers
   refuse to start *any* download from such a frame. A link that looks dead is
   behaving exactly as specified.

**The fix — the download shelf.** `python3 /home/user/work/downloads.py` serves
the same files straight from disk on port 8080. It has been rebuilt this round:

- every link is an **absolute URL** built from the host the request arrived on,
  printed on the page and copyable with one click;
- the page **detects that it is inside the preview frame** and says, in plain
  words, "open the shelf in its own tab, or copy a link" — instead of leaving a
  button that silently cannot work;
- ZIPs are served with `Content-Disposition: attachment`, an exact
  `Content-Length`, `Cache-Control: no-store` and **HTTP Range** support, so a
  partially downloaded 7 MB archive can be resumed;
- the page prints each file's size and the first 16 characters of its SHA-256,
  so a completed download can be checked;
- a plain HTML list of the raw URLs sits at the bottom for anything without
  JavaScript.

**Proved by** `/home/user/work/verify-shelf.mjs` (15 checks, real Chromium):

| Case | Result |
|---|---|
| Shelf opened in its own tab | the page loads in ~26 ms, every link is absolute, and clicking **Download** delivers `schoolconnect-v12.78.zip` at **7,170,695 bytes** with the **same SHA-256 printed on the page** |
| Shelf embedded in a `sandbox="allow-scripts"` frame | the warning is shown, and a click started *inside the frame* produces **no download event at all** — the reported bug, reproduced and then explained on screen |

**In one line:** open the download shelf in its own tab (the ⤢ control on the
preview), or copy a URL off the page and paste it into a normal browser tab.

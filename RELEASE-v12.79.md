# School Connect — V12.79

Round 24. Six reported defects, fixed and proved. Nothing here is aspirational: every claim below is
attached to a suite that fails if the behaviour regresses, and the suite list is at the bottom.

Install for an existing school: open **Supabase → SQL Editor**, paste **`database/complete-schema.sql`**
(one file, idempotent, final message ends with the schema-reload notice) and run it once. Then reload the
portal. Nothing else to download or configure.

---

## 1. A tutor's hand-drawn signature now saves

**What was reported.** Saving a drawn signature ended in
`Upload failed: new row violates row-level security policy … ask the administrator to run
database/complete-schema.sql once.` The advice was wrong: the schema *was* installed.

**What was actually wrong — two things, not one.**

1. The page uploaded to the `branding` bucket, which is admin-only by design. A tutor has no business
   writing there, so RLS correctly refused, and the error surfaced verbatim.
2. Even when a tutor tried to store the drawing on their own profile, the `sc_prevent_embedded_media()`
   guard refused every `data:` value in `signature_url`, so a drawn PNG could never be kept.

**The fix.**

- New bucket `signatures`: public read (a signature must render on a report card for anyone who opens
  it), writes restricted to the tutor's own folder (`name like auth.uid()::text || '/%'`), 512 KB,
  `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`.
- `sc_signature_save(text, text)` is the one write path. It accepts a `data:image/…` value up to
  200,000 characters (a drawn 300-dpi signature is a few KB), still caps ordinary links at 2,000, and
  refuses anything else in words a tutor can act on ("That signature image is too large (over 200 KB)…").
- `sc_prevent_embedded_media()` keeps its guard for every other column and now allows a data URL in
  `signature_url` only.
- `profile.html` saves through three routes in order — the `signatures` bucket, the admin/legacy
  `branding` bucket, then a data URL on the tutor's own row — then calls the RPC, then **reads the value
  back** with `sc_my_signature`. The success message appears only when the read-back confirms it.
  Anything else produces a specific warning instead of a false "saved".

**Proof.** `tools/verification/t49-signature-save.mjs` — 13 checks, including: a teacher is refused on
`branding` (the reported error, reproduced); own folder allowed; another tutor's folder refused; an
unrelated bucket refused; a signed-out visitor can still *read* a signature image; a drawn PNG saves and
lands on the right profile with a timestamp; an ordinary https link still saves; an absurd image and a
3,000-character link are both refused in plain words; saving never touches another tutor's profile; and a
caller with no session cannot invoke `sc_signature_save` at all.

---

## 2. "Pick a staff" listed students — a regression test, not a repair

The current build was already correct: with card type **staff** the picker offers staff only, with
**student** it offers students only, in both directions. Rather than change working code, the behaviour is
now nailed down by `tools/verification/t50-idcard-picker.mjs` (15 checks) so it cannot come back.

---

## 3. Download / Print / Print ALL now produce the previewed card

**What was reported.** Choose a professional template, look at the preview, press
"⬇ Download PDF" — and the file is a different design.

**Why.** There were two renderers. The preview called `Super.idcard.pairHtml()`, which measures the design
once and gives both faces the same canvas. The PDF engine was handed *data* and painted its own generic
idea of a card. Same person, two drawings.

**The fix — one renderer, then a photograph of it.**

- New `assets/js/idcard-raster.js` renders the **same pair** the preview renders
  (`Super.idcard.pairHtml`, same `faceOpts`), at print resolution, and photographs each face into a canvas.
  The PDF engine places that picture in the card's exact millimetre box.
- Three traps had to be beaten, and each is documented in the file:
  - a CSS `transform: scale()` **is not applied** when Chromium rasterises an SVG `<foreignObject>`, so the
    card came back as a zoomed-in crop of its top-left corner. The design is therefore photographed at its
    natural size and the canvas applies the preview's own scale and offset.
  - an SVG built from a `data:` URL has no base URL, so `url(...)` references in the copied stylesheet die
    and the card comes back in a fallback font with different line breaks. Every CSS resource is fetched
    once and inlined.
  - rendering the front and the back *separately* gives them different canvases, and a design that paints
    its own height (the serif "heritage" template) then lays out differently from the preview. The pair is
    rendered once, exactly as the preview does.
- A missing or unreachable photo becomes a marked placeholder and the run continues: a dead Drive link must
  never cost the school 147 cards.
- New control on the page, **"How the file is drawn"**:
  - `exactly what is previewed` (default) — the chosen design, pixel for pixel;
  - `re-drawn with editable text` — the older vector renderer, for print shops that must edit wording.
  The trade-off is stated on screen instead of hidden: a photograph is faithful but its text is not
  editable; the vector file is editable but it is a plain data layout, not the chosen artwork.
- The success toast now describes the file that was actually produced.

**Proof.** `tools/verification/t51-idcard-pdf-exact.mjs` — 25 checks. It opens the real page, chooses
"Aurora" with a colour that cannot be confused with the generic layout, screenshots the preview, downloads
the PDF a school downloads, pulls the picture out of the PDF and compares it with the screenshot
(8×8 average-colour grid, mean absolute difference): **7.2 of 255**. It repeats with "Heritage" (9.4), proves
the two files really differ (114.3) — so the file follows the menu, not a constant — proves the vector
option still embeds a real font, proves **Print** asks for the very same photographed cards, and runs every
file through `pdf-struct-check.py` (39/40 structural checks, no transparency groups, true A4).

---

## 4. Every file opens in CorelDRAW and other layout software

- The picture in the default PDF is a single JPEG image XObject (`/DCTDecode`), the format every layout,
  print-shop and RIP program imports without a plugin.
- The page is a plain A4 (or exact-card, or custom) page in points, with no transparency groups, no SMasks
  and no optional content — the features that make CorelDRAW and older RIPs choke.
- The vector option embeds a real font subset (`/FontFile2`), so a print shop can still edit wording.
- `tools/verification/pdf-struct-check.py` is part of the gate and checks the object graph, not just the
  file header.

---

## 5. Prep exams: "Sit now" at the due moment, and nowhere else

**Server half (already in this release line).** `sc_my_prep_exams(class, tz)` answers per role — own class
for a student, children's classes for a parent, whole school for staff — and returns `status`,
`seconds_to_start`, `seconds_to_close` and `server_now`, so the device clock is never the authority.

**Two real lapses found and fixed on the pages.**

1. **A student was locked out of the Exam Timetable.** The page's own navigation entry names `parent` and
   `student` as readers, but `enforceCurrentPageAccess()` consulted the module maps *instead of* that list
   and replaced the page with "🔒 Restricted Page". So the one screen that lists a learner's sittings — and
   links "Sit now" — was shut to learners, while the dashboard happily linked them to it.
   A role written literally in a page's own `data-role-allow` list is now believed; the page is served
   read-only (edit buttons stripped, RLS still guarding every row).
2. **"Sit now" never appeared for a page left open.** A list painted at 08:58 said "opens 09:00" for ever.
   Every upcoming row now carries the moment it opens (from the server's `seconds_to_start`) and a
   one-second countdown; at zero the list asks the **server** again — nothing is opened early, and the
   button appears by itself inside the window. The same helper (`App.prepWhenCell` / `App.armPrepOpeners`)
   is used by the dashboard and the Exam Timetable, so the two cannot drift.

The exam page itself was audited too: before the window it says "Not open yet" with a countdown that
reloads and unlocks by itself at the due second; after the window it says "Closed"; a roster or class
mismatch is named; and no question is rendered in any of those states.

**Proof.** `tools/verification/t52-prep-window.mjs` — 13 checks: no "Sit now" before the window, a live
countdown instead, the button appearing by itself when the clock crosses the boundary (with the page's
own clock played by the test), the button pointing at that sitting, the upgrade coming from a fresh server
read, plus three gate states on `cbt-exam.html` each showing the reason and zero questions.

---

## 6. Every file updated, in every repo

`schoolconnect` (generator), `gosaportal` and `schoolconnectdemo` are in lockstep: same logic, branding
aside. Each page was patched at the root **and** in `assets/templates/pages/`, the sync script reports no
template drift, and the service-worker cache name is bumped to `v12.79` so every installed client fetches
this version.

---

## Schema

`database/complete-schema.sql` — **992,405 bytes**, one file, idempotent, ends with the schema-reload
notice. New in this release: bucket `signatures` and its policies, `sc_signature_save(text,text)`,
`sc_class_key(text)`, the rewritten `sc_my_prep_exams(p_class,p_tz)`, the `signature_url` exception in
`sc_prevent_embedded_media()`, and three `is_open` gates that now refuse only when an exam is not open and
has no start time.

135 tables · 278 functions · 332 policies · 87 indexes · 36 triggers · 5 views.

---

## The gate

`bash /home/user/work/run-all-tests.sh` runs every suite, old and new. New this round:
`t49-signature-save` (13), `t50-idcard-picker` (15), `t51-idcard-pdf-exact` (25), `t52-prep-window` (13).
Plus `verify-complete-schema` ALL PASS, `t45` 33/0, `t46` 39/0, `tmp-notify-order` 11/0,
`tmp-selfcontained` 32/0, and the platform audit `tools/audit-v5.py` **513 passed, 0 failed**.

One audit change worth naming: the schema builder strips prose banners to stay inside the 1 MB
SQL-editor limit, and five audit checks had been grepping those banners rather than the SQL. They now
assert the constructs themselves (`dbl_placed` really is written, `sc_can_vote` really is defined once and
has no admin bypass, the CBT reader really defaults the candidate to `null`), so both the audit and the
schema can move without pretending.

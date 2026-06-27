# ⭐ Super Features Guide — School Connect Gen v3

Gen v3 extracts the standout ("super") features from the original School Connect
builder (https://hmgtechnologies.github.io/schoolconnectv2/ ·
https://github.com/hmgtechnologies/schoolconnectv2) and **implements them inside every
generated school site**, then adds new enterprise super features. Everything is
**interconnected** through one shared Supabase database and one shared school config,
uses **only free tools**, and contains **no AI APIs**.

All super features live in one small file: **`assets/js/super.js`**, loaded on every
page and initialised with `Super.init(sb, window.SCHOOL)`.

---

## 1. 💬 School Help Chatbot (rules-based, no AI)

**What it is.** A floating help assistant on every page of the school portal. It
answers common questions about login, CBT, report cards, fees, attendance, voting,
notifications, installation, ID cards, certificates, backups, analytics and search.

**Why it's "super".** The original builder had a rules-based chatbot only on the
*builder* site. v3 ports it into the *generated school site* and tailors the knowledge
base to the live modules — so parents, students and staff get instant self-service help
without any paid AI API.

**How to use.** Click the 💬 button (bottom-right) on any page, type a question, press
Enter. It matches keywords against a built-in knowledge base and replies instantly.

**Where.** `Super.chatbot` in `assets/js/super.js`. Add school-specific answers by
editing the `KB` array.

---

## 2. 🔎 Global Command Palette / Cross-Module Search (Ctrl + K)

**What it is.** Press **Ctrl + K** (or ⌘ + K) anywhere to open a search box that:
- jumps to **any module page** (Dashboard, Students, CBT, Report Cards, Fees…), and
- **searches live data** across modules — students, staff and exams — in one place.

**Why it's "super" & interconnected.** It ties every module together: one keystroke
finds a student, the exam they sat, or the page you need. This is the connective tissue
that makes "every page/process interlinked".

**How to use.** Press Ctrl/Cmd + K → type 2+ letters → click a result (or a module).
Esc closes it.

**Where.** `Super.palette`. Add more searchable tables in `palette.search()`.

---

## 3. 🔔 Multi-Channel Notification Fan-Out Hooks

**What it is.** A single helper, `Super.notify.fire(title, body, opts)`, that any module
can call after an event (a result published, a fee recorded, a poll opened). It:
- writes an **in-app notification** row (`notifications` table),
- shows a **browser push** if permission is granted, and
- returns ready-made **WhatsApp / email / SMS** deep-links (all free).

**Why it's "super" & interconnected.** It lets every module broadcast through the same
notification system, so the school communicates consistently without paid gateways.

**Where.** `Super.notify`. Example: after publishing report cards, call
`Super.notify.fire('Results released', 'First term results are now available.')`.

---

## 4. 🪪 Digital ID-Card Generator (with QR)

**What it is.** A page (`idcards.html`) that builds branded student/staff ID cards with
a scannable **QR code** (encodes the person's ID for attendance scanning) and prints
straight from the browser.

**Why it's "super" & interconnected.** Pick a real student from the database (or enter
manually); the card uses the school logo, colours and contact details. The QR ties back
to the attendance/ID workflow.

**Free tools.** QR is rendered via a free QR image endpoint; printing uses the browser's
native print dialog (save as PDF). No paid service.

**Where.** `Super.idcard` + `Generator.pageIdCards`.

---

## 5. 📜 Certificate Generator (printable, verifiable)

**What it is.** A page (`certificates.html`) to issue branded certificates
(achievement, graduation, testimonial) each with a unique **verification code**, saved
to the `certificates` table and printable instantly.

**Why it's "super" & interconnected.** CBT exams already auto-issue certificate codes;
this page lets staff issue manual certificates with the same verifiable-code pattern.

**Where.** `Super.cert` + `Generator.pageCertificates`.

---

## 6. 📰 Marketing Flyer Generator (lead-gen)

**What it is.** A page (`flyer.html`) that produces a printable, branded promotional
flyer/poster for the school — for admissions drives and parent outreach.

**Why it's "super".** The original builder shipped a flyer page for the *product*; v3
gives every *school* its own auto-branded flyer (logo, colours, motto, contact details),
supporting admissions lead-generation.

**Where.** `Super.flyer` + `Generator.pageFlyer`.

---

## 7. 💾 Draft Autosave + Data Export/Import (from "Projects")

**What it is.** The original builder let users **save/load/export/import** wizard
projects. v3 generalises this:
- **Draft autosave**: long forms can auto-save to `localStorage` and restore on reload
  (`Super.data.bindAutosave(formEl)`), so work is never lost.
- **Export/Import & full backup** of school data is provided by the **Admin Data
  Console** (`admin-data.html`): read, delete, JSON backup, restore, per-table CSV.

**Why it's "super" & interconnected.** Combined with the Admin Data Console, a school
can fully **read, delete, back up and restore every record** on its site — satisfying
"we should be able to read, delete, backup every detail on the site built for the
client".

---

## 8. 📊 Analytics (informed decisions)

Carried from v2 and still present: `analytics.html` shows live, platform-wide KPIs and
Chart.js charts (enrollment trend, CBT score distribution, fees, attendance, etc.) so
admins can track every process and make informed decisions.

---

## How it all connects

```
                 window.sb  (one Supabase DB)
                 window.SCHOOL (one config: name, logo, colours, modules)
                          │
   ┌──────────────────────┼─────────────────────────┐
   ▼                      ▼                          ▼
 super.js              cbt-engine.js             analytics.js
 (chatbot, palette,    (exams → results)         (KPIs/charts)
  notify, ID cards,         │
  certs, flyer)             ▼
                     report cards (auto-mapped scores)
                          │
        every module page loads super.js + app.js + config.js
        → chatbot, Ctrl+K search and notifications are available everywhere
```

Because every page loads the same `super.js`, `config.js` and `app.js` and talks to the
same database, **all pages and processes are interconnected** — search finds anything,
the chatbot knows every module, notifications reach everyone, and CBT results flow into
report cards.

---

## Deployment note
No new SQL is required for the super features beyond the four files already documented
(`schema.sql`, `voting-schema.sql`, `cbt-schema.sql`, `reportcard-schema.sql`). The
chatbot, command palette, ID-card/certificate/flyer generators run in the browser; the
notification hooks use the existing `notifications` table. See `DEPLOYMENT-GUIDE.md`.

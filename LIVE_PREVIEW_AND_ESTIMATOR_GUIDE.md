# 🖥️ Full Interactive Preview & 💰 Pricing Estimator — v3.1 Guide

These two "super features" were extracted from the earlier School Connect builder
(https://hmgtechnologies.github.io/school-connect/ ·
https://github.com/hmgtechnologies/school-connect) and added **cumulatively** to this
build — **nothing existing was removed**. Both run 100% in the browser, use only free
tools, and contain **no AI APIs**.

---

## 1. 🖥️ Full Interactive Multi-Page Preview

### What it is
A **"try-before-you-download"** experience. After filling the wizard, click
**🖥️ Full Interactive Preview** (Step 6). A modal opens an iframe that runs the **real
generated pages** — Dashboard, Students, Staff, Results, **Report Cards**, **CBT**,
Fees, Attendance, Library, Events, Voting, ID Cards, Certificates, Analytics, etc. —
against a **mock Supabase client seeded with realistic Nigerian-school sample data**.

You can **click through every page** in the left navigation and see exactly what the
school will get, with sample students, results, exams, fees and announcements already
populated. No backend, no Supabase, no download required.

### Why it matters (interconnection)
It proves the platform is **interconnected** before you commit: the same pages, the same
navigation, the same modules you selected — all wired together — appear in the preview.
What you preview is what the ZIP generates.

### How it works (free, no backend)
- `Generator.fullPreviewHtml(config)` assembles **one self-contained HTML document**:
  - it renders the real page bodies from `templates.js` / the dedicated page builders,
  - injects the real `style.css`,
  - and ships a tiny **mock Supabase client** (`mockClient`) plus seeded demo tables
    (`_previewDemoData`) so `sb.from('students').select()...` returns sample rows.
- A left nav switches pages instantly; data tables and dashboard KPIs auto-fill from the
  demo data.
- Auth redirects are neutralised so the preview never bounces to a login screen.

### How to use
1. Open `builder.html`, complete the wizard (or load a preset).
2. Go to **Step 6 · Preview & Generate**.
3. Click **🖥️ Full Interactive Preview**.
4. Click each item in the left menu to explore. Close the modal to return and download.

> Tip: there is also a lighter **👁️ Quick Preview** that opens just the public landing
> page in a new tab.

---

## 2. 💰 Instant Pricing Estimator (optional Done-for-You)

### What it is
The platform is **free forever** to run. The estimator gives an **itemised, instant
quote** for the *optional* service where HMG Concepts builds, brands, deploys and trains
your staff — so a school knows the cost up-front without contacting anyone.

### What it calculates
```
total = base build
      + (number of selected modules × per-module rate)
      + (number of departments × per-department rate)
      + any ticked add-ons
```
- **Base build & branding** — ₦35,000
- **Per module** — ₦4,500 each (only the modules you picked)
- **Per department** — ₦1,500 each
- **Add-ons** (tick any): deploy-for-you, staff training, bulk data import,
  report-card template customisation, custom domain, 3-months priority support.

The quote updates **live** as you tick add-ons, and a **"Request this on WhatsApp"**
button pre-fills a message to HMG Concepts.

### Where it is
Step 6 of the builder, under **💰 Instant Estimate**. Powered by `Generator.estimate()`
and `Generator.PRICING` in `assets/js/generator.js`, wired by `Wizard.recalcQuote()`.

> The estimator never affects the generated platform — the software the school downloads
> is always **₦0/month**. It only quotes optional human setup help.

---

## 3. What was added vs. kept (cumulative, additive, progressive)

| Item | Status |
|------|--------|
| Full interactive multi-page preview | ✅ **Added** in v3.1 |
| Pricing estimator (itemised + add-ons + WhatsApp) | ✅ **Added** in v3.1 |
| CBT engine, report cards, analytics, admin data console (v2) | ✅ Kept |
| Help chatbot, command palette, ID/cert/flyer generators (v3) | ✅ Kept |
| Voting, notifications, PWA, SEO, 65 modules, 86 themes, presets | ✅ Kept |
| All four verified SQL files + all docs | ✅ Kept |

**Nothing was removed.** Every feature from every previous version is still present; v3.1
only *adds* the two super features above.

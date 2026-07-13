# Maintainer Notes — School Connect Gen v8 (fixed build)

## How generated sites get their runtime

The builder does NOT template `assets/js/app.js` per school. The same shared
runtime files (`app.js`, `crud.js`, `cbt-engine.js`, `report-engine.js`,
`notifications.js`, `voting.js`, `site-help.js`, `super.js`, `enterprise.js`,
`pwa-install.js`, `analytics.js`) are copied verbatim into the generated output
ZIP. Only `assets/js/config.js` is generated per school (name, motto, colours,
contact details, Supabase keys, siteUrl).

Consequence: **any bug fixed in a shared runtime file here is automatically
fixed in every future generated site** — but already-generated client sites
must re-download or manually replace the affected file.

## Builder-only files (must NEVER appear in a generated ZIP)

- `assets/js/generator.js` (contains ZIP pipeline + placeholder key text)
- `assets/js/templates.js`
- `assets/js/wizard.js`
- `assets/js/preview.js`
- `assetsets/js/catalog.js`
- `assets/js/chatbot.js`

The gosaportal demo deployment shipped several of these (including two stale
divergent copies at repo root). They are dead weight, an information leak of
the generator internals, and a version-skew trap. The generator never bundles
them — if they appear on a client site they were committed manually.

## Verification

- `node verify-generated-output.js` — checks the v8 dynamic emit pipeline
  (dedicatedPages array + `zip.file(p.id + '.html')` + `pageFileName`).
- `node verify-role-navigation.js` — role/nav visibility rules.
- `bash verify.sh` — cumulative feature checks. Sections that referenced the
  old v7 function-per-page architecture (`pageCBT`, `pageStorage`, …) have
  been updated to check the v8 equivalents.

## Known intentional behaviours

- Generated `sitemap.xml` lists only PUBLIC pages (/, about, contact, apply,
  login, feature-guide). Auth-gated pages must not be submitted to Google.
- Generated `manifest.json` + `sw.js` use RELATIVE URLs so a school can host
  under a sub-path (GitHub Pages project site).
- `offline.html` is emitted by `Generator.generateOfflinePage()` and precached.

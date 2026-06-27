// ====================================================================
// School Connect Gen v3 — Builder Site Config (this repo)
// -------------------------------------------------------------
// This file is for the GENERATOR TOOL itself (the public builder).
// The school platforms it PRODUCES get their own generated
// `assets/js/config.js` with the school's Supabase keys.
// The builder tool needs no backend — it runs 100% in the browser.
// ====================================================================

const BUILDER_VERSION = '8.0.0';
const BUILDER_PRODUCT = 'School Connect FINAL (Cumulative Edition)';

// Supabase (optional — the builder works in demo mode without it).
// To enable live data on the builder's demo pages (voting, notifications):
// 1. Create a free Supabase project at https://supabase.com
// 2. Run database/schema.sql in the SQL Editor
// 3. Paste your URL and anon key below
// 4. Redeploy
window.SUPABASE_URL = '';   // 'https://abc.supabase.co'
window.SUPABASE_KEY = '';   // 'eyJ...your-anon-key...'

// Optional VAPID public key for Web Push (generate with `npx web-push generate-vapid-keys`)
// window.SC.VAPID_PUBLIC = 'BAd...';

// HMG Ecosystem lead-gen link
const HMG_LINK = 'https://hmgconcepts.pages.dev/';

console.log('%c[School Connect FINAL Builder] cumulative edition ready — every feature from every build retained: CBT engine, flexible report cards, analytics, admin console, chatbot, Ctrl+K palette, ID/cert/flyer, full interactive preview, pricing estimator. 65 modules. No AI APIs.', 'color:#4f46e5;font-weight:bold;font-size:13px');

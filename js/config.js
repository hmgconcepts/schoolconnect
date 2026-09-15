// =============================================================
// School Connect — Builder Tool Config (THIS REPO / generator)
// -------------------------------------------------------------
// FIX S1 (audit): This file is the config for the GENERATOR TOOL
// itself (the public builder at builder.html). It is NOT a client
// school config. A previous build had committed a generated client
// config (God of Seed Academy) complete with a live Supabase key
// and a wrong siteUrl into this file — contaminating the builder.
//
// The builder runs 100% in the browser and needs NO backend of its
// own. Per-school Supabase keys belong ONLY in the generated
// assets/js/config.js that the wizard writes into each client ZIP
// (see Generator.generateConfigJS), never here.
// =============================================================

const BUILDER_VERSION = '8.0.0';
const BUILDER_PRODUCT = 'School Connect Gen v8';

// Lead-generation / brand link (shown on generated sites).
const HMG_LINK = 'https://hmgconcepts.pages.dev/';

// Builder globals. The wizard/catalog populate SC.THEMES & SC.MODULES
// at runtime; we only guarantee the namespaces exist here.
window.SC = window.SC || {};
window.SC.THEMES = window.SC.THEMES || [];
window.SC.MODULES = window.SC.MODULES || [];

console.log('%c[School Connect v8 Builder] ready — generate a school platform in minutes.', 'color:#4f46e5;font-weight:bold;font-size:13px');

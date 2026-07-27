#!/usr/bin/env bash
# School Connect V5 maintained verification entry point.
# Historical version-specific checks remain in verify-legacy.sh and verify-v*.js.
set -euo pipefail
cd "$(dirname "$0")"
echo "School Connect V5.8 — cumulative release verification"
echo "=================================================="
echo "[0/6] Installing development-only test dependencies"
npm install --silent --no-audit --no-fund

echo "[1/6] JavaScript syntax"
for f in assets/js/*.js tools/*.js verify-generated-output.js verify-role-navigation.js verify-v5-cbt-tabs.js verify-v6-enterprise-workflows.js; do node --check "$f" >/dev/null; done
python3 tools/test-inline-scripts.py

echo "[2/6] SQL, links, cross-repository parity and critical contracts"
python3 tools/audit-v5.py
node tools/test-complete-schema-idempotence.mjs

echo "[3/6] Generator packaging contract"
node verify-generated-output.js

echo "[4/6] Role navigation/RLS-facing UI contract"
node verify-role-navigation.js
node tools/test-v57-professional-audit.js
node tools/test-v58-data-integrity.js

echo "[5/6] CBT scoring/tabs and sample-document workflows"
node verify-v5-cbt-tabs.js
node tools/test-cbt-scoring.js
node tools/test-cbt-sql-engine.mjs
node tools/test-report-output.js
node tools/test-report-bulk.js
node tools/test-timetable-sql-engine.mjs
node tools/test-demo-seed-sql.mjs
python3 tools/audit-demo-coverage.py
node tools/test-teacher-scope-sql.mjs
node tools/test-data-portability.js
node verify-v6-enterprise-workflows.js

echo "[6/6] Real traditional + modern ZIP generation"
node tools/test-generator-build.js

echo "=================================================="
echo "School Connect V5.8 verification PASSED"

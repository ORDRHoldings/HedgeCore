#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/completion_gate.sh
#
# Phase 4: Completion gate for Audit Lab + Decision Desk build.
#
# Checks:
#   1. Python unit tests pass (audit + decision engines + API-level tests)
#   2. ruff lint passes on new engine + route files
#   3. TypeScript compiles without errors
#   4. Frontend build succeeds
#   5. Key files exist
#
# Usage: bash scripts/completion_gate.sh
# Exit code 0 = gate PASSED. Non-zero = gate FAILED.
# ─────────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ERRORS=()

ok()   { echo "  ✓ $1"; ((PASS++)) || true; }
fail() { echo "  ✗ $1"; ERRORS+=("$1"); ((FAIL++)) || true; }

echo ""
echo "═══════════════════════════════════════════════════"
echo " ORDR Terminal — Audit Lab + Decision Desk Gate"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── 1. File existence checks ────────────────────────────────────────────────

echo "[ 1 ] File Existence"

FILES=(
  "backend/app/engine/audit_engine.py"
  "backend/app/engine/decision_engine.py"
  "backend/app/api/routes/v1_audit_lab.py"
  "backend/app/api/routes/v1_decision_desk.py"
  "backend/tests/test_audit_engine.py"
  "backend/tests/test_decision_engine.py"
  "backend/tests/test_audit_lab_api.py"
  "backend/tests/test_decision_desk_api.py"
  "backend/tests/fixtures/audit_sample.csv"
  "frontend/src/app/audit-lab/page.tsx"
  "frontend/src/app/audit-lab/upload/page.tsx"
  "frontend/src/app/audit-lab/runs/[run_id]/page.tsx"
  "frontend/src/app/decision-desk/page.tsx"
  "frontend/src/app/decision-desk/runs/[run_id]/page.tsx"
  "docs/PHASE0_RECON.md"
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    ok "Exists: $f"
  else
    fail "MISSING: $f"
  fi
done

# ─── 2. ruff lint ─────────────────────────────────────────────────────────────

echo ""
echo "[ 2 ] Ruff Lint (backend engine + routes)"

cd backend
if command -v ruff &>/dev/null; then
  if ruff check app/engine/audit_engine.py app/engine/decision_engine.py \
       app/api/routes/v1_audit_lab.py app/api/routes/v1_decision_desk.py \
       --quiet 2>&1; then
    ok "ruff: no violations in new files"
  else
    fail "ruff: lint violations found"
  fi
else
  echo "  ⚠ ruff not installed — skipping lint check"
fi
cd ..

# ─── 3. Python unit tests ─────────────────────────────────────────────────────

echo ""
echo "[ 3 ] Python Unit Tests"

cd backend
if command -v python &>/dev/null || command -v python3 &>/dev/null; then
  PYTHON=$(command -v python3 || command -v python)
  if $PYTHON -m pytest tests/test_audit_engine.py tests/test_decision_engine.py \
       tests/test_audit_lab_api.py tests/test_decision_desk_api.py \
       -v --tb=short -q 2>&1; then
    ok "pytest: all engine + API-level tests passed"
  else
    fail "pytest: some tests failed"
  fi
else
  echo "  ⚠ python not found — skipping tests"
fi
cd ..

# ─── 4. TypeScript compile check ──────────────────────────────────────────────

echo ""
echo "[ 4 ] TypeScript Compile"

cd frontend
if command -v npx &>/dev/null; then
  if npx tsc --noEmit 2>&1; then
    ok "tsc --noEmit: no type errors"
  else
    fail "tsc --noEmit: type errors found"
  fi
else
  echo "  ⚠ npx not found — skipping tsc check"
fi
cd ..

# ─── 5. Frontend build ────────────────────────────────────────────────────────

echo ""
echo "[ 5 ] Frontend Build"

cd frontend
if command -v npx &>/dev/null; then
  if npx next build 2>&1; then
    ok "next build: success"
  else
    fail "next build: failed"
  fi
else
  echo "  ⚠ npx not found — skipping build"
fi
cd ..

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
echo " Gate Summary: ${PASS} passed · ${FAIL} failed"
echo "═══════════════════════════════════════════════════"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo " Failed checks:"
  for e in "${ERRORS[@]}"; do
    echo "  ✗ $e"
  done
  echo ""
  echo " ❌ GATE FAILED — resolve issues before merging."
  exit 1
else
  echo ""
  echo " ✅ GATE PASSED — Audit Lab + Decision Desk build complete."
  exit 0
fi

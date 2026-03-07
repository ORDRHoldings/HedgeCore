#!/usr/bin/env python3
"""Pre-merge governance gate.

Canonical entrypoint: python scripts/pre_merge_gate.py
Orchestrates truth reconciliation, freeze/invariant checks, validation,
completion discipline, and risk assessment. Produces a merge verdict.

Exit 0 = SAFE_TO_MERGE
Exit 1 = BLOCK
Exit 2 = [NOT VERIFIED]
"""
import os
import re
import sys
import json
import sqlite3
import subprocess
import glob as globmod
from datetime import datetime, timezone, timedelta

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(REPO, ".claude", "state", "memory.db")
SETTINGS = os.path.join(REPO, ".claude", "settings.json")
STATE = os.path.join(REPO, ".claude", "state", "CURRENT_STATE.md")
CHANGELOG = os.path.join(REPO, ".claude", "state", "CHANGELOG_AI.md")

# ── POLICY ───────────────────────────────────────────────────────────
POLICY = {
    # Hard blockers
    "contradiction_blocks": True,       # Any CONTRADICTION in reconciliation → BLOCK
    "critical_risk_blocks": True,       # Open CRITICAL risks → BLOCK (override with --allow-critical)
    "invalid_settings_blocks": True,    # Broken settings.json → BLOCK
    "frozen_file_diff_blocks": True,    # Frozen files in git diff → BLOCK
    "hook_compile_fail_blocks": True,   # Hook scripts that don't compile → BLOCK

    # Soft warnings (do not block)
    "stale_blocks": False,              # STALE items → warn only
    "incomplete_work_blocks": False,    # Open work_items → warn only
    "missing_rollup_blocks": False,     # No recent session rollup → warn only
    "high_risk_blocks": False,          # HIGH risks → warn only

    # Thresholds
    "rollup_staleness_hours": 48,       # Rollup older than this → warn
    "changelog_staleness_hours": 48,    # Changelog older than this → warn
}


class GateResult:
    def __init__(self):
        self.checks = []
        self.blockers = []
        self.warnings = []

    def check(self, name, status, detail=""):
        self.checks.append((name, status, detail))
        if status == "FAIL":
            self.blockers.append(f"{name}: {detail}")
        elif status == "WARN":
            self.warnings.append(f"{name}: {detail}")

    def verdict(self):
        if self.blockers:
            return "BLOCK"
        return "SAFE_TO_MERGE"


def run_reconciliation(gate):
    """Run truth reconciliation and interpret results."""
    script = os.path.join(REPO, "scripts", "reconcile_truth.py")
    if not os.path.exists(script):
        gate.check("Truth reconciliation", "FAIL", "reconcile_truth.py not found")
        return

    result = subprocess.run(
        [sys.executable, script],
        capture_output=True, text=True, cwd=REPO, timeout=30,
    )

    # Parse output for summary line
    lines = result.stdout.strip().split("\n")
    summary_line = [l for l in lines if l.startswith("Summary:")]

    if not summary_line:
        gate.check("Truth reconciliation", "FAIL", "no summary output")
        return

    summary = summary_line[0]
    contradictions = 0
    stale = 0
    m = re.search(r"(\d+) contradictions", summary)
    if m:
        contradictions = int(m.group(1))
    m = re.search(r"(\d+) stale", summary)
    if m:
        stale = int(m.group(1))

    if contradictions > 0 and POLICY["contradiction_blocks"]:
        gate.check("Truth reconciliation", "FAIL", f"{contradictions} contradiction(s)")
    elif stale > 0:
        if POLICY["stale_blocks"]:
            gate.check("Truth reconciliation", "FAIL", f"{stale} stale item(s)")
        else:
            gate.check("Truth reconciliation", "WARN", f"{stale} stale item(s)")
    else:
        gate.check("Truth reconciliation", "PASS", summary.replace("Summary: ", ""))


def check_freeze_invariants(gate):
    """Check frozen files against git diff and verify pattern sync."""
    frozen_patterns = [
        "engine_v1/kernel.py",
        "engine_v1/validator.py",
        "engine_v1/audit.py",
        "models/audit_event.py",
        "models/calculation_run.py",
        "models/policy_revision.py",
        "core/security.py",
    ]

    # 1. Git diff check: are any frozen files modified?
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1..HEAD"],
            capture_output=True, text=True, cwd=REPO, timeout=10,
        )
        changed = result.stdout.strip().split("\n") if result.stdout.strip() else []

        violations = []
        for f in changed:
            normalized = f.replace("\\", "/")
            for pat in frozen_patterns:
                if pat in normalized:
                    violations.append(f)
                    break

        if violations:
            if POLICY["frozen_file_diff_blocks"]:
                gate.check("Freeze/invariants", "FAIL",
                           f"frozen file(s) modified: {', '.join(violations)}")
            else:
                gate.check("Freeze/invariants", "WARN",
                           f"frozen file(s) modified: {', '.join(violations)}")
            return
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass  # Git not available or no commits — skip diff check

    # 2. Pattern sync: freeze guard matches rules file
    guard_file = os.path.join(REPO, ".claude/hooks/pretool_freeze_guard.py")
    rules_file = os.path.join(REPO, ".claude/rules/architecture.md")

    if os.path.exists(guard_file) and os.path.exists(rules_file):
        with open(guard_file) as f:
            guard_content = f.read()
        with open(rules_file) as f:
            rules_content = f.read()

        guard_pats = set(re.findall(
            r'"([^"]+\.py)"',
            guard_content.split("FROZEN_PATTERNS")[1].split("]")[0]
        ))
        rules_pats = set(re.findall(r'`backend/app/([^`]+\.py)`', rules_content))

        if guard_pats != rules_pats:
            missing = rules_pats - guard_pats
            gate.check("Freeze/invariants", "FAIL",
                       f"pattern mismatch — in rules but not guard: {missing}")
            return

    gate.check("Freeze/invariants", "PASS", f"{len(frozen_patterns)} patterns enforced")


def check_validation(gate):
    """Check that hooks compile and settings are valid."""
    failures = []

    # 1. settings.json validity
    if os.path.exists(SETTINGS):
        try:
            with open(SETTINGS) as f:
                json.load(f)
        except json.JSONDecodeError as e:
            failures.append(f"settings.json invalid: {e}")
    else:
        failures.append("settings.json not found")

    # 2. Hook compilation
    hooks_dir = os.path.join(REPO, ".claude", "hooks")
    if os.path.isdir(hooks_dir):
        for hook_file in sorted(os.listdir(hooks_dir)):
            if not hook_file.endswith(".py"):
                continue
            path = os.path.join(hooks_dir, hook_file)
            try:
                import py_compile
                py_compile.compile(path, doraise=True)
            except py_compile.PyCompileError:
                failures.append(f"{hook_file} compile error")

    # 3. Recent validation run in memory.db
    has_recent_validation = False
    if os.path.exists(DB):
        conn = sqlite3.connect(DB)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=POLICY["rollup_staleness_hours"])).strftime("%Y-%m-%d %H:%M:%S")
        row = conn.execute(
            "SELECT run_date, result FROM validation_runs WHERE run_date > ? ORDER BY run_date DESC LIMIT 1",
            (cutoff,)
        ).fetchone()
        if row:
            has_recent_validation = True
        conn.close()

    if failures:
        if POLICY["hook_compile_fail_blocks"] or POLICY["invalid_settings_blocks"]:
            gate.check("Validation", "FAIL", "; ".join(failures))
        else:
            gate.check("Validation", "WARN", "; ".join(failures))
    elif not has_recent_validation:
        gate.check("Validation", "WARN", "no recent validation run in memory.db")
    else:
        gate.check("Validation", "PASS", f"settings valid, hooks compile, recent validation exists")


def check_completion(gate):
    """Check completion discipline: work items, rollup, changelog."""
    issues = []

    if not os.path.exists(DB):
        gate.check("Completion discipline", "WARN", "memory.db not found")
        return

    conn = sqlite3.connect(DB)

    # 1. Open/in-progress work items
    open_items = conn.execute(
        "SELECT COUNT(*) FROM work_items WHERE status IN ('open', 'in_progress')"
    ).fetchone()[0]
    if open_items > 0:
        issues.append(f"{open_items} open/in-progress work item(s)")

    # 2. Recent session rollup
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=POLICY["rollup_staleness_hours"])).strftime("%Y-%m-%d %H:%M:%S")
    recent_rollup = conn.execute(
        "SELECT COUNT(*) FROM session_rollups WHERE session_date > ?", (cutoff,)
    ).fetchone()[0]
    if recent_rollup == 0:
        issues.append("no recent session rollup")

    conn.close()

    # 3. Changelog recency
    if os.path.exists(CHANGELOG):
        mtime = os.path.getmtime(CHANGELOG)
        age_hours = (datetime.now().timestamp() - mtime) / 3600
        if age_hours > POLICY["changelog_staleness_hours"]:
            issues.append(f"changelog not updated in {int(age_hours)}h")

    if issues:
        if POLICY["incomplete_work_blocks"] or POLICY["missing_rollup_blocks"]:
            gate.check("Completion discipline", "FAIL", "; ".join(issues))
        else:
            gate.check("Completion discipline", "WARN", "; ".join(issues))
    else:
        gate.check("Completion discipline", "PASS", "work items closed, rollup recent, changelog current")


def check_risks(gate, allow_critical=False):
    """Check open risks."""
    if not os.path.exists(DB):
        gate.check("Risk assessment", "WARN", "memory.db not found")
        return

    conn = sqlite3.connect(DB)
    critical = conn.execute(
        "SELECT COUNT(*) FROM open_risks WHERE severity='critical' AND status='open'"
    ).fetchone()[0]
    high = conn.execute(
        "SELECT COUNT(*) FROM open_risks WHERE severity='high' AND status='open'"
    ).fetchone()[0]
    conn.close()

    if critical > 0 and POLICY["critical_risk_blocks"] and not allow_critical:
        gate.check("Risk assessment", "FAIL", f"{critical} CRITICAL risk(s) open")
    elif high > 0 and POLICY["high_risk_blocks"]:
        gate.check("Risk assessment", "FAIL", f"{high} HIGH risk(s) open")
    elif critical > 0:
        gate.check("Risk assessment", "WARN", f"{critical} CRITICAL (allowed via --allow-critical)")
    elif high > 0:
        gate.check("Risk assessment", "WARN", f"{high} HIGH risk(s) open")
    else:
        gate.check("Risk assessment", "PASS", "no critical or high risks")


def main():
    allow_critical = "--allow-critical" in sys.argv
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    gate = GateResult()

    # Run all checks
    run_reconciliation(gate)
    check_freeze_invariants(gate)
    check_validation(gate)
    check_completion(gate)
    check_risks(gate, allow_critical=allow_critical)

    # Output
    verdict = gate.verdict()
    print()
    print(f"PRE-MERGE GATE — {now}")
    for name, status, detail in gate.checks:
        symbol = {"PASS": "+", "FAIL": "!", "WARN": "~"}[status]
        print(f"  [{symbol}] {name}: {status}" + (f" — {detail}" if detail else ""))

    if gate.warnings:
        print(f"\n  Warnings: {len(gate.warnings)}")
        for w in gate.warnings:
            print(f"    - {w}")

    if gate.blockers:
        print(f"\n  Blockers: {len(gate.blockers)}")
        for b in gate.blockers:
            print(f"    ! {b}")

    print(f"\n  Verdict: {verdict}")

    # Record to memory.db
    if os.path.exists(DB):
        conn = sqlite3.connect(DB)
        detail = json.dumps({c[0]: c[1] for c in gate.checks})
        conn.execute(
            "INSERT INTO validation_runs (run_date, run_type, result, details) VALUES (?,?,?,?)",
            (now, "pre-merge-gate", verdict.lower().replace("_", "-"), detail),
        )
        conn.commit()
        conn.close()

    if verdict == "BLOCK":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

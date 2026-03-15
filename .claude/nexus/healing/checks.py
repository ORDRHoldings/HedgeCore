"""NEXUS self-healing: 12 integrity checks."""
import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Callable, Optional

from ..constants import (
    AGENTS_DIR,
    AGENT_NAMES,
    CLAUDE_DIR,
    NEXUS_DIR,
    ORPHAN_SESSION_HOURS,
    SCHEMA_VERSION,
    STATE_FILE_STALE_DAYS,
    STATE_FILES,
)
from ..security.hash_chain import verify_chain


@dataclass
class CheckResult:
    """Result of a single integrity check."""
    name: str
    passed: bool
    message: str
    auto_repairable: bool
    repair_fn: Optional[str]


# ── 1. Hash Chain ─────────────────────────────────────────────────────

def check_hash_chain(conn: sqlite3.Connection) -> CheckResult:
    """Verify the audit hash chain integrity."""
    try:
        valid, broken_seq = verify_chain(conn)
        if valid:
            return CheckResult(
                name="hash_chain",
                passed=True,
                message="Hash chain is intact.",
                auto_repairable=False,
                repair_fn=None,
            )
        return CheckResult(
            name="hash_chain",
            passed=False,
            message=f"Hash chain broken at seq {broken_seq}.",
            auto_repairable=False,
            repair_fn=None,
        )
    except Exception as exc:
        return CheckResult(
            name="hash_chain",
            passed=False,
            message=f"Hash chain verification error: {exc}",
            auto_repairable=False,
            repair_fn=None,
        )


# ── 2. State Files Exist ─────────────────────────────────────────────

def check_state_files_exist(conn: sqlite3.Connection) -> CheckResult:
    """Verify all required state files exist on disk."""
    missing = [str(f) for f in STATE_FILES if not f.exists()]
    if not missing:
        return CheckResult(
            name="state_files_exist",
            passed=True,
            message="All state files present.",
            auto_repairable=True,
            repair_fn="repair_state_files",
        )
    return CheckResult(
        name="state_files_exist",
        passed=False,
        message=f"Missing state files: {', '.join(Path(m).name for m in missing)}",
        auto_repairable=True,
        repair_fn="repair_state_files",
    )


# ── 3. State Files Fresh ─────────────────────────────────────────────

def check_state_files_fresh(conn: sqlite3.Connection) -> CheckResult:
    """Check that state file mtimes are within the staleness threshold."""
    threshold = datetime.now(timezone.utc) - timedelta(days=STATE_FILE_STALE_DAYS)
    stale = []
    for f in STATE_FILES:
        if f.exists():
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if mtime < threshold:
                stale.append(f.name)
    if not stale:
        return CheckResult(
            name="state_files_fresh",
            passed=True,
            message="All state files are fresh.",
            auto_repairable=True,
            repair_fn="repair_state_freshness",
        )
    return CheckResult(
        name="state_files_fresh",
        passed=False,
        message=f"Stale state files (>{STATE_FILE_STALE_DAYS}d): {', '.join(stale)}",
        auto_repairable=True,
        repair_fn="repair_state_freshness",
    )


# ── 4. Schema Version ────────────────────────────────────────────────

def check_schema_version(conn: sqlite3.Connection) -> CheckResult:
    """Compare DB schema_version with constants.SCHEMA_VERSION."""
    try:
        row = conn.execute(
            "SELECT value FROM _nexus_meta WHERE key = 'schema_version'"
        ).fetchone()
        if row is None:
            return CheckResult(
                name="schema_version",
                passed=False,
                message="No schema_version found in _nexus_meta.",
                auto_repairable=True,
                repair_fn="repair_schema_version",
            )
        db_version = int(row["value"])
        if db_version == SCHEMA_VERSION:
            return CheckResult(
                name="schema_version",
                passed=True,
                message=f"Schema version {db_version} matches expected {SCHEMA_VERSION}.",
                auto_repairable=True,
                repair_fn="repair_schema_version",
            )
        return CheckResult(
            name="schema_version",
            passed=False,
            message=f"Schema version mismatch: DB={db_version}, expected={SCHEMA_VERSION}.",
            auto_repairable=True,
            repair_fn="repair_schema_version",
        )
    except Exception as exc:
        return CheckResult(
            name="schema_version",
            passed=False,
            message=f"Schema version check error: {exc}",
            auto_repairable=True,
            repair_fn="repair_schema_version",
        )


# ── 5. Orphan Sessions ───────────────────────────────────────────────

def check_orphan_sessions(conn: sqlite3.Connection) -> CheckResult:
    """Find sessions that have been active longer than the threshold."""
    try:
        threshold = datetime.now(timezone.utc) - timedelta(hours=ORPHAN_SESSION_HOURS)
        threshold_str = threshold.isoformat()
        rows = conn.execute(
            "SELECT session_id FROM sessions WHERE status = 'active' AND started_at < ?",
            (threshold_str,),
        ).fetchall()
        if not rows:
            return CheckResult(
                name="orphan_sessions",
                passed=True,
                message="No orphaned sessions found.",
                auto_repairable=True,
                repair_fn="repair_orphan_sessions",
            )
        return CheckResult(
            name="orphan_sessions",
            passed=False,
            message=f"Found {len(rows)} orphaned session(s) active > {ORPHAN_SESSION_HOURS}h.",
            auto_repairable=True,
            repair_fn="repair_orphan_sessions",
        )
    except Exception as exc:
        return CheckResult(
            name="orphan_sessions",
            passed=False,
            message=f"Orphan session check error: {exc}",
            auto_repairable=True,
            repair_fn="repair_orphan_sessions",
        )


# ── 6. Hook Compilation ──────────────────────────────────────────────

def check_hook_compilation(conn: sqlite3.Connection) -> CheckResult:
    """Try compile() on each hook .py file to detect syntax errors."""
    hooks_dir = NEXUS_DIR / "hooks"
    errors = []
    if not hooks_dir.exists():
        return CheckResult(
            name="hook_compilation",
            passed=False,
            message="Hooks directory does not exist.",
            auto_repairable=False,
            repair_fn=None,
        )
    for py_file in hooks_dir.glob("*.py"):
        if py_file.name == "__init__.py":
            continue
        try:
            source = py_file.read_text(encoding="utf-8")
            compile(source, str(py_file), "exec")
        except SyntaxError as exc:
            errors.append(f"{py_file.name}: {exc.msg} (line {exc.lineno})")
        except Exception as exc:
            errors.append(f"{py_file.name}: {exc}")
    if not errors:
        return CheckResult(
            name="hook_compilation",
            passed=True,
            message="All hook files compile successfully.",
            auto_repairable=False,
            repair_fn=None,
        )
    return CheckResult(
        name="hook_compilation",
        passed=False,
        message=f"Hook compilation errors: {'; '.join(errors)}",
        auto_repairable=False,
        repair_fn=None,
    )


# ── 7. Settings Valid ─────────────────────────────────────────────────

def check_settings_valid(conn: sqlite3.Connection) -> CheckResult:
    """Validate .claude/settings.json is valid JSON."""
    settings_path = CLAUDE_DIR / "settings.json"
    if not settings_path.exists():
        return CheckResult(
            name="settings_valid",
            passed=False,
            message="settings.json does not exist.",
            auto_repairable=False,
            repair_fn=None,
        )
    try:
        content = settings_path.read_text(encoding="utf-8")
        json.loads(content)
        return CheckResult(
            name="settings_valid",
            passed=True,
            message="settings.json is valid JSON.",
            auto_repairable=False,
            repair_fn=None,
        )
    except json.JSONDecodeError as exc:
        return CheckResult(
            name="settings_valid",
            passed=False,
            message=f"settings.json invalid: {exc.msg} at line {exc.lineno}.",
            auto_repairable=False,
            repair_fn=None,
        )
    except Exception as exc:
        return CheckResult(
            name="settings_valid",
            passed=False,
            message=f"settings.json read error: {exc}",
            auto_repairable=False,
            repair_fn=None,
        )


# ── 8. Agent Definitions ─────────────────────────────────────────────

def check_agent_definitions(conn: sqlite3.Connection) -> CheckResult:
    """Verify all 8 agent .md files exist in AGENTS_DIR."""
    missing = []
    for name in AGENT_NAMES:
        agent_file = AGENTS_DIR / f"{name}.md"
        if not agent_file.exists():
            missing.append(name)
    if not missing:
        return CheckResult(
            name="agent_definitions",
            passed=True,
            message="All 8 agent definition files present.",
            auto_repairable=True,
            repair_fn="repair_agent_definitions",
        )
    return CheckResult(
        name="agent_definitions",
        passed=False,
        message=f"Missing agent definitions: {', '.join(missing)}",
        auto_repairable=True,
        repair_fn="repair_agent_definitions",
    )


# ── 9. KG Orphaned Edges ─────────────────────────────────────────────

def check_kg_orphaned_edges(conn: sqlite3.Connection) -> CheckResult:
    """Find edges where source_id or target_id doesn't exist in kg_entities."""
    try:
        rows = conn.execute(
            "SELECT COUNT(*) as cnt FROM kg_edges e "
            "WHERE NOT EXISTS (SELECT 1 FROM kg_entities WHERE entity_id = e.source_id) "
            "OR NOT EXISTS (SELECT 1 FROM kg_entities WHERE entity_id = e.target_id)"
        ).fetchone()
        count = rows["cnt"] if rows else 0
        if count == 0:
            return CheckResult(
                name="kg_orphaned_edges",
                passed=True,
                message="No orphaned knowledge graph edges.",
                auto_repairable=True,
                repair_fn="repair_kg_orphaned_edges",
            )
        return CheckResult(
            name="kg_orphaned_edges",
            passed=False,
            message=f"Found {count} orphaned KG edge(s).",
            auto_repairable=True,
            repair_fn="repair_kg_orphaned_edges",
        )
    except Exception as exc:
        return CheckResult(
            name="kg_orphaned_edges",
            passed=False,
            message=f"KG orphaned edges check error: {exc}",
            auto_repairable=True,
            repair_fn="repair_kg_orphaned_edges",
        )


# ── 10. WORM Triggers ────────────────────────────────────────────────

EXPECTED_WORM_TRIGGERS = [
    "worm_no_update_audit_chain",
    "worm_no_delete_audit_chain",
    "worm_no_update_validation_runs",
    "worm_no_delete_validation_runs",
]


def check_worm_triggers(conn: sqlite3.Connection) -> CheckResult:
    """Verify the 4 WORM triggers exist in sqlite_master."""
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'trigger'"
        ).fetchall()
        existing = {row["name"] for row in rows}
        missing = [t for t in EXPECTED_WORM_TRIGGERS if t not in existing]
        if not missing:
            return CheckResult(
                name="worm_triggers",
                passed=True,
                message="All 4 WORM triggers present.",
                auto_repairable=False,
                repair_fn=None,
            )
        return CheckResult(
            name="worm_triggers",
            passed=False,
            message=f"Missing WORM triggers: {', '.join(missing)}",
            auto_repairable=False,
            repair_fn=None,
        )
    except Exception as exc:
        return CheckResult(
            name="worm_triggers",
            passed=False,
            message=f"WORM trigger check error: {exc}",
            auto_repairable=False,
            repair_fn=None,
        )


# ── 11. Recommendation TTL ───────────────────────────────────────────

def check_recommendation_ttl(conn: sqlite3.Connection) -> CheckResult:
    """Find recommendations past their expires_at timestamp."""
    try:
        now_str = datetime.now(timezone.utc).isoformat()
        rows = conn.execute(
            "SELECT COUNT(*) as cnt FROM recommendations WHERE expires_at IS NOT NULL AND expires_at < ?",
            (now_str,),
        ).fetchone()
        count = rows["cnt"] if rows else 0
        if count == 0:
            return CheckResult(
                name="recommendation_ttl",
                passed=True,
                message="No expired recommendations.",
                auto_repairable=True,
                repair_fn="repair_recommendation_ttl",
            )
        return CheckResult(
            name="recommendation_ttl",
            passed=False,
            message=f"Found {count} expired recommendation(s).",
            auto_repairable=True,
            repair_fn="repair_recommendation_ttl",
        )
    except Exception as exc:
        return CheckResult(
            name="recommendation_ttl",
            passed=False,
            message=f"Recommendation TTL check error: {exc}",
            auto_repairable=True,
            repair_fn="repair_recommendation_ttl",
        )


# ── 12. Permissions Valid ─────────────────────────────────────────────

def check_permissions_valid(conn: sqlite3.Connection) -> CheckResult:
    """Verify hook files are readable."""
    hooks_dir = NEXUS_DIR / "hooks"
    unreadable = []
    if not hooks_dir.exists():
        return CheckResult(
            name="permissions_valid",
            passed=False,
            message="Hooks directory does not exist.",
            auto_repairable=False,
            repair_fn=None,
        )
    for py_file in hooks_dir.glob("*.py"):
        if not os.access(str(py_file), os.R_OK):
            unreadable.append(py_file.name)
    if not unreadable:
        return CheckResult(
            name="permissions_valid",
            passed=True,
            message="All hook files are readable.",
            auto_repairable=False,
            repair_fn=None,
        )
    return CheckResult(
        name="permissions_valid",
        passed=False,
        message=f"Unreadable hook files: {', '.join(unreadable)}",
        auto_repairable=False,
        repair_fn=None,
    )


# ── Run All Checks ───────────────────────────────────────────────────

ALL_CHECKS: list[Callable[[sqlite3.Connection], CheckResult]] = [
    check_hash_chain,
    check_state_files_exist,
    check_state_files_fresh,
    check_schema_version,
    check_orphan_sessions,
    check_hook_compilation,
    check_settings_valid,
    check_agent_definitions,
    check_kg_orphaned_edges,
    check_worm_triggers,
    check_recommendation_ttl,
    check_permissions_valid,
]


def run_all_checks(conn: sqlite3.Connection) -> list[CheckResult]:
    """Run all session_start frequency checks and return results."""
    results = []
    for check_fn in ALL_CHECKS:
        try:
            result = check_fn(conn)
        except Exception as exc:
            result = CheckResult(
                name=check_fn.__name__.replace("check_", ""),
                passed=False,
                message=f"Check crashed: {exc}",
                auto_repairable=False,
                repair_fn=None,
            )
        results.append(result)
    return results

"""Self-Healer agent — integrity checks, auto-repair."""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from .base import BaseAgent
from ..constants import (
    DB_PATH, STATE_FILES, ORPHAN_SESSION_HOURS, STATE_FILE_STALE_DAYS,
)
from ..db.connection import transaction, readonly_connection


class SelfHealerAgent(BaseAgent):
    """Integrity checks, auto-repair of safe issues, escalation of critical ones."""

    name = "self-healer"
    allowed_tools = ["Read", "Grep", "Glob", "Bash", "Write"]
    decision_authority = "Auto-repair safe issues; ESCALATE chain/WORM integrity"
    tables_owned = ["integrity_checks", "healing_log"]

    # Checks that are safe to auto-repair
    SAFE_REPAIRS = {"orphan_session", "stale_state_file", "missing_state_file"}
    # Checks that must be escalated
    ESCALATE_CHECKS = {"chain_integrity", "worm_violation", "schema_mismatch"}

    def execute(self, task: str, context: dict = None) -> dict:
        """Run integrity checks, attempt repairs on safe issues."""
        context = context or {}
        session_id = context.get("session_id", "")

        checks = self._run_all_checks()
        repairs = []
        escalations = []

        for check in checks:
            self._record_check(session_id, check)

            if check["status"] == "fail":
                if check["check_type"] in self.SAFE_REPAIRS:
                    repair = self._attempt_repair(session_id, check)
                    repairs.append(repair)
                elif check["check_type"] in self.ESCALATE_CHECKS:
                    self.escalate(session_id, "commander", check["check_type"],
                                  {"detail": check["detail"]})
                    escalations.append(check)

        passed = sum(1 for c in checks if c["status"] == "pass")
        total = len(checks)

        self.log_activity(session_id, task, "success",
                         confidence=passed / total if total else 1.0)

        return {
            "status": "success",
            "result": {
                "total_checks": total,
                "passed": passed,
                "failed": total - passed,
                "repairs_attempted": len(repairs),
                "escalations": len(escalations),
            },
            "confidence": passed / total if total else 1.0,
            "files_touched": [],
            "checks": checks,
            "repairs": repairs,
            "escalations": escalations,
        }

    def _run_all_checks(self) -> list:
        """Run all integrity checks."""
        checks = []
        checks.append(self._check_db_exists())
        checks.append(self._check_state_files())
        checks.append(self._check_orphan_sessions())
        checks.append(self._check_chain_integrity())
        checks.append(self._check_schema_version())
        return checks

    def _check_db_exists(self) -> dict:
        """Check that the database file exists."""
        exists = Path(DB_PATH).exists()
        return {
            "check_type": "db_exists",
            "status": "pass" if exists else "fail",
            "detail": str(DB_PATH),
        }

    def _check_state_files(self) -> dict:
        """Check that all required state files exist and are not stale."""
        missing = []
        stale = []
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(days=STATE_FILE_STALE_DAYS)

        for sf in STATE_FILES:
            p = Path(sf)
            if not p.exists():
                missing.append(str(sf))
            elif datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc) < stale_cutoff:
                stale.append(str(sf))

        if missing:
            return {
                "check_type": "missing_state_file",
                "status": "fail",
                "detail": f"Missing: {missing}",
            }
        if stale:
            return {
                "check_type": "stale_state_file",
                "status": "fail",
                "detail": f"Stale: {stale}",
            }
        return {
            "check_type": "state_files",
            "status": "pass",
            "detail": f"All {len(STATE_FILES)} state files present and fresh",
        }

    def _check_orphan_sessions(self) -> dict:
        """Check for orphaned sessions (active but no recent activity)."""
        cutoff_hours = ORPHAN_SESSION_HOURS
        with readonly_connection() as conn:
            orphans = conn.execute(
                "SELECT id, started_at FROM sessions "
                "WHERE status = 'active' "
                "AND started_at < datetime('now', ?)",
                (f"-{cutoff_hours} hours",),
            ).fetchall()
        if orphans:
            return {
                "check_type": "orphan_session",
                "status": "fail",
                "detail": f"{len(orphans)} orphan session(s)",
                "orphan_ids": [r["id"] for r in orphans],
            }
        return {
            "check_type": "orphan_session",
            "status": "pass",
            "detail": "No orphan sessions",
        }

    def _check_chain_integrity(self) -> dict:
        """Check WORM audit chain integrity."""
        with readonly_connection() as conn:
            chain = conn.execute(
                "SELECT id, prev_hash, hash FROM audit_chain ORDER BY id"
            ).fetchall()
        if not chain:
            return {
                "check_type": "chain_integrity",
                "status": "pass",
                "detail": "Audit chain empty (OK for new system)",
            }

        broken = []
        for i in range(1, len(chain)):
            if chain[i]["prev_hash"] != chain[i - 1]["hash"]:
                broken.append(chain[i]["id"])

        if broken:
            return {
                "check_type": "chain_integrity",
                "status": "fail",
                "detail": f"Chain broken at entries: {broken}",
            }
        return {
            "check_type": "chain_integrity",
            "status": "pass",
            "detail": f"Chain intact ({len(chain)} entries)",
        }

    def _check_schema_version(self) -> dict:
        """Check that DB schema version matches expected."""
        with readonly_connection() as conn:
            row = conn.execute(
                "SELECT value FROM _nexus_meta WHERE key = 'schema_version'"
            ).fetchone()
        if not row:
            return {
                "check_type": "schema_mismatch",
                "status": "fail",
                "detail": "No schema_version in _nexus_meta",
            }
        from ..constants import SCHEMA_VERSION
        current = int(row["value"])
        if current != SCHEMA_VERSION:
            return {
                "check_type": "schema_mismatch",
                "status": "fail",
                "detail": f"Expected {SCHEMA_VERSION}, found {current}",
            }
        return {
            "check_type": "schema_version",
            "status": "pass",
            "detail": f"Schema version {current}",
        }

    def _attempt_repair(self, session_id: str, check: dict) -> dict:
        """Attempt to auto-repair a safe issue."""
        check_type = check["check_type"]
        repair_result = {"check_type": check_type, "repaired": False}

        if check_type == "orphan_session":
            orphan_ids = check.get("orphan_ids", [])
            with transaction() as conn:
                for oid in orphan_ids:
                    conn.execute(
                        "UPDATE sessions SET status = 'closed', "
                        "ended_at = datetime('now') WHERE id = ?", (oid,)
                    )
            repair_result["repaired"] = True
            repair_result["detail"] = f"Closed {len(orphan_ids)} orphan session(s)"

        elif check_type == "missing_state_file":
            # Create missing state files with default content
            for sf in STATE_FILES:
                p = Path(sf)
                if not p.exists():
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(f"# {p.stem}\n\n_Auto-created by self-healer._\n")
            repair_result["repaired"] = True
            repair_result["detail"] = "Created missing state files"

        elif check_type == "stale_state_file":
            repair_result["repaired"] = False
            repair_result["detail"] = "Stale files flagged for refresh (not auto-repaired)"

        self._record_healing(session_id, check_type, repair_result)
        return repair_result

    def _record_check(self, session_id: str, check: dict):
        """Record an integrity check result."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO integrity_checks (session_id, check_type, status, detail) "
                "VALUES (?, ?, ?, ?)",
                (session_id, check["check_type"], check["status"],
                 check.get("detail", "")),
            )

    def _record_healing(self, session_id: str, check_type: str, result: dict):
        """Record a healing action."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO healing_log (session_id, issue_type, action_taken, success, detail) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, check_type, "auto_repair",
                 result.get("repaired", False),
                 result.get("detail", "")),
            )

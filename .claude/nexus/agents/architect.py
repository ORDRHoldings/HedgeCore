"""Architect agent — design integrity, ADRs, freeze enforcement."""
import json
from .base import BaseAgent
from ..db.connection import transaction, readonly_connection


class ArchitectAgent(BaseAgent):
    """Design integrity, ADRs, freeze enforcement."""

    name = "architect"
    allowed_tools = ["Read", "Grep", "Glob", "Write", "Edit"]
    decision_authority = "BLOCK on architecture freeze violations"
    tables_owned = ["architecture_freeze", "decisions", "kg_edges"]

    def execute(self, task: str, context: dict = None) -> dict:
        """Check architecture constraints, manage freezes."""
        context = context or {}
        session_id = context.get("session_id", "")
        files = context.get("files", [])

        # Check if any proposed changes violate architecture freezes
        violations = self._check_freeze_violations(files)
        if violations:
            self.log_activity(session_id, task, "blocked", confidence=1.0)
            return {
                "status": "blocked",
                "result": f"Architecture freeze violation: {violations}",
                "confidence": 1.0,
                "files_touched": [],
                "violations": violations,
            }

        # Check design constraints
        constraint_issues = self._check_constraints(context)
        if constraint_issues:
            return {
                "status": "warning",
                "result": f"Design constraint issues: {constraint_issues}",
                "confidence": 0.75,
                "files_touched": [],
                "issues": constraint_issues,
            }

        return {
            "status": "success",
            "result": "Architecture checks passed",
            "confidence": 0.90,
            "files_touched": [],
        }

    def _check_freeze_violations(self, files: list) -> list:
        """Check if files are under an active architecture freeze."""
        if not files:
            return []
        violations = []
        with readonly_connection() as conn:
            freezes = conn.execute(
                "SELECT scope, reason FROM architecture_freeze "
                "WHERE status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))"
            ).fetchall()
            for freeze in freezes:
                scope = freeze["scope"]
                for f in files:
                    if f.startswith(scope) or scope == "*":
                        violations.append({
                            "file": f,
                            "frozen_scope": scope,
                            "reason": freeze["reason"],
                        })
        return violations

    def _check_constraints(self, context: dict) -> list:
        """Check design constraints from knowledge graph edges."""
        issues = []
        with readonly_connection() as conn:
            constraints = conn.execute(
                "SELECT from_node, to_node, relation, metadata FROM kg_edges "
                "WHERE relation IN ('constrains', 'requires', 'depends_on')"
            ).fetchall()
            for c in constraints:
                meta = json.loads(c["metadata"]) if c["metadata"] else {}
                if meta.get("severity") == "critical" and meta.get("status") == "unresolved":
                    issues.append({
                        "from": c["from_node"],
                        "to": c["to_node"],
                        "relation": c["relation"],
                    })
        return issues

    def record_decision(self, session_id: str, decision_type: str,
                        title: str, body: str, status: str = "proposed"):
        """Record an architecture decision."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO decisions (session_id, decision_type, title, body, status, decided_by) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, decision_type, title, body, status, self.name),
            )

"""Reviewer agent — code review, quality gates."""
import json
from .base import BaseAgent
from ..db.connection import transaction, readonly_connection


class ReviewerAgent(BaseAgent):
    """Code review, quality gates, approval workflow."""

    name = "reviewer"
    allowed_tools = ["Read", "Grep", "Glob", "Bash"]
    decision_authority = "APPROVE / REQUEST_CHANGES / BLOCK"
    tables_owned = ["validation_runs", "outcomes"]

    # Quality thresholds
    MIN_COVERAGE = 0.70
    MAX_COMPLEXITY = 15
    MAX_FILE_LENGTH = 500

    def execute(self, task: str, context: dict = None) -> dict:
        """Run quality checks, record review outcomes."""
        context = context or {}
        session_id = context.get("session_id", "")
        files = context.get("files", [])

        checks = self._run_quality_checks(files, context)
        verdict = self._compute_verdict(checks)

        # Record the validation run
        self._record_validation(session_id, task, checks, verdict)

        # Record the outcome
        self._record_outcome(session_id, task, verdict, checks)

        self.log_activity(session_id, task, verdict["decision"].lower(),
                         confidence=verdict["confidence"])

        return {
            "status": verdict["decision"].lower(),
            "result": verdict,
            "confidence": verdict["confidence"],
            "files_touched": [],
            "checks": checks,
        }

    def _run_quality_checks(self, files: list, context: dict) -> list:
        """Run quality checks on the given files."""
        checks = []

        # Check file lengths
        for f in files:
            line_count = context.get("line_counts", {}).get(f, 0)
            checks.append({
                "check": "file_length",
                "file": f,
                "value": line_count,
                "threshold": self.MAX_FILE_LENGTH,
                "passed": line_count <= self.MAX_FILE_LENGTH,
            })

        # Check test coverage if provided
        coverage = context.get("coverage")
        if coverage is not None:
            checks.append({
                "check": "test_coverage",
                "value": coverage,
                "threshold": self.MIN_COVERAGE,
                "passed": coverage >= self.MIN_COVERAGE,
            })

        # Check complexity if provided
        complexity = context.get("complexity")
        if complexity is not None:
            checks.append({
                "check": "cyclomatic_complexity",
                "value": complexity,
                "threshold": self.MAX_COMPLEXITY,
                "passed": complexity <= self.MAX_COMPLEXITY,
            })

        return checks

    def _compute_verdict(self, checks: list) -> dict:
        """Compute review verdict from quality checks."""
        if not checks:
            return {"decision": "APPROVE", "confidence": 0.60, "reason": "No checks applicable"}

        failed = [c for c in checks if not c["passed"]]
        total = len(checks)
        pass_rate = (total - len(failed)) / total

        if len(failed) == 0:
            return {"decision": "APPROVE", "confidence": 0.90, "reason": "All checks passed"}
        elif any(c["check"] == "test_coverage" for c in failed):
            return {"decision": "REQUEST_CHANGES", "confidence": 0.85,
                    "reason": f"Test coverage below threshold; {len(failed)}/{total} checks failed"}
        elif pass_rate < 0.50:
            return {"decision": "BLOCK", "confidence": 0.80,
                    "reason": f"Majority of checks failed ({len(failed)}/{total})"}
        else:
            return {"decision": "REQUEST_CHANGES", "confidence": 0.75,
                    "reason": f"{len(failed)}/{total} checks failed"}

    def _record_validation(self, session_id: str, task: str,
                           checks: list, verdict: dict):
        """Record a validation run."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO validation_runs (session_id, scope, validator, status, details) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, "review", self.name, verdict["decision"],
                 json.dumps({"checks": checks, "verdict": verdict})),
            )

    def _record_outcome(self, session_id: str, task: str,
                        verdict: dict, checks: list):
        """Record a review outcome."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO outcomes (session_id, outcome_type, summary, details) "
                "VALUES (?, ?, ?, ?)",
                (session_id, "review", verdict["reason"],
                 json.dumps({"decision": verdict["decision"], "checks": checks})),
            )

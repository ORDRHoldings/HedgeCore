"""Cybersec agent — vulnerability scanning, compliance."""
import json
import re
from .base import BaseAgent
from ..db.connection import transaction, readonly_connection


class CybersecAgent(BaseAgent):
    """Vulnerability scanning, compliance enforcement. Absolute authority on security."""

    name = "cybersec"
    allowed_tools = ["Read", "Grep", "Glob", "Bash"]
    decision_authority = "BLOCK on security issues (absolute, overrides Commander)"
    tables_owned = ["risks", "validation_runs"]

    # Patterns that indicate potential security issues
    SECRET_PATTERNS = [
        r"(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]+['\"]",
        r"(?i)bearer\s+[a-zA-Z0-9\-_.]+",
        r"(?i)(aws|gcp|azure)[_-]?(access|secret|key)",
        r"-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----",
    ]

    UNSAFE_PATTERNS = [
        r"eval\s*\(",
        r"exec\s*\(",
        r"subprocess\.call\s*\(.*shell\s*=\s*True",
        r"os\.system\s*\(",
        r"__import__\s*\(",
    ]

    def execute(self, task: str, context: dict = None) -> dict:
        """Scan for vulnerabilities, check compliance."""
        context = context or {}
        session_id = context.get("session_id", "")
        files = context.get("files", [])
        content_map = context.get("content_map", {})

        vulnerabilities = []
        for fpath in files:
            content = content_map.get(fpath, "")
            vulns = self._scan_file(fpath, content)
            vulnerabilities.extend(vulns)

        # Check compliance rules
        compliance_issues = self._check_compliance(context)

        all_issues = vulnerabilities + compliance_issues
        severity = self._max_severity(all_issues)

        if severity == "critical":
            self._record_risk(session_id, all_issues, "critical")
            self._record_validation(session_id, "BLOCK", all_issues)
            self.log_activity(session_id, task, "blocked", confidence=0.95)
            return {
                "status": "blocked",
                "result": f"SECURITY BLOCK: {len(all_issues)} issue(s) found",
                "confidence": 0.95,
                "files_touched": [],
                "vulnerabilities": all_issues,
            }

        if all_issues:
            self._record_risk(session_id, all_issues, severity)
            self._record_validation(session_id, "WARNING", all_issues)
            self.log_activity(session_id, task, "warning", confidence=0.80)
            return {
                "status": "warning",
                "result": f"Security warnings: {len(all_issues)} issue(s)",
                "confidence": 0.80,
                "files_touched": [],
                "vulnerabilities": all_issues,
            }

        self._record_validation(session_id, "PASS", [])
        self.log_activity(session_id, task, "success", confidence=0.90)
        return {
            "status": "success",
            "result": "Security scan passed",
            "confidence": 0.90,
            "files_touched": [],
        }

    def _scan_file(self, file_path: str, content: str) -> list:
        """Scan a single file for security issues."""
        issues = []
        for pattern in self.SECRET_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "hardcoded_secret",
                    "file": file_path,
                    "severity": "critical",
                    "pattern": pattern,
                    "count": len(matches),
                })
        for pattern in self.UNSAFE_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "unsafe_code",
                    "file": file_path,
                    "severity": "high",
                    "pattern": pattern,
                    "count": len(matches),
                })
        return issues

    def _check_compliance(self, context: dict) -> list:
        """Check compliance rules."""
        issues = []
        if context.get("has_env_file_committed"):
            issues.append({
                "type": "compliance",
                "severity": "critical",
                "detail": ".env file committed to repository",
            })
        if context.get("no_gitignore"):
            issues.append({
                "type": "compliance",
                "severity": "high",
                "detail": "Missing .gitignore file",
            })
        return issues

    @staticmethod
    def _max_severity(issues: list) -> str:
        """Return the highest severity from a list of issues."""
        order = {"critical": 3, "high": 2, "medium": 1, "low": 0}
        max_sev = "low"
        for issue in issues:
            sev = issue.get("severity", "low")
            if order.get(sev, 0) > order.get(max_sev, 0):
                max_sev = sev
        return max_sev

    def _record_risk(self, session_id: str, issues: list, severity: str):
        """Record security risks in the risks table."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO risks (session_id, risk_type, severity, description, details, raised_by) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, "security", severity,
                 f"{len(issues)} security issue(s) detected",
                 json.dumps(issues), self.name),
            )

    def _record_validation(self, session_id: str, status: str, issues: list):
        """Record a security validation run."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO validation_runs (session_id, scope, validator, status, details) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, "security", self.name, status, json.dumps(issues)),
            )

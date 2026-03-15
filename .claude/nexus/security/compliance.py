"""NEXUS security: compliance framework."""
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .secret_scanner import scan_content as scan_secrets
from .vuln_patterns import scan_for_vulnerabilities


# ── Known Vulnerable Packages ─────────────────────────────────────────

# package_name -> (vulnerable_versions_pattern, advisory)
_KNOWN_VULNERABLE: dict[str, tuple[str, str]] = {
    "pyyaml": ("< 5.1", "CVE-2020-1747: Arbitrary code execution via yaml.load()"),
    "requests": ("< 2.20.0", "CVE-2018-18074: Session fixation vulnerability"),
    "django": ("< 3.2.25", "Multiple security fixes in 3.2 LTS"),
    "flask": ("< 2.3.2", "CVE-2023-30861: Cookie handling vulnerability"),
    "jinja2": ("< 3.1.3", "CVE-2024-22195: XSS via xmlattr filter"),
    "pillow": ("< 10.2.0", "Multiple buffer overflow fixes"),
    "cryptography": ("< 41.0.6", "CVE-2023-49083: NULL pointer dereference"),
    "urllib3": ("< 2.0.7", "CVE-2023-45803: Request body leak on redirect"),
    "certifi": ("< 2023.7.22", "Removal of e-Tugra root certificate"),
    "setuptools": ("< 65.5.1", "CVE-2022-40897: ReDoS vulnerability"),
}

# ── Compliance Check Patterns ─────────────────────────────────────────

_BARE_EXCEPT = re.compile(r"^\s*except\s*:", re.MULTILINE)
_DEBUG_PRINT = re.compile(r"(?:^|\s)(?:print\s*\(|console\.log\s*\(|debugger\b)", re.MULTILINE)
_NO_INPUT_VALIDATION = re.compile(
    r"(?:request\.(?:args|form|json|data))[.\[]",
    re.IGNORECASE,
)
_INPUT_VALIDATION_GUARD = re.compile(
    r"(?:validate|sanitize|clean|check|verify|schema|pydantic|marshmallow|wtforms)",
    re.IGNORECASE,
)


# ── File Compliance ───────────────────────────────────────────────────

def check_file_compliance(file_path: str, content: str) -> list[dict]:
    """Check a file for compliance issues.

    Returns a list of compliance issue dicts with:
        - rule: The compliance rule violated
        - severity: CRITICAL, HIGH, MEDIUM, or LOW
        - line: Line number (if applicable)
        - detail: Description of the issue
    """
    issues = []
    path = Path(file_path)
    ext = path.suffix.lstrip(".")

    # Rule 1: No hardcoded secrets
    secret_hits = scan_secrets(content)
    for pattern_name, line_num in secret_hits:
        issues.append({
            "rule": "no_hardcoded_secrets",
            "severity": "CRITICAL",
            "line": line_num,
            "detail": f"{pattern_name} detected (value redacted).",
        })

    # Rule 2: Proper error handling — no bare except
    for match in _BARE_EXCEPT.finditer(content):
        line_num = content[:match.start()].count("\n") + 1
        issues.append({
            "rule": "proper_error_handling",
            "severity": "MEDIUM",
            "line": line_num,
            "detail": "Bare 'except:' catches all exceptions including SystemExit and KeyboardInterrupt.",
        })

    # Rule 3: No debug/print statements in production code
    # Skip test files and __init__.py
    if not path.name.startswith("test_") and path.name != "__init__.py":
        for match in _DEBUG_PRINT.finditer(content):
            line_num = content[:match.start()].count("\n") + 1
            # Skip if inside a logging context or docstring
            line_text = content.splitlines()[line_num - 1] if line_num <= len(content.splitlines()) else ""
            stripped = line_text.strip()
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'''"):
                continue
            issues.append({
                "rule": "no_debug_statements",
                "severity": "LOW",
                "line": line_num,
                "detail": "Debug/print statement found in production code.",
            })

    # Rule 4: Proper input validation (Python files only)
    if ext == "py":
        has_request_usage = bool(_NO_INPUT_VALIDATION.search(content))
        has_validation = bool(_INPUT_VALIDATION_GUARD.search(content))
        if has_request_usage and not has_validation:
            issues.append({
                "rule": "input_validation",
                "severity": "HIGH",
                "line": 0,
                "detail": "Request input used without apparent validation/sanitization.",
            })

    # Rule 5: Vulnerability patterns (delegates to vuln_patterns module)
    vuln_hits = scan_for_vulnerabilities(content, ext)
    for vuln_name, severity, line_num, suggestion in vuln_hits:
        issues.append({
            "rule": f"vuln_{vuln_name.lower().replace(' ', '_')}",
            "severity": severity,
            "line": line_num,
            "detail": f"{vuln_name}: {suggestion}",
        })

    return issues


# ── Dependency Compliance ─────────────────────────────────────────────

def check_dependency_compliance(
    dependencies: dict[str, str],
) -> list[dict]:
    """Check dependencies for known vulnerable packages.

    Args:
        dependencies: Dict of {package_name: installed_version}.

    Returns:
        List of dicts with: package, installed_version, vulnerable_range, advisory.
    """
    issues = []
    for pkg, version in dependencies.items():
        pkg_lower = pkg.lower().replace("-", "").replace("_", "")
        for known_pkg, (vuln_range, advisory) in _KNOWN_VULNERABLE.items():
            known_lower = known_pkg.lower().replace("-", "").replace("_", "")
            if pkg_lower == known_lower:
                issues.append({
                    "package": pkg,
                    "installed_version": version,
                    "vulnerable_range": vuln_range,
                    "advisory": advisory,
                })
    return issues


# ── Compliance Report ─────────────────────────────────────────────────

def generate_compliance_report(conn: sqlite3.Connection) -> str:
    """Generate an aggregate compliance report from validation_runs."""
    try:
        rows = conn.execute(
            "SELECT run_id, status, detail, ts FROM validation_runs "
            "ORDER BY ts DESC LIMIT 50"
        ).fetchall()

        if not rows:
            return _format_report([], 0, 0, 0)

        total = len(rows)
        passed = sum(1 for r in rows if r["status"] == "passed")
        failed = total - passed

        issues = []
        for row in rows:
            if row["status"] != "passed":
                issues.append({
                    "run_id": row["run_id"],
                    "status": row["status"],
                    "detail": row["detail"],
                    "ts": row["ts"],
                })

        return _format_report(issues, total, passed, failed)
    except Exception as exc:
        return f"Compliance report generation failed: {exc}"


def _format_report(
    issues: list[dict], total: int, passed: int, failed: int
) -> str:
    """Format the compliance report string."""
    lines = [
        "=" * 60,
        "  NEXUS COMPLIANCE REPORT",
        "=" * 60,
        "",
        f"  Total validation runs:  {total}",
        f"  Passed:                 {passed}",
        f"  Failed:                 {failed}",
        "",
    ]

    if issues:
        lines.append("  Recent Issues:")
        lines.append("  " + "-" * 56)
        for issue in issues[:10]:
            lines.append(f"    Run {issue.get('run_id', '?')}: {issue.get('status', '?')} - {issue.get('detail', 'N/A')}")
        if len(issues) > 10:
            lines.append(f"    ... and {len(issues) - 10} more")
        lines.append("")
    else:
        lines.append("  No compliance issues found.")
        lines.append("")

    score = passed / total if total > 0 else 1.0
    lines.append(f"  Compliance Score: {score:.0%}")
    lines.append("=" * 60)
    return "\n".join(lines)


# ── Compliance Score ──────────────────────────────────────────────────

def get_compliance_score(conn: sqlite3.Connection) -> float:
    """Calculate overall compliance score (0.0 to 1.0) from validation_runs."""
    try:
        row = conn.execute(
            "SELECT "
            "COUNT(*) as total, "
            "SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed "
            "FROM validation_runs"
        ).fetchone()

        if not row or row["total"] == 0:
            return 1.0  # No runs means no failures

        return row["passed"] / row["total"]
    except Exception:
        return 0.0

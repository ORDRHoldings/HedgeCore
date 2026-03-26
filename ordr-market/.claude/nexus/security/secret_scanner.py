"""NEXUS security: secret detection scanner with 8 patterns."""
import re
from pathlib import Path
from typing import Optional


# ── Secret Detection Patterns ─────────────────────────────────────────

SECRET_PATTERNS: list[tuple[str, re.Pattern]] = [
    (
        "AWS Access Key",
        re.compile(r"AKIA[0-9A-Z]{16}"),
    ),
    (
        "Generic API Key",
        re.compile(r"api[_\-]?key\s*[:=]\s*['\"][^'\"]{20,}", re.IGNORECASE),
    ),
    (
        "Password in Config",
        re.compile(r"password\s*[:=]\s*['\"][^'\"]+", re.IGNORECASE),
    ),
    (
        "Private Key",
        re.compile(r"-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----"),
    ),
    (
        "GitHub Token",
        re.compile(r"(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36}"),
    ),
    (
        "Generic Secret",
        re.compile(r"secret\s*[:=]\s*['\"][^'\"]+", re.IGNORECASE),
    ),
    (
        "Connection String",
        re.compile(r"(mongodb|postgres|mysql|redis):\/\/[^\s'\"]+"),
    ),
    (
        "JWT Token",
        re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    ),
]


# ── Scanning Functions ────────────────────────────────────────────────

def scan_content(content: str) -> list[tuple[str, int]]:
    """Scan content for secret patterns.

    Returns a list of (pattern_name, line_number) tuples.
    NEVER includes actual secret values in the output.
    """
    matches = []
    lines = content.splitlines()
    for line_num, line in enumerate(lines, start=1):
        for pattern_name, pattern in SECRET_PATTERNS:
            if pattern.search(line):
                matches.append((pattern_name, line_num))
    return matches


def scan_file(file_path: str) -> list[tuple[str, int]]:
    """Scan a file's content for secret patterns.

    Returns a list of (pattern_name, line_number) tuples.
    Returns an empty list if the file cannot be read.
    """
    try:
        path = Path(file_path)
        if not path.exists():
            return []
        if not path.is_file():
            return []
        content = path.read_text(encoding="utf-8", errors="replace")
        return scan_content(content)
    except Exception:
        return []


def format_scan_results(results: list[tuple[str, int]]) -> str:
    """Format scan results into a warning string.

    Results contain only pattern names and line numbers — never actual values.
    """
    if not results:
        return "No secrets detected."

    lines = [
        "=" * 50,
        "  SECRET SCAN WARNING",
        "=" * 50,
        "",
    ]
    for pattern_name, line_num in results:
        lines.append(f"  [!] {pattern_name} detected at line {line_num}")

    lines.append("")
    lines.append(f"  Total detections: {len(results)}")
    lines.append("  Action: Review and remove or rotate secrets immediately.")
    lines.append("=" * 50)
    return "\n".join(lines)

#!/usr/bin/env python3
"""NEXUS Hook: PreToolUse (Edit|Write) — architecture freeze + secret scanning."""
import io
import json
import re
import sys
from pathlib import Path

# Fix Windows encoding
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent paths for imports
_hook_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_hook_dir.parent.parent))  # .claude/

# ── Secret patterns ──────────────────────────────────────────────────
SECRET_PATTERNS = {
    "AWS Access Key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "Generic API Key": re.compile(r"api[_\-]?key\s*[:=]\s*['\"][^'\"]{20,}", re.IGNORECASE),
    "Password": re.compile(r"password\s*[:=]\s*['\"][^'\"]+", re.IGNORECASE),
    "Private Key": re.compile(r"-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----"),
    "GitHub Token": re.compile(r"(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36}"),
    "Generic Secret": re.compile(r"secret\s*[:=]\s*['\"][^'\"]+", re.IGNORECASE),
    "Connection String": re.compile(r"(mongodb|postgres|mysql|redis):\/\/[^\s'\"]+"),
    "JWT Token": re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
}

try:
    # Read tool input from stdin
    tool_input_raw = sys.stdin.read()
    if not tool_input_raw.strip():
        sys.exit(0)

    tool_input = json.loads(tool_input_raw)
    tool_name = tool_input.get("tool_name", "")
    tool_params = tool_input.get("tool_input", {})

    # Determine target file path
    target_file = tool_params.get("file_path", "") or tool_params.get("path", "")

    # Determine content to scan
    content_to_scan = ""
    if tool_name == "Write":
        content_to_scan = tool_params.get("content", "")
    elif tool_name == "Edit":
        content_to_scan = tool_params.get("new_string", "")

    # ── Check 1: Architecture freeze ─────────────────────────────────
    if target_file:
        from nexus.db.connection import readonly_connection

        with readonly_connection() as conn:
            frozen = conn.execute(
                "SELECT component, reason, override_requires FROM architecture_freeze"
            ).fetchall()

        for row in frozen:
            component = row["component"]
            # Match if the target file path contains the frozen component
            if component in target_file or target_file.endswith(component):
                result = {
                    "decision": "block",
                    "reason": (
                        f"ARCHITECTURE FREEZE: '{component}' is frozen. "
                        f"Reason: {row['reason']}. "
                        f"Override requires: {row['override_requires']}"
                    ),
                }
                print(json.dumps(result))
                sys.exit(0)

    # ── Check 2: Secret scanning ─────────────────────────────────────
    if content_to_scan:
        for pattern_name, pattern_re in SECRET_PATTERNS.items():
            if pattern_re.search(content_to_scan):
                print(f"WARNING: Potential secret detected — pattern: {pattern_name}", file=sys.stderr)
                result = {
                    "decision": "block",
                    "reason": f"Secret detected: {pattern_name}. Remove the secret before writing.",
                }
                print(json.dumps(result))
                sys.exit(0)

    # No issues found — allow the operation (no output)

except json.JSONDecodeError:
    # If input is not valid JSON, skip checks silently
    pass
except Exception as e:
    # Never crash — log error and allow the operation
    print(f"[NEXUS PreToolGuard] Error: {e}", file=sys.stderr)

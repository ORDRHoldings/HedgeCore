#!/usr/bin/env python3
"""PostToolUse hook: records file facts when Edit/Write tools are used."""
import json
import sys
import os
import sqlite3
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, ".claude", "state", "memory.db")

# Skip recording for these paths
SKIP_PATTERNS = [
    ".claude/state/",
    "node_modules/",
    ".next/",
    "__pycache__/",
    ".git/",
]


def main():
    try:
        data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    if tool_name not in ("Edit", "Write"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    # Normalize to relative path
    normalized = file_path.replace("\\", "/")
    for skip in SKIP_PATTERNS:
        if skip in normalized:
            sys.exit(0)

    # Make relative to repo
    repo_normalized = REPO.replace("\\", "/")
    if normalized.startswith(repo_normalized):
        relative = normalized[len(repo_normalized):].lstrip("/")
    else:
        relative = normalized

    # Determine fact from tool action
    if tool_name == "Write":
        fact = f"Created or rewritten at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"
    else:
        desc = tool_input.get("description", tool_input.get("new_string", ""))[:100]
        fact = f"Edited at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}: {desc}" if desc else f"Edited at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"

    if not os.path.exists(DB):
        sys.exit(0)

    try:
        conn = sqlite3.connect(DB)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "INSERT INTO file_facts (file_path, fact_type, fact, updated_at) VALUES (?, 'last_change', ?, ?) "
            "ON CONFLICT(file_path, fact_type) DO UPDATE SET fact=excluded.fact, updated_at=excluded.updated_at",
            (relative, fact, now),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Non-blocking — don't fail the tool call

    sys.exit(0)


if __name__ == "__main__":
    main()

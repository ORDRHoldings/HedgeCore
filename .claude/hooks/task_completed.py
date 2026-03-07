#!/usr/bin/env python3
"""Task completed hook — writes session rollup to memory.db and CHANGELOG_AI.md."""
import sqlite3
import json
import os
import sys
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, ".claude", "state", "memory.db")
CHANGELOG = os.path.join(REPO, ".claude", "state", "CHANGELOG_AI.md")


def main():
    # Read task summary from stdin (JSON with summary, files_changed, decisions, next_steps)
    try:
        data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        print("task_completed: no input provided, skipping")
        sys.exit(0)

    summary = data.get("summary", "No summary provided")
    files_changed = json.dumps(data.get("files_changed", []))
    decisions = json.dumps(data.get("decisions", []))
    risks = json.dumps(data.get("risks", []))
    next_steps = data.get("next_steps", "")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # Write to memory.db
    if os.path.exists(DB):
        conn = sqlite3.connect(DB)
        conn.execute(
            "INSERT INTO session_rollups (session_date, summary, files_changed, decisions_made, risks_identified, next_steps) VALUES (?,?,?,?,?,?)",
            (now, summary, files_changed, decisions, risks, next_steps),
        )
        conn.commit()
        conn.close()
        print(f"task_completed: wrote rollup to memory.db")

    # Append to CHANGELOG_AI.md
    if os.path.exists(CHANGELOG):
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        entry = f"\n## {date_str} — {summary[:80]}\n"
        for fc in data.get("files_changed", []):
            entry += f"- {fc}\n"
        with open(CHANGELOG, "a") as f:
            f.write(entry)
        print(f"task_completed: appended to CHANGELOG_AI.md")


if __name__ == "__main__":
    main()

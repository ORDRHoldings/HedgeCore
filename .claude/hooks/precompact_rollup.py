#!/usr/bin/env python3
"""PreCompact hook — saves context snapshot to memory.db before compaction.

Receives standard hook JSON on stdin (session_id, transcript_path, cwd).
Writes a [PRE-COMPACT] rollup to session_rollups so context survives compression.
Emits a brief reminder to stdout that Claude will see post-compaction.
"""
import sqlite3
import json
import os
import sys
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, ".claude", "state", "memory.db")


def main():
    try:
        data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        data = {}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    session_id = data.get("session_id", "unknown")

    if os.path.exists(DB):
        conn = sqlite3.connect(DB)
        conn.execute(
            "INSERT INTO session_rollups (session_date, summary, next_steps) VALUES (?,?,?)",
            (now, f"[PRE-COMPACT] Context compaction in session {session_id[:8]}", "Resume from .claude/state/CURRENT_STATE.md"),
        )
        conn.commit()
        conn.close()

    # Emit brief context for Claude to see after compaction
    print("Context was compacted. Read .claude/state/CURRENT_STATE.md and .claude/state/CURRENT_SPRINT.md to restore project context.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Decision recorder: writes architectural decisions to memory.db.

Invoked manually or by architect agent when facing ambiguous choices.
Input via stdin JSON: {"title": "...", "context": "...", "decision": "...", "consequences": "...", "adr_ref": "..."}
"""
import json
import sys
import os
import sqlite3
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, ".claude", "state", "memory.db")


def main():
    try:
        data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        print("Usage: echo '{\"title\":\"...\",\"context\":\"...\",\"decision\":\"...\"}' | python decision_recorder.py")
        sys.exit(1)

    title = data.get("title")
    if not title:
        print("Error: 'title' is required")
        sys.exit(1)

    context = data.get("context", "")
    decision = data.get("decision", "")
    consequences = data.get("consequences", "")
    adr_ref = data.get("adr_ref")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    if not os.path.exists(DB):
        print(f"Error: memory.db not found at {DB}")
        sys.exit(1)

    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute(
        "INSERT INTO decisions (decision_date, title, context, decision, consequences, adr_ref) VALUES (?,?,?,?,?,?)",
        (now, title, context, decision, consequences, adr_ref),
    )
    decision_id = c.lastrowid
    conn.commit()
    conn.close()

    print(f"Decision D-{decision_id:03d} recorded: {title}")
    print(f"  Context: {context[:80]}")
    print(f"  Decision: {decision[:80]}")
    if adr_ref:
        print(f"  ADR: {adr_ref}")


if __name__ == "__main__":
    main()

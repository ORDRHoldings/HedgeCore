#!/usr/bin/env python3
"""Session start hook — loads compact project state into context."""
import sqlite3
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, ".claude", "state", "memory.db")
STATE = os.path.join(REPO, ".claude", "state", "CURRENT_STATE.md")


def main():
    out = []

    # Current state (first 10 lines only — header + status)
    if os.path.exists(STATE):
        with open(STATE, "r") as f:
            for i, line in enumerate(f):
                if i >= 10:
                    break
                out.append(line.rstrip())

    if not os.path.exists(DB):
        print("\n".join(out))
        return

    conn = sqlite3.connect(DB)

    # Open risks (compact: severity + risk only)
    risks = conn.execute(
        "SELECT severity, risk FROM open_risks WHERE status='open' ORDER BY "
        "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END LIMIT 3"
    ).fetchall()
    if risks:
        out.append("Risks: " + " | ".join(f"[{s.upper()}] {r}" for s, r in risks))

    # Active work (compact)
    items = conn.execute(
        "SELECT title, status FROM work_items WHERE status IN ('open','in_progress') "
        "ORDER BY priority LIMIT 3"
    ).fetchall()
    if items:
        out.append("Work: " + " | ".join(f"{t} ({s})" for t, s in items))

    conn.close()
    print("\n".join(out))


if __name__ == "__main__":
    main()

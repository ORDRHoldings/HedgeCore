#!/usr/bin/env python3
"""Weekly memory compaction: compresses old session rollups into weekly summaries.

Usage: python scripts/compact_memory.py [--dry-run]
Keeps last 7 days granular, compresses older into weekly summaries.
"""
import sqlite3
import os
import sys
import json
from datetime import datetime, timezone, timedelta

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(REPO, ".claude", "state", "memory.db")
KEEP_DAYS = 7


def main():
    dry_run = "--dry-run" in sys.argv

    if not os.path.exists(DB):
        print(f"memory.db not found at {DB}")
        sys.exit(1)

    conn = sqlite3.connect(DB)
    c = conn.cursor()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).strftime(
        "%Y-%m-%d"
    )

    # Find old rollups (older than KEEP_DAYS)
    old = c.execute(
        "SELECT id, session_date, summary FROM session_rollups WHERE session_date < ? ORDER BY session_date",
        (cutoff,),
    ).fetchall()

    if not old:
        print(f"No rollups older than {KEEP_DAYS} days to compact.")
        conn.close()
        return

    # Group by ISO week
    weeks = {}
    for row_id, date_str, summary in old:
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except ValueError:
            dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
        week_key = dt.strftime("%Y-W%W")
        if week_key not in weeks:
            weeks[week_key] = {"ids": [], "summaries": [], "start": date_str}
        weeks[week_key]["ids"].append(row_id)
        weeks[week_key]["summaries"].append(summary)

    print(f"Found {len(old)} old rollups across {len(weeks)} weeks")

    for week_key, data in sorted(weeks.items()):
        combined = f"[WEEKLY COMPACT {week_key}] {len(data['summaries'])} sessions: "
        combined += " | ".join(s[:80] for s in data["summaries"])
        combined = combined[:500]  # cap at 500 chars

        if dry_run:
            print(f"  Would compact {len(data['ids'])} rollups from {week_key}")
            print(f"  Summary: {combined[:100]}...")
        else:
            # Delete old rows
            placeholders = ",".join("?" * len(data["ids"]))
            c.execute(
                f"DELETE FROM session_rollups WHERE id IN ({placeholders})",
                data["ids"],
            )
            # Insert compacted row
            c.execute(
                "INSERT INTO session_rollups (session_date, summary) VALUES (?, ?)",
                (data["start"], combined),
            )

    if not dry_run:
        conn.commit()
        remaining = c.execute("SELECT COUNT(*) FROM session_rollups").fetchone()[0]
        print(f"Compacted. {remaining} rollups remaining.")
    else:
        print("\n[DRY RUN] No changes made.")

    conn.close()


if __name__ == "__main__":
    main()

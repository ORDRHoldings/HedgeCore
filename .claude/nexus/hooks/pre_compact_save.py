#!/usr/bin/env python3
"""NEXUS Hook: PreCompact — save context, extract learnings, promote patterns, write changelog."""
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Fix Windows encoding
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent paths for imports
_hook_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_hook_dir.parent.parent))  # .claude/


def _extract_learnings(conn, session_id: str) -> list[dict]:
    """Extract learnings from a session's actions and outcomes."""
    learnings = []

    rows = conn.execute("""
        SELECT a.action_type, a.tool, a.target, a.description, a.agent,
               o.outcome_type, o.details
        FROM actions a
        LEFT JOIN outcomes o ON o.action_id = a.id
        WHERE a.session_id = ?
    """, (session_id,)).fetchall()

    # Look for repeated action types as patterns
    action_types = {}
    for row in rows:
        key = f"{row['agent']}:{row['action_type']}"
        if key not in action_types:
            action_types[key] = {"count": 0, "outcomes": []}
        action_types[key]["count"] += 1
        if row["outcome_type"]:
            action_types[key]["outcomes"].append(row["outcome_type"])

    for key, data in action_types.items():
        if data["count"] >= 2:
            learnings.append({
                "type": "repeated_action",
                "action": key,
                "count": data["count"],
                "outcomes": data["outcomes"],
            })

    return learnings


def _promote_patterns(conn) -> list[str]:
    """Promote eligible patterns through the lifecycle."""
    from nexus.constants import PROMOTION_THRESHOLDS

    promoted = []
    for target_status, thresholds in [
        ("candidate", PROMOTION_THRESHOLDS["candidate"]),
        ("promoted", PROMOTION_THRESHOLDS["promoted"]),
        ("canon", PROMOTION_THRESHOLDS["canon"]),
    ]:
        source_status = {
            "candidate": "observation",
            "promoted": "candidate",
            "canon": "promoted",
        }[target_status]

        rows = conn.execute(
            "SELECT id, description FROM patterns "
            "WHERE status = ? AND evidence_count >= ? AND confidence >= ?",
            (source_status, thresholds["min_evidence"], thresholds["min_confidence"]),
        ).fetchall()

        for row in rows:
            conn.execute(
                "UPDATE patterns SET status = ?, promoted_at = datetime('now') WHERE id = ?",
                (target_status, row["id"]),
            )
            promoted.append(f"{row['description']} -> {target_status}")

    return promoted


try:
    # Read any stdin input (compact context)
    stdin_data = sys.stdin.read()

    from nexus.db.connection import transaction
    from nexus.security.hash_chain import append_to_chain, get_chain_length
    from nexus.constants import CHANGELOG_AI

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    with transaction() as conn:
        # ── Find active session ───────────────────────────────────────
        session_row = conn.execute(
            "SELECT id, started_at, actions_count, files_touched FROM sessions "
            "WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()

        if not session_row:
            print("[NEXUS PreCompact] No active session — skipping", file=sys.stderr)
            sys.exit(0)

        session_id = session_row["id"]

        # ── Step 1: Save context snapshot ─────────────────────────────
        snapshot = {
            "compacted_at": now_iso,
            "actions_count": session_row["actions_count"],
            "files_touched": session_row["files_touched"],
            "chain_length": get_chain_length(conn),
            "active_patterns": conn.execute(
                "SELECT COUNT(*) as cnt FROM patterns WHERE status IN ('promoted','canon')"
            ).fetchone()["cnt"],
            "open_risks": conn.execute(
                "SELECT COUNT(*) as cnt FROM risks WHERE status = 'open'"
            ).fetchone()["cnt"],
        }

        conn.execute(
            "UPDATE sessions SET context_snapshot = ? WHERE id = ?",
            (json.dumps(snapshot), session_id),
        )

        # ── Step 2: Extract learnings ─────────────────────────────────
        learnings = _extract_learnings(conn, session_id)
        if learnings:
            conn.execute(
                "UPDATE sessions SET learnings = ? WHERE id = ?",
                (json.dumps(learnings), session_id),
            )

        # ── Step 3: Promote eligible patterns ─────────────────────────
        promotions = _promote_patterns(conn)

        # ── Step 4: Write changelog entry ─────────────────────────────
        changelog_entry = (
            f"\n## Compaction — {now.strftime('%Y-%m-%d %H:%M UTC')}\n\n"
            f"- Session: `{session_id[:12]}...`\n"
            f"- Actions: {session_row['actions_count']}\n"
            f"- Files touched: {session_row['files_touched']}\n"
            f"- Learnings extracted: {len(learnings)}\n"
            f"- Patterns promoted: {len(promotions)}\n"
        )

        if promotions:
            changelog_entry += "- Promotions:\n"
            for p in promotions:
                changelog_entry += f"  - {p}\n"

        try:
            if CHANGELOG_AI.exists():
                existing = CHANGELOG_AI.read_text(encoding="utf-8")
            else:
                existing = "# AI Changelog\n\n> Auto-maintained by NEXUS learning system\n"

            CHANGELOG_AI.write_text(existing + changelog_entry, encoding="utf-8")
        except Exception:
            pass  # Changelog write is best-effort

        # ── Step 5: Add chain entry ───────────────────────────────────
        append_to_chain(
            conn, "compaction",
            json.dumps({
                "session_id": session_id,
                "learnings": len(learnings),
                "promotions": len(promotions),
                "snapshot": snapshot,
            }),
            session_id,
        )

    print(f"[NEXUS PreCompact] Context saved. Learnings: {len(learnings)}, Promotions: {len(promotions)}")

except Exception as e:
    # Never crash
    print(f"[NEXUS PreCompact] Error: {e}", file=sys.stderr)

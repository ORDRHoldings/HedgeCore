#!/usr/bin/env python3
"""NEXUS Hook: Recommendation injection — auto-inject high-scoring recommendations."""
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

# Auto-inject threshold
AUTO_INJECT_THRESHOLD = 0.85

try:
    from nexus.db.connection import transaction

    with transaction() as conn:
        # ── Query high-scoring recommendations ────────────────────────
        recs = conn.execute(
            "SELECT r.id, r.recommendation, r.score, r.priority, r.confidence, "
            "r.times_shown, p.description as pattern_desc "
            "FROM recommendations r "
            "JOIN patterns p ON r.pattern_id = p.id "
            "WHERE r.score >= ? "
            "AND (r.expires_at IS NULL OR r.expires_at > datetime('now')) "
            "ORDER BY r.score DESC "
            "LIMIT 5",
            (AUTO_INJECT_THRESHOLD,),
        ).fetchall()

        if not recs:
            sys.exit(0)

        # ── Format as concise bullet points ───────────────────────────
        lines = ["--- NEXUS Auto-Recommendations (score >= 0.85) ---"]
        for rec in recs:
            priority_tag = f"[{rec['priority'].upper()}]"
            score_display = f"{rec['score']:.2f}"
            lines.append(
                f"  {priority_tag} {rec['recommendation']} "
                f"(score: {score_display}, confidence: {rec['confidence']:.2f})"
            )

        # ── Mark as shown ─────────────────────────────────────────────
        now_iso = datetime.now(timezone.utc).isoformat()
        for rec in recs:
            conn.execute(
                "UPDATE recommendations SET times_shown = times_shown + 1, "
                "last_shown_at = ? WHERE id = ?",
                (now_iso, rec["id"]),
            )

    # ── Output ────────────────────────────────────────────────────────
    print("\n".join(lines))

except Exception as e:
    # Never crash
    print(f"[NEXUS RecommendationInject] Error: {e}", file=sys.stderr)

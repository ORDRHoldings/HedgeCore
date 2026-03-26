#!/usr/bin/env python3
"""NEXUS: Autonomous Learning & Agent Orchestration System — Main CLI.

Usage:
    python nexus.py init          First-time setup
    python nexus.py load          Context restore (heal → state → dashboard → recommendations)
    python nexus.py start         Begin tracked session
    python nexus.py end           Close session (extract learnings, promote patterns)
    python nexus.py heal          Run integrity checks + auto-repair
    python nexus.py recommend     Show scored recommendations
    python nexus.py status        Full dashboard
    python nexus.py agent <name>  Invoke specific agent
    python nexus.py query "SQL"   Read-only query against nexus.db
    python nexus.py metrics       Quality + learning trends
    python nexus.py audit         Verify hash chain integrity
    python nexus.py learn         Manual learning extraction
"""
import io
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Fix Windows encoding for Unicode box-drawing characters
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nexus.constants import (
    DB_PATH, STATE_DIR, STATE_FILES, NEXUS_VERSION, AGENT_NAMES, AGENT_ROLES,
    CURRENT_STATE, CURRENT_SPRINT, CHANGELOG_AI, OPEN_RISKS, OPEN_DECISIONS, GOLDEN_ROLLUPS,
)
from nexus.db.connection import get_connection, transaction, readonly_connection
from nexus.db.schema import initialize_database
from nexus.db.integrity import full_integrity_check
from nexus.db.migrations import needs_migration, run_migrations
from nexus.security.hash_chain import append_to_chain, verify_chain, get_chain_length
from nexus.dashboard.renderer import render_full_dashboard, render_metrics


def cmd_init():
    """First-time setup: create DB, seed genesis, seed agents, create state files."""
    print(f"NEXUS v{NEXUS_VERSION} — Initializing...")

    # Ensure directories exist
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Initialize database
    with transaction() as conn:
        initialize_database(conn)

    # Create state files
    _ensure_state_files()

    # Verify
    with readonly_connection() as conn:
        results = full_integrity_check(conn)
        all_passed = all(passed for _, passed, _ in results)

    if all_passed:
        print(f"  [OK] Database created at {DB_PATH}")
        print(f"  [OK] 28 tables + 4 WORM triggers")
        print(f"  [OK] Genesis row seeded")
        print(f"  [OK] {len(AGENT_NAMES)} agents registered")
        print(f"  [OK] 12 integrity checks defined")
        print(f"  [OK] State files created")
        print(f"\nNEXUS ready. Run `nexus.py start` to begin a session.")
    else:
        print("  [ERROR] Initialization issues:")
        for name, passed, msg in results:
            status = "OK" if passed else "FAIL"
            print(f"    [{status}] {name}: {msg}")
        sys.exit(1)


def cmd_load():
    """The single-script context restore: heal → load state → dashboard → recommendations."""
    print(f"NEXUS v{NEXUS_VERSION} — Loading context...")

    # Step 1: Heal
    issues = _run_healing()

    # Step 2: Load state + show dashboard
    with readonly_connection() as conn:
        print(render_full_dashboard(conn))

    # Step 3: Show recommendations
    _show_recommendations()

    if issues:
        print(f"\n  [WARN] {len(issues)} issue(s) found during healing — see above")


def cmd_start():
    """Begin tracked session."""
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Find parent (last active/completed session)
    with transaction() as conn:
        parent_row = conn.execute(
            "SELECT id FROM sessions WHERE status IN ('active','completed') "
            "ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        parent_id = parent_row["id"] if parent_row else None

        # Build context snapshot
        snapshot = _build_context_snapshot(conn)

        # Create session
        chain_seq = append_to_chain(conn, "session_start", json.dumps({
            "session_id": session_id, "parent_id": parent_id,
        }), session_id)

        conn.execute(
            "INSERT INTO sessions (id, parent_id, status, context_snapshot, chain_start_seq) "
            "VALUES (?, ?, 'active', ?, ?)",
            (session_id, parent_id, json.dumps(snapshot), chain_seq),
        )

    print(f"  Session started: {session_id[:12]}...")
    print(f"  Chain seq: {chain_seq}")
    return session_id


def cmd_end(session_id: str = None):
    """Close session: extract learnings, promote patterns, write rollup, update state."""
    with transaction() as conn:
        if session_id:
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
            ).fetchone()

        if not row:
            print("  [WARN] No active session to end")
            return

        sid = row["id"]

        # Count actions
        action_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM actions WHERE session_id = ?", (sid,)
        ).fetchone()["cnt"]

        file_count = conn.execute(
            "SELECT COUNT(DISTINCT target) as cnt FROM actions WHERE session_id = ? AND target IS NOT NULL",
            (sid,),
        ).fetchone()["cnt"]

        # Extract learnings
        learnings = _extract_learnings(conn, sid)

        # Promote eligible patterns
        promotions = _promote_patterns(conn)

        # Close session
        chain_seq = append_to_chain(conn, "session_end", json.dumps({
            "session_id": sid, "actions": action_count, "files": file_count,
            "learnings": len(learnings), "promotions": len(promotions),
        }), sid)

        conn.execute(
            "UPDATE sessions SET status='completed', ended_at=datetime('now'), "
            "summary=?, learnings=?, chain_end_seq=?, files_touched=?, actions_count=? "
            "WHERE id=?",
            (f"Session with {action_count} actions on {file_count} files",
             json.dumps(learnings), chain_seq, file_count, action_count, sid),
        )

    # Update state files
    _update_state_files()

    print(f"  Session ended: {sid[:12]}...")
    print(f"  Actions: {action_count}  Files: {file_count}")
    print(f"  Learnings extracted: {len(learnings)}")
    print(f"  Patterns promoted: {len(promotions)}")


def cmd_heal():
    """Run all integrity checks, auto-repair, report."""
    print("NEXUS — Running integrity checks...")
    issues = _run_healing()
    if not issues:
        print("  [OK] All checks passed")
    else:
        print(f"\n  {len(issues)} issue(s) found")


def cmd_recommend():
    """Show scored recommendations."""
    _show_recommendations(verbose=True)


def cmd_status():
    """Full dashboard."""
    with readonly_connection() as conn:
        print(render_full_dashboard(conn))


def cmd_agent(agent_name: str):
    """Show agent context and invoke."""
    if agent_name not in AGENT_NAMES:
        print(f"  [ERROR] Unknown agent: {agent_name}")
        print(f"  Available: {', '.join(AGENT_NAMES)}")
        sys.exit(1)

    with readonly_connection() as conn:
        row = conn.execute(
            "SELECT * FROM agents WHERE name = ?", (agent_name,)
        ).fetchone()

        activity = conn.execute(
            "SELECT task, outcome, started_at FROM agent_activity "
            "WHERE agent_name = ? ORDER BY started_at DESC LIMIT 5",
            (agent_name,),
        ).fetchall()

    print(f"\n  Agent: {agent_name}")
    print(f"  Role: {AGENT_ROLES[agent_name]}")
    print(f"  Status: {row['status']}")
    print(f"  Success rate: {row['success_rate']:.0%}" if row['success_rate'] else "  Success rate: ---")
    print(f"  Tasks: {row['tasks_completed']} completed, {row['tasks_failed']} failed")

    if activity:
        print(f"\n  Recent activity:")
        for act in activity:
            print(f"    [{act['outcome'] or '...'}] {act['task'][:60]}  ({act['started_at'][:16]})")


def cmd_query(sql: str):
    """Read-only query against nexus.db."""
    with readonly_connection() as conn:
        try:
            rows = conn.execute(sql).fetchall()
            if not rows:
                print("  (no results)")
                return
            # Print header
            cols = rows[0].keys()
            print("  " + " | ".join(cols))
            print("  " + "-+-".join("-" * max(len(c), 8) for c in cols))
            for row in rows:
                print("  " + " | ".join(str(row[c])[:30] for c in cols))
        except Exception as e:
            print(f"  [ERROR] {e}")


def cmd_metrics():
    """Quality + learning trends with ASCII sparklines."""
    with readonly_connection() as conn:
        print(render_metrics(conn))


def cmd_audit():
    """Verify hash chain integrity."""
    print("NEXUS — Verifying audit chain...")
    with readonly_connection() as conn:
        valid, broken_seq = verify_chain(conn)
        length = get_chain_length(conn)

    if valid:
        print(f"  [OK] Chain valid — {length} entries")
    else:
        print(f"  [FAIL] Chain broken at seq={broken_seq}")
        sys.exit(1)


def cmd_learn():
    """Manual learning extraction."""
    with transaction() as conn:
        # Get last completed session
        row = conn.execute(
            "SELECT id FROM sessions WHERE status = 'completed' ORDER BY ended_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            print("  [WARN] No completed sessions to learn from")
            return

        learnings = _extract_learnings(conn, row["id"])
        promotions = _promote_patterns(conn)

    print(f"  Learnings extracted: {len(learnings)}")
    print(f"  Patterns promoted: {len(promotions)}")


# ── Internal Helpers ───────────────────────────────────────────────────

def _ensure_state_files():
    """Create state markdown files if they don't exist."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    templates = {
        CURRENT_STATE: "# NEXUS Current State\n\n> Auto-generated by NEXUS\n\n## Status: INITIALIZED\n",
        CURRENT_SPRINT: "# Current Sprint\n\n> No active sprint\n",
        CHANGELOG_AI: "# AI Changelog\n\n> Auto-maintained by NEXUS learning system\n",
        OPEN_RISKS: "# Open Risks\n\n> No risks identified\n",
        OPEN_DECISIONS: "# Open Decisions\n\n> No pending decisions\n",
        GOLDEN_ROLLUPS: "# Golden Rollups\n\n> Session summaries promoted to permanent knowledge\n",
    }
    for path, content in templates.items():
        if not path.exists():
            path.write_text(content, encoding="utf-8")


def _build_context_snapshot(conn):
    """Build context snapshot for session start."""
    snapshot = {
        "active_patterns": conn.execute(
            "SELECT COUNT(*) as cnt FROM patterns WHERE status IN ('promoted','canon')"
        ).fetchone()["cnt"],
        "open_risks": conn.execute(
            "SELECT COUNT(*) as cnt FROM risks WHERE status = 'open'"
        ).fetchone()["cnt"],
        "open_work_items": conn.execute(
            "SELECT COUNT(*) as cnt FROM work_items WHERE status NOT IN ('done','cancelled')"
        ).fetchone()["cnt"],
        "chain_length": get_chain_length(conn),
        "total_sessions": conn.execute("SELECT COUNT(*) as cnt FROM sessions").fetchone()["cnt"],
    }
    return snapshot


def _run_healing():
    """Run integrity checks and auto-repair. Returns list of issues."""
    issues = []
    with transaction() as conn:
        results = full_integrity_check(conn)
        for name, passed, msg in results:
            if passed:
                print(f"  [OK] {name}")
            else:
                print(f"  [FAIL] {name}: {msg}")
                issues.append((name, msg))

            # Update check record
            conn.execute(
                "UPDATE integrity_checks SET last_run = datetime('now'), last_result = ? "
                "WHERE name = ?",
                ("pass" if passed else "fail", name),
            )

    # Auto-repair state files
    _ensure_state_files()

    return issues


def _extract_learnings(conn, session_id: str) -> list[dict]:
    """Extract learnings from a session's actions and outcomes."""
    learnings = []

    # Get action-outcome pairs
    rows = conn.execute("""
        SELECT a.action_type, a.tool, a.target, a.description, a.agent,
               o.outcome_type, o.details
        FROM actions a
        LEFT JOIN outcomes o ON o.action_id = a.id
        WHERE a.session_id = ?
    """, (session_id,)).fetchall()

    # Simple pattern extraction: look for repeated action types
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
            promoted.append(f"{row['description']} → {target_status}")

    return promoted


def _show_recommendations(verbose: bool = False):
    """Show active recommendations."""
    with readonly_connection() as conn:
        rows = conn.execute(
            "SELECT r.recommendation, r.score, r.confidence, r.priority, "
            "r.times_shown, r.times_applied, r.times_rejected, p.description as pattern "
            "FROM recommendations r JOIN patterns p ON r.pattern_id = p.id "
            "WHERE r.expires_at IS NULL OR r.expires_at > datetime('now') "
            "ORDER BY r.score DESC LIMIT 10"
        ).fetchall()

    if not rows:
        if verbose:
            print("  No active recommendations (system is still learning)")
        return

    print(f"\n  {'=' * 50}")
    print(f"  NEXUS Recommendations")
    print(f"  {'=' * 50}")
    for row in rows:
        score_bar = "█" * int(row["score"] * 10) + "░" * (10 - int(row["score"] * 10))
        print(f"\n  [{row['priority'].upper()}] {row['recommendation']}")
        print(f"    Score: {score_bar} {row['score']:.2f}  Confidence: {row['confidence']:.2f}")
        if verbose:
            print(f"    Based on: {row['pattern']}")
            print(f"    Shown: {row['times_shown']}  Applied: {row['times_applied']}  Rejected: {row['times_rejected']}")


def _update_state_files():
    """Regenerate state files from database."""
    try:
        with readonly_connection() as conn:
            # Update CURRENT_STATE
            sessions = conn.execute(
                "SELECT COUNT(*) as total, "
                "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed "
                "FROM sessions"
            ).fetchone()

            patterns = conn.execute(
                "SELECT COUNT(*) as cnt FROM patterns WHERE status != 'deprecated'"
            ).fetchone()

            CURRENT_STATE.write_text(
                f"# NEXUS Current State\n\n"
                f"> Auto-generated by NEXUS\n\n"
                f"## Sessions: {sessions['total']} total, {sessions['completed']} completed\n"
                f"## Active Patterns: {patterns['cnt']}\n"
                f"## Last Updated: {datetime.now(timezone.utc).isoformat()}\n",
                encoding="utf-8",
            )

            # Update OPEN_RISKS
            risks = conn.execute(
                "SELECT title, severity, category FROM risks WHERE status = 'open' "
                "ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END"
            ).fetchall()

            risk_lines = "\n".join(
                f"- **[{r['severity'].upper()}]** {r['title']} ({r['category']})"
                for r in risks
            ) or "> No open risks"

            OPEN_RISKS.write_text(
                f"# Open Risks\n\n{risk_lines}\n",
                encoding="utf-8",
            )
    except Exception:
        pass  # State file updates are best-effort


# ── Main Entry Point ──────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    commands = {
        "init": cmd_init,
        "load": cmd_load,
        "start": cmd_start,
        "end": lambda: cmd_end(sys.argv[2] if len(sys.argv) > 2 else None),
        "heal": cmd_heal,
        "recommend": cmd_recommend,
        "status": cmd_status,
        "agent": lambda: cmd_agent(sys.argv[2] if len(sys.argv) > 2 else "commander"),
        "query": lambda: cmd_query(sys.argv[2] if len(sys.argv) > 2 else "SELECT * FROM _nexus_meta"),
        "metrics": cmd_metrics,
        "audit": cmd_audit,
        "learn": cmd_learn,
    }

    if cmd not in commands:
        print(f"Unknown command: {cmd}")
        print(f"Available: {', '.join(commands.keys())}")
        sys.exit(1)

    commands[cmd]()


if __name__ == "__main__":
    main()

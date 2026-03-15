"""NEXUS self-healing: escalation logic."""
import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from ..security.hash_chain import append_to_chain
from .checks import CheckResult


def should_escalate(check_result: CheckResult) -> bool:
    """Determine if a check result requires escalation.

    Returns True if the check is not auto-repairable or has already failed.
    """
    if check_result.passed:
        return False
    return not check_result.auto_repairable


def escalate_issue(
    conn: sqlite3.Connection,
    check_name: str,
    issue: str,
    session_id: Optional[str] = None,
) -> str:
    """Log an escalation to healing_log, add a chain entry, return escalation message."""
    timestamp = datetime.now(timezone.utc).isoformat()

    # Insert into healing_log
    conn.execute(
        "INSERT INTO healing_log (check_name, status, detail, ts) VALUES (?, ?, ?, ?)",
        (check_name, "escalated", issue, timestamp),
    )

    # Append to the audit hash chain
    payload = json.dumps({
        "action": "escalation",
        "check": check_name,
        "issue": issue,
        "ts": timestamp,
    })
    append_to_chain(conn, "healing_escalation", payload, session_id)

    message = (
        f"[NEXUS ESCALATION] {check_name}\n"
        f"  Issue: {issue}\n"
        f"  Time: {timestamp}\n"
        f"  Status: Requires manual intervention"
    )
    return message


def get_escalation_history(
    conn: sqlite3.Connection, limit: int = 10
) -> list[dict]:
    """Retrieve recent escalations from healing_log."""
    rows = conn.execute(
        "SELECT check_name, status, detail, ts FROM healing_log "
        "WHERE status = 'escalated' ORDER BY ts DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        {
            "check_name": row["check_name"],
            "status": row["status"],
            "detail": row["detail"],
            "ts": row["ts"],
        }
        for row in rows
    ]


def format_escalation_report(issues: list[dict]) -> str:
    """Format a list of escalation issues into a display-ready report."""
    if not issues:
        return "No escalation issues to report."

    lines = [
        "=" * 60,
        "  NEXUS ESCALATION REPORT",
        "=" * 60,
        "",
    ]
    for i, issue in enumerate(issues, 1):
        check = issue.get("check_name", "unknown")
        detail = issue.get("detail", "No details available.")
        ts = issue.get("ts", "unknown")
        status = issue.get("status", "escalated")
        lines.append(f"  [{i}] {check}")
        lines.append(f"      Status : {status}")
        lines.append(f"      Detail : {detail}")
        lines.append(f"      Time   : {ts}")
        lines.append("")

    lines.append("=" * 60)
    lines.append(f"  Total issues: {len(issues)}")
    lines.append("=" * 60)
    return "\n".join(lines)

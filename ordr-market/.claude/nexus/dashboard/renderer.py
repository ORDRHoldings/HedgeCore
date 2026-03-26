"""ANSI terminal dashboard renderer."""
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from ..constants import NEXUS_VERSION


# ── ANSI Colors ────────────────────────────────────────────────────────
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    BG_BLUE = "\033[44m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"


def _sparkline(values: list[float], width: int = 10) -> str:
    """Generate ASCII sparkline from values."""
    if not values:
        return "~" * width
    blocks = " ▁▂▃▄▅▆▇█"
    mn, mx = min(values), max(values)
    rng = mx - mn if mx != mn else 1
    # Pad or truncate to width
    if len(values) > width:
        values = values[-width:]
    elif len(values) < width:
        values = [mn] * (width - len(values)) + values
    return "".join(blocks[min(8, int((v - mn) / rng * 8))] for v in values)


def _status_badge(status: str) -> str:
    """Colored status badge."""
    colors = {
        "pass": C.GREEN, "ok": C.GREEN, "active": C.GREEN,
        "fail": C.RED, "error": C.RED, "critical": C.RED,
        "warning": C.YELLOW, "escalated": C.YELLOW,
        "repaired": C.CYAN, "skip": C.DIM,
    }
    color = colors.get(status.lower(), C.WHITE)
    return f"{color}{C.BOLD}[{status.upper()}]{C.RESET}"


def _box(title: str, lines: list[str], width: int = 60) -> str:
    """Draw a boxed section."""
    top = f"┌─ {C.BOLD}{C.CYAN}{title}{C.RESET} " + "─" * max(0, width - len(title) - 4) + "┐"
    bot = "└" + "─" * (width - 2) + "┘"
    body = "\n".join(f"│ {line:<{width-4}} │" for line in lines)
    return f"{top}\n{body}\n{bot}"


def render_header() -> str:
    """Render the NEXUS header."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    return (
        f"\n{C.BG_BLUE}{C.WHITE}{C.BOLD}"
        f"  ╔═══════════════════════════════════════════════════╗  {C.RESET}\n"
        f"{C.BG_BLUE}{C.WHITE}{C.BOLD}"
        f"  ║   NEXUS v{NEXUS_VERSION}  ·  Autonomous Learning System   ║  {C.RESET}\n"
        f"{C.BG_BLUE}{C.WHITE}{C.BOLD}"
        f"  ╚═══════════════════════════════════════════════════╝  {C.RESET}\n"
        f"  {C.DIM}{now}{C.RESET}\n"
    )


def render_session_info(conn: sqlite3.Connection) -> str:
    """Render current session information."""
    row = conn.execute(
        "SELECT id, started_at, files_touched, actions_count "
        "FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    if not row:
        return _box("Session", [f"{C.DIM}No active session{C.RESET}"])

    lines = [
        f"ID:      {row['id'][:12]}...",
        f"Started: {row['started_at']}",
        f"Files:   {row['files_touched']}  Actions: {row['actions_count']}",
    ]
    return _box("Session", lines)


def render_integrity(conn: sqlite3.Connection) -> str:
    """Render integrity check results."""
    rows = conn.execute(
        "SELECT name, last_result FROM integrity_checks WHERE enabled = 1 ORDER BY name"
    ).fetchall()
    if not rows:
        return _box("Integrity", [f"{C.DIM}No checks defined{C.RESET}"])

    lines = []
    for row in rows:
        result = row["last_result"] or "pending"
        badge = _status_badge(result)
        lines.append(f"  {badge} {row['name']}")
    return _box("Integrity", lines)


def render_learning(conn: sqlite3.Connection) -> str:
    """Render learning status."""
    counts = {}
    for status in ("observation", "candidate", "promoted", "canon"):
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM patterns WHERE status = ?", (status,)
        ).fetchone()
        counts[status] = row["cnt"]

    total = sum(counts.values())
    avg_row = conn.execute(
        "SELECT AVG(confidence) as avg_conf FROM patterns WHERE status != 'deprecated'"
    ).fetchone()
    avg_conf = avg_row["avg_conf"] or 0.0

    lines = [
        f"Patterns: {total}  (Avg confidence: {avg_conf:.2f})",
        f"  Observations: {counts['observation']}  Candidates: {counts['candidate']}",
        f"  Promoted: {counts['promoted']}  Canon: {counts['canon']}",
    ]

    # Recommendation stats
    rec_row = conn.execute(
        "SELECT COUNT(*) as cnt, AVG(score) as avg_score FROM recommendations"
    ).fetchone()
    lines.append(f"Recommendations: {rec_row['cnt']}  (Avg score: {(rec_row['avg_score'] or 0):.2f})")

    return _box("Learning", lines)


def render_agents(conn: sqlite3.Connection) -> str:
    """Render agent status."""
    rows = conn.execute(
        "SELECT name, status, tasks_completed, tasks_failed, success_rate FROM agents ORDER BY name"
    ).fetchall()
    lines = []
    for row in rows:
        badge = _status_badge(row["status"])
        rate = f"{row['success_rate']:.0%}" if row["success_rate"] else "---"
        lines.append(f"  {badge} {row['name']:<16} {row['tasks_completed']:>3}ok {row['tasks_failed']:>3}fail  {rate}")
    return _box("Agents", lines)


def render_risks(conn: sqlite3.Connection) -> str:
    """Render open risks."""
    rows = conn.execute(
        "SELECT title, severity, category FROM risks WHERE status = 'open' ORDER BY "
        "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END "
        "LIMIT 5"
    ).fetchall()
    if not rows:
        lines = [f"  {C.GREEN}No open risks{C.RESET}"]
    else:
        lines = []
        for row in rows:
            sev_colors = {"critical": C.RED, "high": C.YELLOW, "medium": C.CYAN, "low": C.DIM}
            color = sev_colors.get(row["severity"], C.WHITE)
            lines.append(f"  {color}[{row['severity'].upper()}]{C.RESET} {row['title']}")
    return _box("Risks", lines)


def render_work_items(conn: sqlite3.Connection) -> str:
    """Render current work items."""
    rows = conn.execute(
        "SELECT title, status, priority, assigned_to FROM work_items "
        "WHERE status NOT IN ('done','cancelled') "
        "ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END "
        "LIMIT 5"
    ).fetchall()
    if not rows:
        lines = [f"  {C.DIM}No active work items{C.RESET}"]
    else:
        lines = []
        for row in rows:
            badge = _status_badge(row["status"])
            agent = f"@{row['assigned_to']}" if row["assigned_to"] else ""
            lines.append(f"  {badge} {row['title'][:40]} {C.DIM}{agent}{C.RESET}")
    return _box("Work Items", lines)


def render_chain_status(conn: sqlite3.Connection) -> str:
    """Render audit chain status."""
    row = conn.execute("SELECT COUNT(*) as cnt, MAX(created_at) as last FROM audit_chain").fetchone()
    lines = [
        f"Chain length: {row['cnt']}",
        f"Last entry:   {row['last'] or 'none'}",
    ]
    return _box("Audit Chain", lines)


def render_full_dashboard(conn: sqlite3.Connection) -> str:
    """Render the complete dashboard."""
    sections = [
        render_header(),
        render_session_info(conn),
        render_integrity(conn),
        render_learning(conn),
        render_agents(conn),
        render_risks(conn),
        render_work_items(conn),
        render_chain_status(conn),
    ]
    return "\n".join(sections)


def render_metrics(conn: sqlite3.Connection) -> str:
    """Render quality + learning metrics with sparklines."""
    # Quality trend
    q_rows = conn.execute(
        "SELECT date, pass_rate, lint_issues FROM quality_metrics ORDER BY date DESC LIMIT 10"
    ).fetchall()
    q_rates = [r["pass_rate"] for r in reversed(q_rows)] if q_rows else []

    # Learning trend
    l_rows = conn.execute(
        "SELECT date, confidence_avg, hit_rate FROM learning_metrics ORDER BY date DESC LIMIT 10"
    ).fetchall()
    l_confs = [r["confidence_avg"] for r in reversed(l_rows)] if l_rows else []
    l_hits = [r["hit_rate"] for r in reversed(l_rows)] if l_rows else []

    lines = [
        f"  Pass Rate:    {_sparkline(q_rates)}  {q_rates[-1]:.0%}" if q_rates else "  Pass Rate:    (no data)",
        f"  Confidence:   {_sparkline(l_confs)}  {l_confs[-1]:.2f}" if l_confs else "  Confidence:   (no data)",
        f"  Hit Rate:     {_sparkline(l_hits)}  {l_hits[-1]:.0%}" if l_hits else "  Hit Rate:     (no data)",
    ]
    return render_header() + "\n" + _box("Metrics Trends", lines)

"""
v1_devops.py

DevOps dashboard endpoints — serves Claude Code operating system state
from the local SQLite memory database (.claude/state/memory.db).

All endpoints require superuser access.
"""

import os
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends

from app.core.dependencies import require_superuser
from app.models.user import User

router = APIRouter(prefix="/v1/devops", tags=["devops"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _repo_root() -> str:
    """Resolve the repository root (two levels up from backend/app/api/routes/)."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "..", "..", ".."))


def _db_path() -> str:
    return os.path.join(_repo_root(), ".claude", "state", "memory.db")


def _introspection_enabled() -> bool:
    """DevOps introspection is a local-development affordance only.

    The memory.db it reads lives under .claude/state/ and is never shipped in
    the production Docker image, so these endpoints already return empty in
    prod. This is the defense-in-depth backstop: even if .claude/ were shipped
    by accident, refuse to surface internal operating-system state in a
    production environment. Superuser auth still gates every route on top.
    """
    env = os.environ.get("ENV", "").strip().lower()
    return env not in {"production", "prod"}


def _db_available() -> bool:
    return _introspection_enabled() and os.path.isfile(_db_path())


def _query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Run a read-only query against memory.db, return list of row dicts."""
    path = _db_path()
    if not os.path.isfile(path):
        return []
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _scalar(sql: str, params: tuple = ()) -> Any:
    """Run a query returning a single scalar value."""
    path = _db_path()
    if not os.path.isfile(path):
        return 0
    conn = sqlite3.connect(path)
    try:
        row = conn.execute(sql, params).fetchone()
        return row[0] if row else 0
    finally:
        conn.close()


def _read_sprint(max_lines: int = 20) -> str | None:
    """Read first N lines of CURRENT_SPRINT.md from repo root."""
    sprint_path = os.path.join(_repo_root(), ".claude", "state", "CURRENT_SPRINT.md")
    if not os.path.isfile(sprint_path):
        return None
    try:
        with open(sprint_path, encoding="utf-8") as f:
            lines = [f.readline() for _ in range(max_lines)]
        return "".join(lines).rstrip()
    except OSError:
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
async def devops_status(
    _user: User = Depends(require_superuser),
) -> dict[str, Any]:
    """Combined DevOps status snapshot."""
    available = _db_available()
    if not available:
        return {
            "memory_db_available": False,
            "sprint": _read_sprint(),
            "risks": [],
            "sessions": [],
            "freeze": [],
            "decisions": [],
            "validations": [],
            "file_facts_count": 0,
            "work_items": [],
            "done_count": 0,
        }

    return {
        "memory_db_available": True,
        "sprint": _read_sprint(),
        "risks": _query(
            "SELECT * FROM open_risks WHERE status='open' ORDER BY severity"
        ),
        "sessions": _query(
            "SELECT * FROM session_rollups ORDER BY rowid DESC LIMIT 5"
        ),
        "freeze": _query("SELECT * FROM architecture_freeze"),
        "decisions": _query(
            "SELECT * FROM decisions ORDER BY rowid DESC LIMIT 10"
        ),
        "validations": _query(
            "SELECT * FROM validation_runs ORDER BY rowid DESC LIMIT 10"
        ),
        "file_facts_count": _scalar("SELECT COUNT(*) FROM file_facts"),
        "work_items": _query(
            "SELECT * FROM work_items WHERE status != 'done'"
        ),
        "done_count": _scalar("SELECT COUNT(*) FROM work_items WHERE status = 'done'"),
    }


@router.get("/risks")
async def devops_risks(
    _user: User = Depends(require_superuser),
) -> dict[str, Any]:
    """All open risks."""
    if not _db_available():
        return {"memory_db_available": False, "risks": []}
    return {
        "memory_db_available": True,
        "risks": _query("SELECT * FROM open_risks"),
    }


@router.get("/decisions")
async def devops_decisions(
    _user: User = Depends(require_superuser),
) -> dict[str, Any]:
    """All decisions."""
    if not _db_available():
        return {"memory_db_available": False, "decisions": []}
    return {
        "memory_db_available": True,
        "decisions": _query("SELECT * FROM decisions"),
    }


@router.get("/sessions")
async def devops_sessions(
    _user: User = Depends(require_superuser),
) -> dict[str, Any]:
    """Last 20 session rollups."""
    if not _db_available():
        return {"memory_db_available": False, "sessions": []}
    return {
        "memory_db_available": True,
        "sessions": _query(
            "SELECT * FROM session_rollups ORDER BY rowid DESC LIMIT 20"
        ),
    }


@router.get("/freeze")
async def devops_freeze(
    _user: User = Depends(require_superuser),
) -> dict[str, Any]:
    """Architecture freeze entries."""
    if not _db_available():
        return {"memory_db_available": False, "freeze": []}
    return {
        "memory_db_available": True,
        "freeze": _query("SELECT * FROM architecture_freeze"),
    }

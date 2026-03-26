"""Base agent abstract class for NEXUS agents."""
import sqlite3
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from nexus.constants import DB_PATH, AGENT_ROLES
from nexus.db.connection import transaction, readonly_connection


class BaseAgent(ABC):
    """Abstract base class for all NEXUS agents."""

    name: str = ""
    role: str = ""
    allowed_tools: list[str] = []
    decision_authority: str = ""
    tables_owned: list[str] = []

    def __init__(self):
        self.role = AGENT_ROLES.get(self.name, self.role)

    @abstractmethod
    def execute(self, task: str, context: dict = None) -> dict:
        """Execute a task. Returns {status, result, confidence, files_touched}."""
        ...

    def log_activity(self, session_id: str, task: str, outcome: str,
                     confidence: float = None, files_touched: list = None,
                     escalated_to: str = None):
        """Log agent activity to the database."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO agent_activity (session_id, agent_name, task, outcome, "
                "confidence, files_touched, escalated_to) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (session_id, self.name, task, outcome, confidence,
                 json.dumps(files_touched) if files_touched else None, escalated_to),
            )
            # Update agent stats
            if outcome == "success":
                conn.execute("UPDATE agents SET tasks_completed = tasks_completed + 1 WHERE name = ?", (self.name,))
            elif outcome == "failure":
                conn.execute("UPDATE agents SET tasks_failed = tasks_failed + 1 WHERE name = ?", (self.name,))

    def send_message(self, session_id: str, to_agent: str, message_type: str,
                     subject: str, body: str = None):
        """Send an inter-agent message."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO agent_messages (session_id, from_agent, to_agent, message_type, subject, body) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, self.name, to_agent, message_type, subject, body),
            )

    def get_context(self) -> dict:
        """Get agent's current context from DB."""
        with readonly_connection() as conn:
            agent_row = conn.execute("SELECT * FROM agents WHERE name = ?", (self.name,)).fetchone()
            recent = conn.execute(
                "SELECT task, outcome, started_at FROM agent_activity "
                "WHERE agent_name = ? ORDER BY started_at DESC LIMIT 5", (self.name,)
            ).fetchall()
            messages = conn.execute(
                "SELECT from_agent, message_type, subject, created_at FROM agent_messages "
                "WHERE to_agent = ? ORDER BY created_at DESC LIMIT 5", (self.name,)
            ).fetchall()
        return {
            "agent": dict(agent_row) if agent_row else {},
            "recent_activity": [dict(r) for r in recent],
            "pending_messages": [dict(m) for m in messages],
        }

    def escalate(self, session_id: str, to_agent: str, issue: str, context: dict = None):
        """Escalate an issue to another agent."""
        self.send_message(session_id, to_agent, "escalation", issue,
                         json.dumps(context) if context else None)
        self.log_activity(session_id, f"Escalated: {issue}", "escalated",
                         escalated_to=to_agent)

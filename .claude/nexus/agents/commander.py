"""Commander agent — orchestrates all agents, resolves conflicts, manages workflow."""
import json
from .base import BaseAgent
from ..constants import AGENT_NAMES
from ..db.connection import transaction, readonly_connection


class CommanderAgent(BaseAgent):
    """Orchestrate all agents, resolve conflicts, manage workflow."""

    name = "commander"
    allowed_tools = [
        "Read", "Grep", "Glob", "Bash", "Write", "Edit",
        "agent_dispatch", "session_manage",
    ]
    decision_authority = "Final decision on all non-security matters"
    tables_owned = ["sessions", "agent_messages", "_nexus_meta"]

    def execute(self, task: str, context: dict = None) -> dict:
        """Route tasks to appropriate agents, check for conflicts."""
        context = context or {}
        session_id = context.get("session_id", "")

        # Determine which agent should handle the task
        routing = self._route_task(task, context)

        # Check for active conflicts between agents
        conflicts = self._check_conflicts(session_id)
        if conflicts:
            resolution = self._resolve_conflicts(session_id, conflicts)
            return {
                "status": "conflict_resolved",
                "result": resolution,
                "confidence": 0.85,
                "files_touched": [],
                "routing": routing,
            }

        return {
            "status": "success",
            "result": f"Task routed to {routing['target_agent']}",
            "confidence": routing["confidence"],
            "files_touched": [],
            "routing": routing,
        }

    def _route_task(self, task: str, context: dict) -> dict:
        """Determine which agent should handle a task."""
        task_lower = task.lower()
        routing_map = {
            "architect": ["architecture", "design", "adr", "freeze", "pattern"],
            "coder": ["implement", "code", "write", "function", "class", "test"],
            "reviewer": ["review", "quality", "approve", "check"],
            "cybersec": ["security", "vulnerability", "compliance", "secret", "cve"],
            "data-scientist": ["pattern", "analysis", "statistics", "metric"],
            "ml-engineer": ["learning", "weight", "calibrat", "threshold", "tune"],
            "self-healer": ["integrity", "repair", "heal", "orphan", "stale"],
        }
        for agent, keywords in routing_map.items():
            if any(kw in task_lower for kw in keywords):
                return {"target_agent": agent, "confidence": 0.80}
        return {"target_agent": "coder", "confidence": 0.50}

    def _check_conflicts(self, session_id: str) -> list:
        """Check for unresolved conflicts between agents."""
        with readonly_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_messages WHERE session_id = ? "
                "AND message_type = 'conflict' AND status = 'pending'",
                (session_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def _resolve_conflicts(self, session_id: str, conflicts: list) -> dict:
        """Resolve conflicts between agents. Cybersec always wins on security."""
        resolutions = []
        for conflict in conflicts:
            body = json.loads(conflict.get("body", "{}")) if conflict.get("body") else {}
            if body.get("domain") == "security":
                winner = "cybersec"
            else:
                winner = "commander"
            resolutions.append({"conflict_id": conflict.get("id"), "winner": winner})
            with transaction() as conn:
                conn.execute(
                    "UPDATE agent_messages SET status = 'resolved' WHERE id = ?",
                    (conflict.get("id"),),
                )
        return {"resolved": resolutions}

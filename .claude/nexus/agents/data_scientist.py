"""Data Scientist agent — pattern detection, statistical analysis."""
import json
import math
from .base import BaseAgent
from ..constants import PROMOTION_THRESHOLDS
from ..db.connection import transaction, readonly_connection


class DataScientistAgent(BaseAgent):
    """Pattern detection, statistical analysis, evidence gathering."""

    name = "data-scientist"
    allowed_tools = ["Read", "Grep", "Glob", "Bash"]
    decision_authority = "Pattern promotion decisions"
    tables_owned = ["patterns", "learning_metrics", "quality_metrics"]

    def execute(self, task: str, context: dict = None) -> dict:
        """Analyze patterns, compute statistics."""
        context = context or {}
        session_id = context.get("session_id", "")

        task_lower = task.lower()
        if "promot" in task_lower:
            result = self._evaluate_promotions(session_id)
        elif "stat" in task_lower or "analyz" in task_lower:
            result = self._compute_statistics(session_id, context)
        else:
            result = self._detect_patterns(session_id, context)

        self.log_activity(session_id, task, "success", confidence=result.get("confidence", 0.75))
        return result

    def _detect_patterns(self, session_id: str, context: dict) -> dict:
        """Detect recurring patterns from agent activity and outcomes."""
        with readonly_connection() as conn:
            activities = conn.execute(
                "SELECT agent_name, task, outcome, confidence FROM agent_activity "
                "ORDER BY started_at DESC LIMIT 100"
            ).fetchall()

        # Aggregate success/failure by agent
        agent_stats = {}
        for row in activities:
            agent = row["agent_name"]
            if agent not in agent_stats:
                agent_stats[agent] = {"success": 0, "failure": 0, "total": 0}
            agent_stats[agent]["total"] += 1
            if row["outcome"] == "success":
                agent_stats[agent]["success"] += 1
            elif row["outcome"] == "failure":
                agent_stats[agent]["failure"] += 1

        patterns_found = []
        for agent, stats in agent_stats.items():
            if stats["total"] >= 5:
                rate = stats["success"] / stats["total"]
                if rate < 0.50:
                    patterns_found.append({
                        "type": "low_success_rate",
                        "agent": agent,
                        "rate": round(rate, 3),
                        "sample_size": stats["total"],
                    })

        return {
            "status": "success",
            "result": {"patterns": patterns_found, "agent_stats": agent_stats},
            "confidence": 0.75,
            "files_touched": [],
        }

    def _evaluate_promotions(self, session_id: str) -> dict:
        """Evaluate patterns for promotion based on evidence thresholds."""
        promoted = []
        with readonly_connection() as conn:
            patterns = conn.execute(
                "SELECT id, pattern_type, description, status, confidence, evidence_count "
                "FROM patterns WHERE status != 'canon'"
            ).fetchall()

        for p in patterns:
            current = p["status"]
            conf = p["confidence"] or 0.0
            evidence = p["evidence_count"] or 0

            # Determine next promotion level
            next_level = None
            if current == "observation":
                next_level = "candidate"
            elif current == "candidate":
                next_level = "promoted"
            elif current == "promoted":
                next_level = "canon"

            if next_level and next_level in PROMOTION_THRESHOLDS:
                thresh = PROMOTION_THRESHOLDS[next_level]
                if evidence >= thresh["min_evidence"] and conf >= thresh["min_confidence"]:
                    with transaction() as conn:
                        conn.execute(
                            "UPDATE patterns SET status = ? WHERE id = ?",
                            (next_level, p["id"]),
                        )
                    promoted.append({
                        "pattern_id": p["id"],
                        "from": current,
                        "to": next_level,
                        "confidence": conf,
                        "evidence": evidence,
                    })

        return {
            "status": "success",
            "result": {"promoted": promoted, "evaluated": len(patterns) if patterns else 0},
            "confidence": 0.85,
            "files_touched": [],
        }

    def _compute_statistics(self, session_id: str, context: dict) -> dict:
        """Compute aggregate statistics for the NEXUS system."""
        with readonly_connection() as conn:
            total_sessions = conn.execute("SELECT COUNT(*) as c FROM sessions").fetchone()["c"]
            total_actions = conn.execute("SELECT COUNT(*) as c FROM actions").fetchone()["c"]
            total_patterns = conn.execute("SELECT COUNT(*) as c FROM patterns").fetchone()["c"]

            avg_conf = conn.execute(
                "SELECT AVG(confidence) as avg_conf FROM agent_activity WHERE confidence IS NOT NULL"
            ).fetchone()["avg_conf"]

            agent_perf = conn.execute(
                "SELECT agent_name, COUNT(*) as total, "
                "SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) as successes "
                "FROM agent_activity GROUP BY agent_name"
            ).fetchall()

        stats = {
            "total_sessions": total_sessions,
            "total_actions": total_actions,
            "total_patterns": total_patterns,
            "avg_confidence": round(avg_conf, 3) if avg_conf else 0.0,
            "agent_performance": {
                row["agent_name"]: {
                    "total": row["total"],
                    "successes": row["successes"],
                    "rate": round(row["successes"] / row["total"], 3) if row["total"] else 0,
                }
                for row in agent_perf
            },
        }
        return {
            "status": "success",
            "result": stats,
            "confidence": 0.90,
            "files_touched": [],
        }

    def record_quality_metric(self, session_id: str, metric_name: str,
                              value: float, context_data: dict = None):
        """Record a quality metric data point."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO quality_metrics (session_id, metric_name, value, context) "
                "VALUES (?, ?, ?, ?)",
                (session_id, metric_name, value,
                 json.dumps(context_data) if context_data else None),
            )

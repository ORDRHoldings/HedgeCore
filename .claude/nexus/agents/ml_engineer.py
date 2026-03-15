"""ML Engineer agent — learning loop tuning, weight calibration."""
import json
from .base import BaseAgent
from ..constants import RECOMMENDATION_WEIGHTS, RECOMMENDATION_AUTO_INJECT
from ..db.connection import transaction, readonly_connection


class MLEngineerAgent(BaseAgent):
    """Learning loop tuning, weight calibration, threshold optimization."""

    name = "ml-engineer"
    allowed_tools = ["Read", "Grep", "Glob", "Bash"]
    decision_authority = "Learning parameters and recommendation weights"
    tables_owned = ["effectiveness", "recommendations"]

    def execute(self, task: str, context: dict = None) -> dict:
        """Calibrate weights, tune thresholds."""
        context = context or {}
        session_id = context.get("session_id", "")

        task_lower = task.lower()
        if "calibrat" in task_lower or "weight" in task_lower:
            result = self._calibrate_weights(session_id)
        elif "threshold" in task_lower or "tune" in task_lower:
            result = self._tune_thresholds(session_id)
        elif "recommend" in task_lower:
            result = self._generate_recommendations(session_id, context)
        else:
            result = self._evaluate_effectiveness(session_id)

        self.log_activity(session_id, task, "success", confidence=result.get("confidence", 0.75))
        return result

    def _calibrate_weights(self, session_id: str) -> dict:
        """Calibrate recommendation scoring weights based on effectiveness data."""
        with readonly_connection() as conn:
            rows = conn.execute(
                "SELECT recommendation_id, accepted, outcome_quality "
                "FROM effectiveness ORDER BY evaluated_at DESC LIMIT 200"
            ).fetchall()

        if not rows:
            return {
                "status": "success",
                "result": {"message": "No effectiveness data yet", "weights": RECOMMENDATION_WEIGHTS},
                "confidence": 0.50,
                "files_touched": [],
            }

        # Compute acceptance rate and quality correlation
        total = len(rows)
        accepted = sum(1 for r in rows if r["accepted"])
        avg_quality = sum(r["outcome_quality"] or 0 for r in rows) / total

        acceptance_rate = accepted / total if total else 0
        adjustments = {}

        # If acceptance rate is low, boost context_match weight
        if acceptance_rate < 0.50:
            adjustments["context_match"] = min(RECOMMENDATION_WEIGHTS["context_match"] + 0.05, 0.40)
        # If quality is low, boost confidence weight
        if avg_quality < 0.60:
            adjustments["confidence"] = min(RECOMMENDATION_WEIGHTS["confidence"] + 0.05, 0.45)

        return {
            "status": "success",
            "result": {
                "current_weights": RECOMMENDATION_WEIGHTS,
                "adjustments": adjustments,
                "acceptance_rate": round(acceptance_rate, 3),
                "avg_quality": round(avg_quality, 3),
                "sample_size": total,
            },
            "confidence": 0.70 + (0.20 * min(total / 100, 1.0)),
            "files_touched": [],
        }

    def _tune_thresholds(self, session_id: str) -> dict:
        """Tune auto-inject and show thresholds based on recommendation outcomes."""
        with readonly_connection() as conn:
            rows = conn.execute(
                "SELECT r.score, e.accepted, e.outcome_quality "
                "FROM recommendations r "
                "LEFT JOIN effectiveness e ON r.id = e.recommendation_id "
                "WHERE e.id IS NOT NULL ORDER BY e.evaluated_at DESC LIMIT 100"
            ).fetchall()

        if not rows:
            return {
                "status": "success",
                "result": {"message": "No data for threshold tuning",
                           "auto_inject": RECOMMENDATION_AUTO_INJECT},
                "confidence": 0.50,
                "files_touched": [],
            }

        # Find optimal threshold where accepted + high quality
        good = [r for r in rows if r["accepted"] and (r["outcome_quality"] or 0) >= 0.70]
        if good:
            scores = [r["score"] for r in good]
            optimal_threshold = min(scores) if scores else RECOMMENDATION_AUTO_INJECT
        else:
            optimal_threshold = RECOMMENDATION_AUTO_INJECT

        return {
            "status": "success",
            "result": {
                "current_auto_inject": RECOMMENDATION_AUTO_INJECT,
                "recommended_auto_inject": round(optimal_threshold, 3),
                "sample_size": len(rows),
                "good_outcomes": len(good),
            },
            "confidence": 0.70,
            "files_touched": [],
        }

    def _generate_recommendations(self, session_id: str, context: dict) -> dict:
        """Generate recommendations based on patterns and history."""
        with readonly_connection() as conn:
            patterns = conn.execute(
                "SELECT id, pattern_type, description, confidence, evidence_count "
                "FROM patterns WHERE status IN ('promoted', 'canon') "
                "ORDER BY confidence DESC LIMIT 10"
            ).fetchall()

        recommendations = []
        for p in patterns:
            score = self._score_recommendation(p, context)
            if score >= 0.50:
                recommendations.append({
                    "pattern_id": p["id"],
                    "description": p["description"],
                    "score": round(score, 3),
                    "auto_inject": score >= RECOMMENDATION_AUTO_INJECT,
                })

        # Store recommendations
        with transaction() as conn:
            for rec in recommendations:
                conn.execute(
                    "INSERT INTO recommendations (session_id, pattern_id, score, auto_injected) "
                    "VALUES (?, ?, ?, ?)",
                    (session_id, rec["pattern_id"], rec["score"], rec["auto_inject"]),
                )

        return {
            "status": "success",
            "result": {"recommendations": recommendations},
            "confidence": 0.80,
            "files_touched": [],
        }

    def _score_recommendation(self, pattern: dict, context: dict) -> float:
        """Score a recommendation using weighted factors."""
        w = RECOMMENDATION_WEIGHTS
        confidence = pattern["confidence"] or 0.0
        evidence = min((pattern["evidence_count"] or 0) / 15, 1.0)
        recency = 0.5  # Default mid-range
        context_match = self._compute_context_match(pattern, context)
        effectiveness = 0.5  # Default mid-range

        score = (
            w["confidence"] * confidence
            + w["evidence"] * evidence
            + w["recency"] * recency
            + w["context_match"] * context_match
            + w["effectiveness"] * effectiveness
        )
        return min(score, 1.0)

    @staticmethod
    def _compute_context_match(pattern: dict, context: dict) -> float:
        """Compute how well a pattern matches the current context."""
        if not context:
            return 0.3
        desc = (pattern.get("description") or "").lower()
        task = context.get("task", "").lower()
        if not task:
            return 0.3
        # Simple keyword overlap
        pattern_words = set(desc.split())
        task_words = set(task.split())
        if not pattern_words:
            return 0.3
        overlap = len(pattern_words & task_words) / len(pattern_words)
        return min(overlap + 0.3, 1.0)

    def _evaluate_effectiveness(self, session_id: str) -> dict:
        """Evaluate overall system effectiveness."""
        with readonly_connection() as conn:
            rows = conn.execute(
                "SELECT accepted, outcome_quality FROM effectiveness "
                "ORDER BY evaluated_at DESC LIMIT 50"
            ).fetchall()

        if not rows:
            return {
                "status": "success",
                "result": {"message": "No effectiveness data"},
                "confidence": 0.50,
                "files_touched": [],
            }

        acceptance = sum(1 for r in rows if r["accepted"]) / len(rows)
        avg_quality = sum(r["outcome_quality"] or 0 for r in rows) / len(rows)

        return {
            "status": "success",
            "result": {
                "acceptance_rate": round(acceptance, 3),
                "avg_quality": round(avg_quality, 3),
                "sample_size": len(rows),
                "health": "good" if acceptance > 0.60 and avg_quality > 0.60 else "needs_tuning",
            },
            "confidence": 0.80,
            "files_touched": [],
        }

"""Recommendation scoring and lifecycle management."""
import json
from datetime import datetime, timezone, timedelta

from ..db.connection import transaction, readonly_connection
from ..constants import RECOMMENDATION_WEIGHTS, RECOMMENDATION_SHOW_THRESHOLD


def score_recommendation(pattern, context=None):
    """Compute a recommendation score for a pattern using weighted formula.

    score = 0.3*confidence + 0.2*evidence_norm + 0.1*recency
            + 0.25*context_match + 0.1*effectiveness - 0.05*rejection_rate

    Args:
        pattern: A dict or Row with keys: confidence, evidence_count, last_seen,
                 context (JSON string), id.
        context: Optional dict of current session context keywords for matching.

    Returns:
        Float score in approximately [0, 1].
    """
    w = RECOMMENDATION_WEIGHTS
    now = datetime.now(timezone.utc)

    # -- confidence component --
    confidence = float(pattern["confidence"])

    # -- evidence component (normalized: 20 = max) --
    evidence_norm = min(int(pattern["evidence_count"]) / 20.0, 1.0)

    # -- recency component --
    recency = _compute_recency(pattern["last_seen"], now)

    # -- context_match component --
    context_match = _compute_context_match(pattern["context"], context)

    # -- effectiveness component --
    effectiveness = _compute_effectiveness(pattern["id"]) if "id" in pattern.keys() else 0.0

    # -- rejection_rate component --
    rejection_rate = _compute_rejection_rate(pattern["id"]) if "id" in pattern.keys() else 0.0

    score = (
        w["confidence"] * confidence
        + w["evidence"] * evidence_norm
        + w["recency"] * recency
        + w["context_match"] * context_match
        + w["effectiveness"] * effectiveness
        - w["rejection_penalty"] * rejection_rate
    )

    return max(0.0, min(1.0, score))


def _compute_recency(last_seen_str, now):
    """Compute recency score: 1.0 if within 7 days, decays 0.1 per week."""
    if not last_seen_str:
        return 0.0
    try:
        last_seen = datetime.fromisoformat(last_seen_str)
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        delta_days = (now - last_seen).days
        weeks_old = delta_days / 7.0
        if weeks_old <= 1.0:
            return 1.0
        return max(0.0, 1.0 - 0.1 * (weeks_old - 1.0))
    except (ValueError, TypeError):
        return 0.0


def _compute_context_match(pattern_context_json, current_context):
    """Match pattern context keywords against current context.

    Both are expected to be dicts (or JSON strings). Matching is done by
    comparing shared keys with equal values.

    Args:
        pattern_context_json: JSON string or dict of the pattern's context.
        current_context: Dict of the current session context, or None.

    Returns:
        Float between 0 and 1 representing match ratio.
    """
    if not current_context:
        return 0.0

    if isinstance(pattern_context_json, str):
        try:
            pattern_ctx = json.loads(pattern_context_json)
        except (json.JSONDecodeError, TypeError):
            return 0.0
    elif isinstance(pattern_context_json, dict):
        pattern_ctx = pattern_context_json
    else:
        return 0.0

    if not isinstance(pattern_ctx, dict) or not isinstance(current_context, dict):
        return 0.0

    # Flatten both contexts to string values for comparison
    p_keys = set(pattern_ctx.keys())
    c_keys = set(current_context.keys())
    shared = p_keys & c_keys

    if not shared:
        return 0.0

    matches = sum(
        1 for k in shared
        if str(pattern_ctx.get(k, "")).lower() == str(current_context.get(k, "")).lower()
    )
    return matches / max(len(p_keys), 1)


def _compute_effectiveness(pattern_id):
    """Compute average effectiveness delta for recommendations linked to a pattern.

    Returns a value normalized to [0, 1] (assumes deltas range roughly -1 to +1).
    """
    try:
        with readonly_connection() as conn:
            row = conn.execute(
                "SELECT AVG(e.delta) AS avg_delta "
                "FROM effectiveness e "
                "JOIN recommendations r ON r.id = e.recommendation_id "
                "WHERE r.pattern_id = ?",
                (pattern_id,),
            ).fetchone()
            if row and row["avg_delta"] is not None:
                # Normalize: clamp raw delta to [-1, 1], then shift to [0, 1]
                raw = max(-1.0, min(1.0, float(row["avg_delta"])))
                return (raw + 1.0) / 2.0
    except Exception:
        pass
    return 0.0


def _compute_rejection_rate(pattern_id):
    """Compute rejection rate across all recommendations for a pattern."""
    try:
        with readonly_connection() as conn:
            row = conn.execute(
                "SELECT SUM(times_rejected) AS total_rejected, "
                "       SUM(times_shown) AS total_shown "
                "FROM recommendations WHERE pattern_id = ?",
                (pattern_id,),
            ).fetchone()
            if row and row["total_shown"] and int(row["total_shown"]) > 0:
                return int(row["total_rejected"] or 0) / int(row["total_shown"])
    except Exception:
        pass
    return 0.0


def generate_recommendations(session_context=None):
    """Scan promoted and canon patterns, create/update recommendation rows.

    Args:
        session_context: Optional dict of current context for scoring.

    Returns:
        List of dicts with recommendation details.
    """
    results = []
    now = datetime.now(timezone.utc).isoformat()

    with readonly_connection() as ro_conn:
        patterns = ro_conn.execute(
            "SELECT id, pattern_type, description, context, confidence, "
            "       evidence_count, last_seen "
            "FROM patterns "
            "WHERE status IN ('promoted', 'canon') AND status != 'deprecated'"
        ).fetchall()

    with transaction() as conn:
        for pattern in patterns:
            score = score_recommendation(pattern, context=session_context)

            if score < RECOMMENDATION_SHOW_THRESHOLD:
                continue

            # Determine priority from score
            if score >= 0.90:
                priority = "critical"
            elif score >= 0.80:
                priority = "high"
            elif score >= 0.70:
                priority = "medium"
            else:
                priority = "low"

            context_filter = json.dumps(session_context) if session_context else None

            # Check if recommendation already exists for this pattern
            existing = conn.execute(
                "SELECT id, score FROM recommendations WHERE pattern_id = ?",
                (pattern["id"],),
            ).fetchone()

            if existing:
                # Update score and priority
                conn.execute(
                    "UPDATE recommendations SET score = ?, priority = ?, "
                    "confidence = ?, context_filter = ? WHERE id = ?",
                    (score, priority, pattern["confidence"], context_filter, existing["id"]),
                )
                rec_id = existing["id"]
                action = "updated"
            else:
                # Create new recommendation
                cursor = conn.execute(
                    "INSERT INTO recommendations "
                    "(pattern_id, recommendation, priority, score, confidence, context_filter) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (pattern["id"], pattern["description"], priority, score,
                     pattern["confidence"], context_filter),
                )
                rec_id = cursor.lastrowid
                action = "created"

            results.append({
                "recommendation_id": rec_id,
                "pattern_id": pattern["id"],
                "action": action,
                "score": score,
                "priority": priority,
                "description": pattern["description"],
            })

    return results


def get_top_recommendations(limit=5, min_score=0.70):
    """Query top recommendations above a minimum score.

    Args:
        limit: Maximum number of recommendations to return.
        min_score: Minimum score threshold.

    Returns:
        List of recommendation Row objects.
    """
    try:
        with readonly_connection() as conn:
            rows = conn.execute(
                "SELECT r.id, r.pattern_id, r.recommendation, r.priority, r.score, "
                "       r.confidence, r.times_shown, r.times_applied, r.times_rejected, "
                "       r.effectiveness, r.context_filter, r.last_shown_at, r.created_at "
                "FROM recommendations r "
                "WHERE r.score >= ? "
                "ORDER BY r.score DESC "
                "LIMIT ?",
                (min_score, limit),
            ).fetchall()
            return [dict(row) for row in rows]
    except Exception:
        return []


def mark_recommendation_shown(rec_id):
    """Increment times_shown and update last_shown_at for a recommendation.

    Args:
        rec_id: The recommendation ID.
    """
    now = datetime.now(timezone.utc).isoformat()
    try:
        with transaction() as conn:
            conn.execute(
                "UPDATE recommendations SET times_shown = times_shown + 1, "
                "last_shown_at = ? WHERE id = ?",
                (now, rec_id),
            )
    except Exception as e:
        raise RuntimeError(f"Failed to mark recommendation shown: {e}") from e


def mark_recommendation_applied(rec_id):
    """Increment times_applied for a recommendation.

    Args:
        rec_id: The recommendation ID.
    """
    try:
        with transaction() as conn:
            conn.execute(
                "UPDATE recommendations SET times_applied = times_applied + 1 WHERE id = ?",
                (rec_id,),
            )
    except Exception as e:
        raise RuntimeError(f"Failed to mark recommendation applied: {e}") from e


def mark_recommendation_rejected(rec_id):
    """Increment times_rejected for a recommendation.

    Args:
        rec_id: The recommendation ID.
    """
    try:
        with transaction() as conn:
            conn.execute(
                "UPDATE recommendations SET times_rejected = times_rejected + 1 WHERE id = ?",
                (rec_id,),
            )
    except Exception as e:
        raise RuntimeError(f"Failed to mark recommendation rejected: {e}") from e

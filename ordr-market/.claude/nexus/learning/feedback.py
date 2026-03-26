"""User correction and feedback processing for the learning loop."""
import json
from datetime import datetime, timezone

from ..db.connection import transaction, readonly_connection


def record_feedback(session_id, feedback_type, context, correction=None, pattern_id=None):
    """Insert a feedback row into the feedback table.

    Args:
        session_id: The session this feedback belongs to.
        feedback_type: One of 'approve', 'reject', 'modify', 'correct'.
        context: Free-text or JSON describing the context of the feedback.
        correction: Optional text describing the correction (for modify/correct).
        pattern_id: Optional ID of the pattern this feedback relates to.

    Returns:
        The feedback_id of the inserted row.
    """
    try:
        with transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO feedback (session_id, feedback_type, context, correction, pattern_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, feedback_type, context, correction, pattern_id),
            )
            return cursor.lastrowid
    except Exception as e:
        raise RuntimeError(f"Failed to record feedback: {e}") from e


def process_feedback(feedback_id):
    """Analyze and apply a single feedback entry's impact on the learning system.

    Processing rules by feedback_type:
    - 'approve': boost linked pattern confidence by 0.05
    - 'reject': decrease confidence by 0.10, increment rejection on recommendations
    - 'modify': create a new pattern variant with the correction as description
    - 'correct': mark old pattern as deprecated, create corrected version

    Args:
        feedback_id: The feedback row to process.

    Returns:
        Dict describing what was done, or None if feedback not found.
    """
    try:
        with transaction() as conn:
            fb = conn.execute(
                "SELECT id, session_id, feedback_type, context, correction, "
                "       pattern_id, impact_on_learning "
                "FROM feedback WHERE id = ?",
                (feedback_id,),
            ).fetchone()

            if not fb:
                return None

            # Skip if already processed
            if fb["impact_on_learning"]:
                return {"feedback_id": feedback_id, "action": "already_processed"}

            result = {"feedback_id": feedback_id, "feedback_type": fb["feedback_type"]}
            now = datetime.now(timezone.utc).isoformat()

            if fb["feedback_type"] == "approve":
                result.update(_process_approve(conn, fb, now))

            elif fb["feedback_type"] == "reject":
                result.update(_process_reject(conn, fb, now))

            elif fb["feedback_type"] == "modify":
                result.update(_process_modify(conn, fb, now))

            elif fb["feedback_type"] == "correct":
                result.update(_process_correct(conn, fb, now))

            # Mark feedback as processed
            impact_summary = json.dumps(result)
            conn.execute(
                "UPDATE feedback SET impact_on_learning = ? WHERE id = ?",
                (impact_summary, feedback_id),
            )

            return result
    except Exception as e:
        raise RuntimeError(f"Failed to process feedback {feedback_id}: {e}") from e


def _process_approve(conn, fb, now):
    """Boost linked pattern confidence by 0.05."""
    if not fb["pattern_id"]:
        return {"action": "no_pattern_linked", "detail": "approve with no pattern_id"}

    pattern = conn.execute(
        "SELECT id, confidence FROM patterns WHERE id = ?",
        (fb["pattern_id"],),
    ).fetchone()

    if not pattern:
        return {"action": "pattern_not_found", "pattern_id": fb["pattern_id"]}

    new_confidence = min(0.99, float(pattern["confidence"]) + 0.05)
    conn.execute(
        "UPDATE patterns SET confidence = ?, last_seen = ? WHERE id = ?",
        (new_confidence, now, pattern["id"]),
    )

    return {
        "action": "confidence_boosted",
        "pattern_id": pattern["id"],
        "old_confidence": float(pattern["confidence"]),
        "new_confidence": new_confidence,
    }


def _process_reject(conn, fb, now):
    """Decrease pattern confidence by 0.10 and increment rejection on recommendations."""
    if not fb["pattern_id"]:
        return {"action": "no_pattern_linked", "detail": "reject with no pattern_id"}

    pattern = conn.execute(
        "SELECT id, confidence FROM patterns WHERE id = ?",
        (fb["pattern_id"],),
    ).fetchone()

    if not pattern:
        return {"action": "pattern_not_found", "pattern_id": fb["pattern_id"]}

    new_confidence = max(0.01, float(pattern["confidence"]) - 0.10)
    conn.execute(
        "UPDATE patterns SET confidence = ?, last_seen = ? WHERE id = ?",
        (new_confidence, now, pattern["id"]),
    )

    # Increment rejection count on associated recommendations
    recs_updated = conn.execute(
        "UPDATE recommendations SET times_rejected = times_rejected + 1 "
        "WHERE pattern_id = ?",
        (fb["pattern_id"],),
    ).rowcount

    return {
        "action": "confidence_decreased",
        "pattern_id": pattern["id"],
        "old_confidence": float(pattern["confidence"]),
        "new_confidence": new_confidence,
        "recommendations_rejected": recs_updated,
    }


def _process_modify(conn, fb, now):
    """Create a new pattern variant with the correction as description."""
    if not fb["correction"]:
        return {"action": "no_correction_provided", "detail": "modify requires correction text"}

    # Use parent pattern's metadata as base, or create fresh
    base_type = "good_practice"
    base_context = fb["context"]
    base_confidence = 0.5

    if fb["pattern_id"]:
        parent = conn.execute(
            "SELECT pattern_type, context, confidence FROM patterns WHERE id = ?",
            (fb["pattern_id"],),
        ).fetchone()
        if parent:
            base_type = parent["pattern_type"]
            base_context = parent["context"] or fb["context"]
            base_confidence = float(parent["confidence"])

    # Create variant pattern
    cursor = conn.execute(
        "INSERT INTO patterns "
        "(pattern_type, description, context, confidence, evidence_count, "
        " first_seen, last_seen, source_sessions, metadata) "
        "VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
        (base_type, fb["correction"], base_context, base_confidence,
         now, now, fb["session_id"],
         json.dumps({"variant_of": fb["pattern_id"], "feedback_id": fb["id"]})),
    )

    return {
        "action": "variant_created",
        "new_pattern_id": cursor.lastrowid,
        "parent_pattern_id": fb["pattern_id"],
        "description": fb["correction"],
    }


def _process_correct(conn, fb, now):
    """Mark old pattern as deprecated and create a corrected version."""
    if not fb["pattern_id"]:
        return {"action": "no_pattern_linked", "detail": "correct requires pattern_id"}
    if not fb["correction"]:
        return {"action": "no_correction_provided", "detail": "correct requires correction text"}

    old_pattern = conn.execute(
        "SELECT id, pattern_type, context, confidence, evidence_count FROM patterns WHERE id = ?",
        (fb["pattern_id"],),
    ).fetchone()

    if not old_pattern:
        return {"action": "pattern_not_found", "pattern_id": fb["pattern_id"]}

    # Deprecate old pattern
    conn.execute(
        "UPDATE patterns SET status = 'deprecated', metadata = ? WHERE id = ?",
        (json.dumps({
            "deprecated_reason": "corrected_by_feedback",
            "feedback_id": fb["id"],
            "deprecated_at": now,
        }), old_pattern["id"]),
    )

    # Create corrected pattern, inheriting evidence but resetting confidence
    cursor = conn.execute(
        "INSERT INTO patterns "
        "(pattern_type, description, context, confidence, evidence_count, "
        " first_seen, last_seen, source_sessions, metadata) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (old_pattern["pattern_type"], fb["correction"],
         old_pattern["context"], 0.5,
         max(1, int(old_pattern["evidence_count"]) // 2),
         now, now, fb["session_id"],
         json.dumps({"corrects": old_pattern["id"], "feedback_id": fb["id"]})),
    )

    return {
        "action": "pattern_corrected",
        "deprecated_pattern_id": old_pattern["id"],
        "new_pattern_id": cursor.lastrowid,
        "description": fb["correction"],
    }


def apply_feedback_to_learning(session_id):
    """Process all unprocessed feedback for a session.

    Args:
        session_id: Session whose feedback should be processed.

    Returns:
        List of processing results, one per feedback entry.
    """
    results = []

    try:
        with readonly_connection() as conn:
            unprocessed = conn.execute(
                "SELECT id FROM feedback "
                "WHERE session_id = ? AND impact_on_learning IS NULL "
                "ORDER BY id",
                (session_id,),
            ).fetchall()

        for row in unprocessed:
            result = process_feedback(row["id"])
            if result:
                results.append(result)
    except Exception as e:
        raise RuntimeError(f"Failed to apply feedback for session {session_id}: {e}") from e

    return results

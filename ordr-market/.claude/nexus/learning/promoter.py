"""Pattern lifecycle management: promotion, deprecation, merging."""
import json
from datetime import datetime, timezone

from ..db.connection import transaction, readonly_connection
from ..constants import PROMOTION_THRESHOLDS


def check_promotion_eligibility(pattern_id):
    """Check whether a pattern is eligible for promotion to the next status.

    Promotion path: observation -> candidate -> promoted -> canon.

    Args:
        pattern_id: The pattern to check.

    Returns:
        Tuple of (eligible: bool, target_status: str or None, reason: str).
    """
    try:
        with readonly_connection() as conn:
            pattern = conn.execute(
                "SELECT id, status, confidence, evidence_count "
                "FROM patterns WHERE id = ?",
                (pattern_id,),
            ).fetchone()

        if not pattern:
            return (False, None, f"Pattern {pattern_id} not found")

        status = pattern["status"]
        confidence = float(pattern["confidence"])
        evidence = int(pattern["evidence_count"])

        if status == "deprecated":
            return (False, None, "Deprecated patterns cannot be promoted")

        if status == "canon":
            return (False, None, "Pattern is already at canon status")

        # Determine target status
        promotion_map = {
            "observation": "candidate",
            "candidate": "promoted",
            "promoted": "canon",
        }
        target = promotion_map.get(status)

        if not target:
            return (False, None, f"Unknown status: {status}")

        thresholds = PROMOTION_THRESHOLDS[target]
        min_evidence = thresholds["min_evidence"]
        min_confidence = thresholds["min_confidence"]

        if evidence < min_evidence:
            return (
                False, target,
                f"Insufficient evidence: {evidence}/{min_evidence} "
                f"(confidence: {confidence:.2f}/{min_confidence:.2f})"
            )

        if confidence < min_confidence:
            return (
                False, target,
                f"Insufficient confidence: {confidence:.2f}/{min_confidence:.2f} "
                f"(evidence: {evidence}/{min_evidence})"
            )

        return (
            True, target,
            f"Eligible for {target}: evidence={evidence}>={min_evidence}, "
            f"confidence={confidence:.2f}>={min_confidence:.2f}"
        )
    except Exception as e:
        return (False, None, f"Error checking eligibility: {e}")


def promote_pattern(pattern_id, target_status):
    """Promote a pattern to a new status.

    Args:
        pattern_id: The pattern to promote.
        target_status: The new status to set.

    Returns:
        Dict with promotion details, or None on failure.
    """
    now = datetime.now(timezone.utc).isoformat()
    valid_targets = {"candidate", "promoted", "canon"}

    if target_status not in valid_targets:
        raise ValueError(f"Invalid target status: {target_status}")

    try:
        with transaction() as conn:
            pattern = conn.execute(
                "SELECT id, status, confidence, evidence_count, metadata "
                "FROM patterns WHERE id = ?",
                (pattern_id,),
            ).fetchone()

            if not pattern:
                return None

            old_status = pattern["status"]

            # Build promotion chain in metadata
            meta = {}
            if pattern["metadata"]:
                try:
                    meta = json.loads(pattern["metadata"])
                except (json.JSONDecodeError, TypeError):
                    meta = {}

            chain = meta.get("promotion_chain", [])
            chain.append({
                "from": old_status,
                "to": target_status,
                "at": now,
                "confidence": float(pattern["confidence"]),
                "evidence": int(pattern["evidence_count"]),
            })
            meta["promotion_chain"] = chain

            conn.execute(
                "UPDATE patterns SET status = ?, promoted_at = ?, metadata = ? WHERE id = ?",
                (target_status, now, json.dumps(meta), pattern_id),
            )

            return {
                "pattern_id": pattern_id,
                "old_status": old_status,
                "new_status": target_status,
                "promoted_at": now,
                "confidence": float(pattern["confidence"]),
                "evidence_count": int(pattern["evidence_count"]),
            }
    except Exception as e:
        raise RuntimeError(f"Failed to promote pattern {pattern_id}: {e}") from e


def promote_all_eligible():
    """Scan all patterns and promote any that meet their next threshold.

    Returns:
        List of promotion result dicts.
    """
    promotions = []

    try:
        with readonly_connection() as conn:
            patterns = conn.execute(
                "SELECT id FROM patterns "
                "WHERE status IN ('observation', 'candidate', 'promoted') "
                "ORDER BY confidence DESC"
            ).fetchall()

        for row in patterns:
            eligible, target, reason = check_promotion_eligibility(row["id"])
            if eligible and target:
                result = promote_pattern(row["id"], target)
                if result:
                    result["reason"] = reason
                    promotions.append(result)
    except Exception as e:
        raise RuntimeError(f"Failed to promote eligible patterns: {e}") from e

    return promotions


def deprecate_pattern(pattern_id, reason):
    """Set a pattern's status to deprecated.

    Args:
        pattern_id: The pattern to deprecate.
        reason: Human-readable reason for deprecation.

    Returns:
        Dict with deprecation details, or None if pattern not found.
    """
    now = datetime.now(timezone.utc).isoformat()

    try:
        with transaction() as conn:
            pattern = conn.execute(
                "SELECT id, status, metadata FROM patterns WHERE id = ?",
                (pattern_id,),
            ).fetchone()

            if not pattern:
                return None

            old_status = pattern["status"]

            meta = {}
            if pattern["metadata"]:
                try:
                    meta = json.loads(pattern["metadata"])
                except (json.JSONDecodeError, TypeError):
                    meta = {}

            meta["deprecated_reason"] = reason
            meta["deprecated_at"] = now
            meta["deprecated_from"] = old_status

            conn.execute(
                "UPDATE patterns SET status = 'deprecated', metadata = ? WHERE id = ?",
                (json.dumps(meta), pattern_id),
            )

            return {
                "pattern_id": pattern_id,
                "old_status": old_status,
                "new_status": "deprecated",
                "reason": reason,
                "deprecated_at": now,
            }
    except Exception as e:
        raise RuntimeError(f"Failed to deprecate pattern {pattern_id}: {e}") from e


def get_pattern_lifecycle(pattern_id):
    """Return the full history of a pattern: creation, evidence updates, promotions.

    Args:
        pattern_id: The pattern to trace.

    Returns:
        Dict with pattern details and lifecycle events, or None if not found.
    """
    try:
        with readonly_connection() as conn:
            pattern = conn.execute(
                "SELECT id, pattern_type, description, context, confidence, "
                "       evidence_count, status, first_seen, last_seen, "
                "       promoted_at, source_sessions, metadata "
                "FROM patterns WHERE id = ?",
                (pattern_id,),
            ).fetchone()

            if not pattern:
                return None

            lifecycle = {
                "pattern_id": pattern["id"],
                "pattern_type": pattern["pattern_type"],
                "description": pattern["description"],
                "current_status": pattern["status"],
                "confidence": float(pattern["confidence"]),
                "evidence_count": int(pattern["evidence_count"]),
                "first_seen": pattern["first_seen"],
                "last_seen": pattern["last_seen"],
                "promoted_at": pattern["promoted_at"],
                "events": [],
            }

            # Add creation event
            lifecycle["events"].append({
                "type": "created",
                "at": pattern["first_seen"],
                "status": "observation",
            })

            # Extract promotion chain from metadata
            meta = {}
            if pattern["metadata"]:
                try:
                    meta = json.loads(pattern["metadata"])
                except (json.JSONDecodeError, TypeError):
                    meta = {}

            for entry in meta.get("promotion_chain", []):
                lifecycle["events"].append({
                    "type": "promoted",
                    "at": entry.get("at"),
                    "from": entry.get("from"),
                    "to": entry.get("to"),
                    "confidence": entry.get("confidence"),
                    "evidence": entry.get("evidence"),
                })

            # Check for deprecation
            if pattern["status"] == "deprecated":
                lifecycle["events"].append({
                    "type": "deprecated",
                    "at": meta.get("deprecated_at"),
                    "reason": meta.get("deprecated_reason"),
                    "from": meta.get("deprecated_from"),
                })

            # Source sessions
            source_str = pattern["source_sessions"] or ""
            lifecycle["source_sessions"] = [s for s in source_str.split(",") if s]

            # Linked feedback
            feedback_rows = conn.execute(
                "SELECT id, feedback_type, context, impact_on_learning, created_at "
                "FROM feedback WHERE pattern_id = ? ORDER BY created_at",
                (pattern_id,),
            ).fetchall()

            lifecycle["feedback"] = [
                {
                    "feedback_id": f["id"],
                    "type": f["feedback_type"],
                    "context": f["context"],
                    "processed": f["impact_on_learning"] is not None,
                    "at": f["created_at"],
                }
                for f in feedback_rows
            ]

            # Linked recommendations
            rec_rows = conn.execute(
                "SELECT id, score, times_shown, times_applied, times_rejected, "
                "       effectiveness, created_at "
                "FROM recommendations WHERE pattern_id = ? ORDER BY created_at",
                (pattern_id,),
            ).fetchall()

            lifecycle["recommendations"] = [
                {
                    "rec_id": r["id"],
                    "score": float(r["score"]),
                    "shown": int(r["times_shown"]),
                    "applied": int(r["times_applied"]),
                    "rejected": int(r["times_rejected"]),
                    "effectiveness": float(r["effectiveness"]) if r["effectiveness"] else None,
                    "at": r["created_at"],
                }
                for r in rec_rows
            ]

            return lifecycle
    except Exception as e:
        raise RuntimeError(f"Failed to get lifecycle for pattern {pattern_id}: {e}") from e


def merge_similar_patterns(pattern_ids, keep_id):
    """Merge evidence from multiple similar patterns into one.

    The pattern identified by keep_id is retained and updated with combined
    evidence. All other patterns in pattern_ids are deprecated.

    Args:
        pattern_ids: List of pattern IDs to merge.
        keep_id: The pattern ID to keep (must be in pattern_ids).

    Returns:
        Dict with merge results.
    """
    if keep_id not in pattern_ids:
        raise ValueError(f"keep_id {keep_id} must be in pattern_ids")

    merge_ids = [pid for pid in pattern_ids if pid != keep_id]
    if not merge_ids:
        return {"action": "nothing_to_merge", "keep_id": keep_id}

    now = datetime.now(timezone.utc).isoformat()

    try:
        with transaction() as conn:
            # Fetch the keeper pattern
            keeper = conn.execute(
                "SELECT id, confidence, evidence_count, source_sessions, metadata "
                "FROM patterns WHERE id = ?",
                (keep_id,),
            ).fetchone()

            if not keeper:
                raise ValueError(f"Keep pattern {keep_id} not found")

            total_evidence = int(keeper["evidence_count"])
            max_confidence = float(keeper["confidence"])
            all_sessions = set(
                s for s in (keeper["source_sessions"] or "").split(",") if s
            )

            merged_from = []

            for mid in merge_ids:
                merging = conn.execute(
                    "SELECT id, confidence, evidence_count, source_sessions, description "
                    "FROM patterns WHERE id = ?",
                    (mid,),
                ).fetchone()

                if not merging:
                    continue

                total_evidence += int(merging["evidence_count"])
                max_confidence = max(max_confidence, float(merging["confidence"]))
                merge_sessions = set(
                    s for s in (merging["source_sessions"] or "").split(",") if s
                )
                all_sessions |= merge_sessions

                merged_from.append({
                    "id": mid,
                    "description": merging["description"],
                    "evidence": int(merging["evidence_count"]),
                    "confidence": float(merging["confidence"]),
                })

                # Deprecate the merged pattern
                merge_meta = {}
                if merging.get("metadata"):
                    try:
                        merge_meta = json.loads(merging["metadata"])
                    except (json.JSONDecodeError, TypeError):
                        merge_meta = {}

                merge_meta["deprecated_reason"] = f"merged_into_{keep_id}"
                merge_meta["deprecated_at"] = now
                merge_meta["merged_into"] = keep_id

                conn.execute(
                    "UPDATE patterns SET status = 'deprecated', metadata = ? WHERE id = ?",
                    (json.dumps(merge_meta), mid),
                )

                # Re-point any recommendations from merged pattern to keeper
                conn.execute(
                    "UPDATE recommendations SET pattern_id = ? WHERE pattern_id = ?",
                    (keep_id, mid),
                )

                # Re-point any feedback from merged pattern to keeper
                conn.execute(
                    "UPDATE feedback SET pattern_id = ? WHERE pattern_id = ?",
                    (keep_id, mid),
                )

            # Update the keeper pattern
            keeper_meta = {}
            if keeper["metadata"]:
                try:
                    keeper_meta = json.loads(keeper["metadata"])
                except (json.JSONDecodeError, TypeError):
                    keeper_meta = {}

            keeper_meta["merged_patterns"] = merged_from
            keeper_meta["merge_date"] = now

            conn.execute(
                "UPDATE patterns SET evidence_count = ?, confidence = ?, "
                "source_sessions = ?, last_seen = ?, metadata = ? WHERE id = ?",
                (total_evidence, max_confidence, ",".join(sorted(all_sessions)),
                 now, json.dumps(keeper_meta), keep_id),
            )

            return {
                "action": "merged",
                "keep_id": keep_id,
                "merged_ids": [m["id"] for m in merged_from],
                "total_evidence": total_evidence,
                "final_confidence": max_confidence,
                "source_sessions_count": len(all_sessions),
            }
    except Exception as e:
        raise RuntimeError(f"Failed to merge patterns: {e}") from e

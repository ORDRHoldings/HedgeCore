"""Bayesian pattern extraction from action-outcome pairs."""
import json
from collections import defaultdict
from datetime import datetime, timezone

from ..db.connection import transaction, readonly_connection


def bayesian_update(prior, likelihood, dampening=0.9):
    """Pure Bayesian confidence update with dampening.

    Args:
        prior: Current confidence (0-1).
        likelihood: Strength of new evidence (0-1).
        dampening: Factor to prevent extreme values (default 0.9).

    Returns:
        Updated confidence, clamped to [0.01, 0.99].
    """
    numerator = prior * likelihood
    denominator = numerator + ((1 - prior) * (1 - likelihood))

    # Avoid division by zero when both prior and likelihood are 0 or 1
    if denominator == 0:
        raw = prior
    else:
        raw = numerator / denominator

    # Apply dampening: pull toward 0.5 by dampening factor
    dampened = 0.5 + dampening * (raw - 0.5)

    # Clamp to avoid degenerate extremes
    return max(0.01, min(0.99, dampened))


def extract_action_outcome_pairs(conn, session_id):
    """Get matched action-outcome pairs for a session.

    Args:
        conn: Database connection (read-only is fine).
        session_id: Session to extract pairs from.

    Returns:
        List of dicts with action and outcome data merged.
    """
    rows = conn.execute(
        "SELECT a.id AS action_id, a.agent, a.action_type, a.tool, a.target, "
        "       a.description AS action_desc, a.metadata AS action_meta, "
        "       o.id AS outcome_id, o.outcome_type, o.details AS outcome_details, "
        "       o.measured_at "
        "FROM actions a "
        "JOIN outcomes o ON o.action_id = a.id "
        "WHERE a.session_id = ? "
        "ORDER BY a.id",
        (session_id,),
    ).fetchall()

    pairs = []
    for row in rows:
        pairs.append({
            "action_id": row["action_id"],
            "agent": row["agent"],
            "action_type": row["action_type"],
            "tool": row["tool"],
            "target": row["target"],
            "action_desc": row["action_desc"],
            "action_meta": row["action_meta"],
            "outcome_id": row["outcome_id"],
            "outcome_type": row["outcome_type"],
            "outcome_details": row["outcome_details"],
            "measured_at": row["measured_at"],
        })
    return pairs


def _classify_outcome(outcome_type):
    """Classify an outcome_type as success or failure."""
    successes = {"test_pass", "user_accepted", "build_success"}
    failures = {"test_fail", "user_rejected", "regression", "security_issue", "build_fail"}
    if outcome_type in successes:
        return "success"
    if outcome_type in failures:
        return "failure"
    return "neutral"


def _group_key(pair):
    """Build a grouping key from action type, tool, and target."""
    return (pair["action_type"], pair["tool"] or "", pair["target"] or "")


def analyze_session(session_id):
    """Extract patterns from action-outcome pairs in a session.

    Groups actions by type+tool+target, then:
    - Repeated successes become good_practice patterns.
    - Repeated failures become anti_pattern patterns.
    - Correlated success sequences become correlation patterns.

    For each discovered pattern, either updates an existing pattern
    (incrementing evidence_count and updating confidence via Bayesian update)
    or creates a new one.

    Args:
        session_id: Session to analyze.

    Returns:
        List of dicts describing discovered/updated patterns.
    """
    discovered = []

    with readonly_connection() as ro_conn:
        pairs = extract_action_outcome_pairs(ro_conn, session_id)

    if not pairs:
        return discovered

    # Group by action signature
    groups = defaultdict(list)
    for pair in pairs:
        key = _group_key(pair)
        groups[key].append(pair)

    now = datetime.now(timezone.utc).isoformat()

    with transaction() as conn:
        for (action_type, tool, target), group_pairs in groups.items():
            classifications = [_classify_outcome(p["outcome_type"]) for p in group_pairs]
            success_count = classifications.count("success")
            failure_count = classifications.count("failure")
            total = len(group_pairs)

            if total < 2:
                # Need at least 2 observations to form a pattern
                continue

            # Determine pattern type and likelihood
            if success_count >= 2 and success_count > failure_count:
                pattern_type = "good_practice"
                likelihood = success_count / total
                desc = (
                    f"Repeated success: {action_type} with {tool} on {target} "
                    f"({success_count}/{total} successful)"
                )
            elif failure_count >= 2 and failure_count > success_count:
                pattern_type = "anti_pattern"
                likelihood = failure_count / total
                desc = (
                    f"Repeated failure: {action_type} with {tool} on {target} "
                    f"({failure_count}/{total} failed)"
                )
            else:
                continue

            context_data = json.dumps({
                "action_type": action_type,
                "tool": tool,
                "target": target,
            })

            # Check for existing pattern with same signature
            existing = conn.execute(
                "SELECT id, confidence, evidence_count, source_sessions "
                "FROM patterns "
                "WHERE pattern_type = ? AND context = ? AND status != 'deprecated'",
                (pattern_type, context_data),
            ).fetchone()

            if existing:
                # Update existing pattern
                new_confidence = bayesian_update(existing["confidence"], likelihood)
                new_evidence = existing["evidence_count"] + total

                # Track source sessions
                source = existing["source_sessions"] or ""
                sessions_list = [s for s in source.split(",") if s]
                if session_id not in sessions_list:
                    sessions_list.append(session_id)
                new_sources = ",".join(sessions_list)

                conn.execute(
                    "UPDATE patterns SET confidence = ?, evidence_count = ?, "
                    "last_seen = ?, source_sessions = ? WHERE id = ?",
                    (new_confidence, new_evidence, now, new_sources, existing["id"]),
                )

                discovered.append({
                    "pattern_id": existing["id"],
                    "action": "updated",
                    "pattern_type": pattern_type,
                    "confidence": new_confidence,
                    "evidence_count": new_evidence,
                    "description": desc,
                })
            else:
                # Create new pattern
                initial_confidence = bayesian_update(0.5, likelihood)
                cursor = conn.execute(
                    "INSERT INTO patterns "
                    "(pattern_type, description, context, confidence, evidence_count, "
                    " first_seen, last_seen, source_sessions) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (pattern_type, desc, context_data, initial_confidence, total,
                     now, now, session_id),
                )

                discovered.append({
                    "pattern_id": cursor.lastrowid,
                    "action": "created",
                    "pattern_type": pattern_type,
                    "confidence": initial_confidence,
                    "evidence_count": total,
                    "description": desc,
                })

        # Look for correlations: sequential successes with different tools/targets
        success_pairs = [p for p in pairs if _classify_outcome(p["outcome_type"]) == "success"]
        if len(success_pairs) >= 2:
            for i in range(len(success_pairs) - 1):
                a, b = success_pairs[i], success_pairs[i + 1]
                if _group_key(a) != _group_key(b):
                    corr_context = json.dumps({
                        "first": {"action_type": a["action_type"], "tool": a["tool"], "target": a["target"]},
                        "second": {"action_type": b["action_type"], "tool": b["tool"], "target": b["target"]},
                    })
                    corr_desc = (
                        f"Correlated success: {a['action_type']}({a['tool']}) "
                        f"followed by {b['action_type']}({b['tool']})"
                    )

                    existing_corr = conn.execute(
                        "SELECT id, confidence, evidence_count, source_sessions "
                        "FROM patterns "
                        "WHERE pattern_type = 'correlation' AND context = ? AND status != 'deprecated'",
                        (corr_context,),
                    ).fetchone()

                    if existing_corr:
                        new_conf = bayesian_update(existing_corr["confidence"], 0.7)
                        new_ev = existing_corr["evidence_count"] + 1
                        src = existing_corr["source_sessions"] or ""
                        s_list = [s for s in src.split(",") if s]
                        if session_id not in s_list:
                            s_list.append(session_id)

                        conn.execute(
                            "UPDATE patterns SET confidence = ?, evidence_count = ?, "
                            "last_seen = ?, source_sessions = ? WHERE id = ?",
                            (new_conf, new_ev, now, ",".join(s_list), existing_corr["id"]),
                        )
                        discovered.append({
                            "pattern_id": existing_corr["id"],
                            "action": "updated",
                            "pattern_type": "correlation",
                            "confidence": new_conf,
                            "evidence_count": new_ev,
                            "description": corr_desc,
                        })
                    else:
                        init_conf = bayesian_update(0.5, 0.7)
                        cursor = conn.execute(
                            "INSERT INTO patterns "
                            "(pattern_type, description, context, confidence, evidence_count, "
                            " first_seen, last_seen, source_sessions) "
                            "VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
                            ("correlation", corr_desc, corr_context, init_conf,
                             now, now, session_id),
                        )
                        discovered.append({
                            "pattern_id": cursor.lastrowid,
                            "action": "created",
                            "pattern_type": "correlation",
                            "confidence": init_conf,
                            "evidence_count": 1,
                            "description": corr_desc,
                        })

        # Update session patterns_found count
        conn.execute(
            "UPDATE sessions SET patterns_found = ? WHERE id = ?",
            (len(discovered), session_id),
        )

    return discovered

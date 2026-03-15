#!/usr/bin/env python3
"""NEXUS Hook: PostToolUse (Edit|Write|Bash) — record action, update chain, KG, file_facts."""
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Fix Windows encoding
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent paths for imports
_hook_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_hook_dir.parent.parent))  # .claude/

# Map tool names to action types
TOOL_ACTION_MAP = {
    "Edit": "file_edit",
    "Write": "file_create",
    "Bash": "command",
}


def _extract_target(tool_name: str, tool_params: dict) -> str:
    """Extract target file path or command from tool input."""
    if tool_name in ("Edit", "Write"):
        return tool_params.get("file_path", "") or tool_params.get("path", "")
    elif tool_name == "Bash":
        cmd = tool_params.get("command", "")
        # Truncate long commands
        return cmd[:200] if len(cmd) > 200 else cmd
    return ""


def _ensure_kg_entity(conn, entity_type: str, name: str) -> int:
    """Ensure a KG entity exists and return its ID."""
    row = conn.execute(
        "SELECT id FROM kg_entities WHERE entity_type = ? AND name = ?",
        (entity_type, name),
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE kg_entities SET updated_at = datetime('now') WHERE id = ?",
            (row["id"],),
        )
        return row["id"]
    else:
        cursor = conn.execute(
            "INSERT INTO kg_entities (entity_type, name) VALUES (?, ?)",
            (entity_type, name),
        )
        return cursor.lastrowid


def _ensure_kg_edge(conn, source_id: int, target_id: int, relation: str):
    """Ensure a KG edge exists between source and target."""
    existing = conn.execute(
        "SELECT id FROM kg_edges WHERE source_id = ? AND target_id = ? AND relation = ?",
        (source_id, target_id, relation),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE kg_edges SET weight = weight + 0.1 WHERE id = ?",
            (existing["id"],),
        )
    else:
        conn.execute(
            "INSERT INTO kg_edges (source_id, target_id, relation) VALUES (?, ?, ?)",
            (source_id, target_id, relation),
        )


try:
    # Read tool input from stdin
    tool_input_raw = sys.stdin.read()
    if not tool_input_raw.strip():
        sys.exit(0)

    tool_input = json.loads(tool_input_raw)
    tool_name = tool_input.get("tool_name", "")
    tool_params = tool_input.get("tool_input", {})
    tool_result = tool_input.get("tool_result", "")

    action_type = TOOL_ACTION_MAP.get(tool_name, "unknown")
    target = _extract_target(tool_name, tool_params)

    from nexus.db.connection import transaction
    from nexus.security.hash_chain import append_to_chain

    with transaction() as conn:
        # ── Find active session ───────────────────────────────────────
        session_row = conn.execute(
            "SELECT id FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()

        if not session_row:
            # No active session — skip recording
            sys.exit(0)

        session_id = session_row["id"]

        # ── Record action ─────────────────────────────────────────────
        description = ""
        if tool_name == "Edit":
            old = tool_params.get("old_string", "")[:80]
            description = f"Edited: {old}..."
        elif tool_name == "Write":
            description = f"Wrote file: {target}"
        elif tool_name == "Bash":
            description = f"Ran: {target[:100]}"

        # Determine acting agent (default to 'coder' for file ops, 'commander' for bash)
        agent = "coder" if tool_name in ("Edit", "Write") else "commander"

        metadata = json.dumps({
            "tool": tool_name,
            "target": target,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Add chain entry
        chain_seq = append_to_chain(
            conn, f"action_{action_type}",
            json.dumps({"tool": tool_name, "target": target, "session_id": session_id}),
            session_id,
        )

        # Insert action
        conn.execute(
            "INSERT INTO actions (session_id, agent, action_type, tool, target, description, metadata, chain_seq) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, agent, action_type, tool_name, target, description, metadata, chain_seq),
        )

        # Update session counters
        conn.execute(
            "UPDATE sessions SET actions_count = actions_count + 1 WHERE id = ?",
            (session_id,),
        )

        # ── Update file_facts for file operations ─────────────────────
        if tool_name in ("Edit", "Write") and target:
            existing_ff = conn.execute(
                "SELECT id FROM file_facts WHERE file_path = ?", (target,)
            ).fetchone()

            if existing_ff:
                conn.execute(
                    "UPDATE file_facts SET last_modified = datetime('now') WHERE id = ?",
                    (existing_ff["id"],),
                )
            else:
                conn.execute(
                    "INSERT INTO file_facts (file_path, owner_agent, last_modified) "
                    "VALUES (?, ?, datetime('now'))",
                    (target, agent),
                )

            # Update files_touched counter on session
            file_count = conn.execute(
                "SELECT COUNT(DISTINCT target) as cnt FROM actions "
                "WHERE session_id = ? AND target IS NOT NULL AND action_type IN ('file_edit','file_create')",
                (session_id,),
            ).fetchone()["cnt"]

            conn.execute(
                "UPDATE sessions SET files_touched = ? WHERE id = ?",
                (file_count, session_id),
            )

        # ── Update Knowledge Graph ────────────────────────────────────
        if tool_name in ("Edit", "Write") and target:
            file_entity_id = _ensure_kg_entity(conn, "file", target)
            agent_entity_id = _ensure_kg_entity(conn, "agent", agent)
            _ensure_kg_edge(conn, agent_entity_id, file_entity_id, "modifies")

except json.JSONDecodeError:
    pass
except Exception as e:
    # Never crash
    print(f"[NEXUS PostToolCapture] Error: {e}", file=sys.stderr)

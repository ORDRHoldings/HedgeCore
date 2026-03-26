"""Action and outcome recording for the NEXUS learning loop."""
import json
from datetime import datetime, timezone

from ..db.connection import transaction


def capture_action(session_id, agent, action_type, tool, target, description, metadata=None):
    """Record an action to the actions table.

    Args:
        session_id: The session this action belongs to.
        agent: Name of the agent performing the action.
        action_type: Category of action (e.g. 'file_edit', 'command', 'review').
        tool: Tool used (e.g. 'Edit', 'Bash', 'Read').
        target: Target of the action (e.g. file path, command string).
        description: Human-readable description of what was done.
        metadata: Optional dict of extra metadata.

    Returns:
        The action_id of the inserted row.
    """
    meta_json = json.dumps(metadata) if metadata else None
    try:
        with transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO actions (session_id, agent, action_type, tool, target, description, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (session_id, agent, action_type, tool, target, description, meta_json),
            )
            action_id = cursor.lastrowid

            # Increment actions_count on the session
            conn.execute(
                "UPDATE sessions SET actions_count = actions_count + 1 WHERE id = ?",
                (session_id,),
            )
            return action_id
    except Exception as e:
        raise RuntimeError(f"Failed to capture action: {e}") from e


def record_outcome(action_id, outcome_type, details=None):
    """Record an outcome for a previously captured action.

    Args:
        action_id: The action this outcome belongs to.
        outcome_type: One of test_pass, test_fail, user_accepted, user_rejected,
                      regression, security_issue, build_success, build_fail.
        details: Optional free-text details about the outcome.

    Returns:
        The outcome_id of the inserted row.
    """
    try:
        with transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO outcomes (action_id, outcome_type, details) VALUES (?, ?, ?)",
                (action_id, outcome_type, details),
            )
            return cursor.lastrowid
    except Exception as e:
        raise RuntimeError(f"Failed to record outcome: {e}") from e


def capture_file_edit(session_id, agent, file_path, description):
    """Convenience wrapper: capture a file-edit action.

    Args:
        session_id: The session this edit belongs to.
        agent: Name of the agent performing the edit.
        file_path: Path of the file being edited.
        description: What was changed and why.

    Returns:
        The action_id of the inserted row.
    """
    return capture_action(
        session_id=session_id,
        agent=agent,
        action_type="file_edit",
        tool="Edit",
        target=file_path,
        description=description,
    )


def capture_command(session_id, agent, command, description):
    """Convenience wrapper: capture a shell command action.

    Args:
        session_id: The session this command belongs to.
        agent: Name of the agent running the command.
        command: The command string that was executed.
        description: What the command does and why it was run.

    Returns:
        The action_id of the inserted row.
    """
    return capture_action(
        session_id=session_id,
        agent=agent,
        action_type="command",
        tool="Bash",
        target=command,
        description=description,
    )

"""Coder agent — write code, tests, docs."""
import json
from .base import BaseAgent
from ..db.connection import transaction, readonly_connection


class CoderAgent(BaseAgent):
    """Write code, tests, docs within approved architectural patterns."""

    name = "coder"
    allowed_tools = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"]
    decision_authority = "Implementation within approved patterns"
    tables_owned = ["actions", "file_facts"]

    def execute(self, task: str, context: dict = None) -> dict:
        """Record file edits, update file_facts."""
        context = context or {}
        session_id = context.get("session_id", "")
        files_touched = context.get("files", [])
        action_type = context.get("action_type", "file_edit")

        # Record the action
        self._record_action(session_id, action_type, task, files_touched)

        # Update file_facts for touched files
        for fpath in files_touched:
            self._update_file_facts(session_id, fpath, context)

        self.log_activity(session_id, task, "success",
                         confidence=0.85, files_touched=files_touched)

        return {
            "status": "success",
            "result": f"Completed: {task}",
            "confidence": 0.85,
            "files_touched": files_touched,
        }

    def _record_action(self, session_id: str, action_type: str,
                       description: str, files: list):
        """Record a coding action in the actions table."""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO actions (session_id, action_type, agent, description, "
                "file_path, diff_summary) VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, action_type, self.name, description,
                 json.dumps(files), None),
            )

    def _update_file_facts(self, session_id: str, file_path: str, context: dict):
        """Update or insert file_facts for a given file."""
        language = context.get("language", self._detect_language(file_path))
        purpose = context.get("purpose", "")
        with transaction() as conn:
            existing = conn.execute(
                "SELECT id FROM file_facts WHERE file_path = ?", (file_path,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE file_facts SET last_agent = ?, last_session = ?, "
                    "language = COALESCE(?, language), purpose = COALESCE(NULLIF(?, ''), purpose) "
                    "WHERE file_path = ?",
                    (self.name, session_id, language, purpose, file_path),
                )
            else:
                conn.execute(
                    "INSERT INTO file_facts (file_path, language, purpose, last_agent, last_session) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (file_path, language, purpose, self.name, session_id),
                )

    @staticmethod
    def _detect_language(file_path: str) -> str:
        """Detect programming language from file extension."""
        ext_map = {
            ".py": "python", ".js": "javascript", ".ts": "typescript",
            ".tsx": "tsx", ".jsx": "jsx", ".rs": "rust", ".go": "go",
            ".sql": "sql", ".md": "markdown", ".json": "json",
            ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
            ".html": "html", ".css": "css", ".sh": "shell",
        }
        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "unknown"

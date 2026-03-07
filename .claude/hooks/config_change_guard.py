#!/usr/bin/env python3
"""Config change guard — warns when editing configuration files."""
import json
import sys
import os

CONFIG_PATTERNS = [
    "CLAUDE.md",
    ".claude/settings",
    ".claude/rules/",
    ".claude/hooks/",
    ".claude/agents/",
    ".github/workflows/",
    ".pre-commit-config",
    ".gitleaks.toml",
]


def main():
    try:
        data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    if tool_name not in ("Edit", "Write"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    normalized = file_path.replace("\\", "/")

    for pattern in CONFIG_PATTERNS:
        if pattern in normalized:
            print(f"CONFIG GUARD: Editing configuration file: {os.path.basename(file_path)}")
            print(f"Pattern matched: {pattern}")
            print("Configuration changes affect project-wide behavior.")
            print("Ensure this change is intentional and reviewed.")
            # Exit 0 = allow but warn (not blocking)
            sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()

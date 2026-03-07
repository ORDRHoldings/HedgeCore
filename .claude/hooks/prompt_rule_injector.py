#!/usr/bin/env python3
"""UserPromptSubmit hook: detects intent from prompt and injects relevant rules.

Lean injection: max 1 rule, max 20 lines, word-boundary matching to reduce false positives.
"""
import json
import sys
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULES_DIR = os.path.join(REPO, ".claude", "rules")

# keyword -> rule file mapping (word-boundary matched)
RULE_MAP = {
    "backend": "backend.md",
    "route": "backend.md",
    "endpoint": "backend.md",
    "fastapi": "backend.md",
    "sqlalchemy": "backend.md",
    "migration": "backend.md",
    "frontend": "frontend.md",
    "widget": "frontend.md",
    "dashboard": "frontend.md",
    "sidebar": "frontend.md",
    "test": "testing.md",
    "pytest": "testing.md",
    "coverage": "testing.md",
    "security": "security.md",
    "auth": "security.md",
    "jwt": "security.md",
    "rbac": "security.md",
    "csrf": "security.md",
    "deploy": "releases.md",
    "release": "releases.md",
    "merge": "releases.md",
    "freeze": "architecture.md",
    "adr": "architecture.md",
    "engine": "architecture.md",
    "worm": "architecture.md",
    "kernel": "architecture.md",
}


def main():
    try:
        data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    prompt = data.get("user_prompt", "").lower()
    if not prompt or len(prompt) < 5:
        sys.exit(0)

    # Word-boundary matching to reduce false positives
    matched = set()
    for keyword, rule_file in RULE_MAP.items():
        if re.search(r'\b' + re.escape(keyword) + r'\b', prompt):
            matched.add(rule_file)

    if not matched:
        sys.exit(0)

    # Load only the MOST relevant rule (max 1, max 20 lines)
    rule_file = sorted(matched)[0]
    path = os.path.join(RULES_DIR, rule_file)
    if not os.path.exists(path):
        sys.exit(0)

    with open(path, "r") as f:
        content = f.read()

    lines = content.split("\n")[:20]
    print(f"[Rule: {rule_file}]")
    print("\n".join(lines))
    if len(lines) < len(content.split("\n")):
        print(f"({len(content.split(chr(10)))} total — use Read for full file)")

    sys.exit(0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Pre-tool freeze guard — blocks edits to frozen files and detects invariant violations.

Exit code 2 blocks the tool call. Blocking reason goes to stderr.
Exit code 0 with stdout message = warn but allow.
"""
import json
import sys
import re

# ── Level 1: Hard-frozen files (BLOCK on edit) ──────────────────────
FROZEN_PATTERNS = [
    "engine_v1/kernel.py",
    "engine_v1/validator.py",
    "engine_v1/audit.py",
    "models/audit_event.py",
    "models/calculation_run.py",
    "models/policy_revision.py",
    "core/security.py",
]

# ── Level 2: Invariant-aware content guards ─────────────────────────
# These detect dangerous CONTENT changes in specific files.
# Format: (file_pattern, description, regex_that_must_NOT_appear_in_new_string)
CONTENT_GUARDS = [
    # R1-R8 taxonomy: block deletion/renaming of risk codes
    ("engine/risk_classifier.py", "R1-R8 taxonomy modification",
     r'(?:R[1-8]\s*[:=].*(?:delete|remove|rename))|(?:#.*remove.*R[1-8])'),
    ("engine_v1/kernel.py", "R1-R8 taxonomy modification",
     r'(?:R[1-8]\s*[:=].*(?:delete|remove|rename))'),
    # Strategy-Instrument mapping: block remapping
    ("engine/instrument_mapper.py", "strategy-instrument mapping change",
     r'(?:Forward|Option|Collar|Swap|Futures|NDF|Participating).*(?:delete|remove|#)'),
    # WORM: block removal of NO_UPDATE/NO_DELETE triggers
    ("main.py", "WORM trigger removal",
     r'(?:DROP\s+TRIGGER|remove.*NO_UPDATE|remove.*NO_DELETE|delete.*trigger)'),
    # Hash chain: block changes to genesis hash or hash algorithm
    ("engine_v1/audit.py", "hash chain invariant modification",
     r'(?:GENESIS|genesis).*(?:=|:).*(?!0{64})'),
    # Middleware order: warn on reordering
    ("main.py", "middleware order change",
     r'add_middleware.*(?:CORS|GZip|Audit|RateLimit|APIKey|CSRF)'),
]

# ── Level 3: Warn-only patterns (exit 0 with stdout message) ───────
WARN_PATTERNS = [
    # SoD enforcement
    ("execution_proposal", "SoD enforcement logic — verify maker!=checker preserved"),
    # Auth boundary
    ("core/dependencies.py", "auth boundary — verify get_current_user unchanged"),
    ("deps/api_key_auth.py", "API key auth boundary — verify authentication logic"),
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

    # Level 1: Hard freeze (BLOCK)
    for pattern in FROZEN_PATTERNS:
        if pattern in normalized:
            print(
                f"FREEZE GUARD: Blocked edit to frozen file: {pattern}\n"
                f"This file is part of the v1 architecture freeze.\n"
                f"To modify, create an ADR in docs/architecture/adr/ first.",
                file=sys.stderr,
            )
            sys.exit(2)

    # Level 2: Content-aware invariant guards (BLOCK on dangerous content)
    new_string = tool_input.get("new_string", "") or tool_input.get("content", "")
    old_string = tool_input.get("old_string", "")

    if new_string:
        for file_pat, description, danger_re in CONTENT_GUARDS:
            if file_pat in normalized:
                # Check if the edit content matches a dangerous pattern
                if re.search(danger_re, new_string, re.IGNORECASE):
                    print(
                        f"INVARIANT GUARD: Potentially dangerous edit detected.\n"
                        f"File: {file_pat}\n"
                        f"Invariant: {description}\n"
                        f"Review carefully before proceeding. Create an ADR if this is intentional.",
                        file=sys.stderr,
                    )
                    sys.exit(2)

    # Level 3: Warn-only (allow but flag)
    for pattern, warning in WARN_PATTERNS:
        if pattern in normalized:
            print(f"INVARIANT WARNING: Editing {pattern} — {warning}")
            sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()

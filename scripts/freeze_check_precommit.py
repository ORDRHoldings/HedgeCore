#!/usr/bin/env python3
"""Pre-commit hook: blocks commits that modify frozen architecture files without ADR reference."""
import subprocess
import sys
import re

FROZEN_PATTERNS = [
    "engine_v1/kernel.py",
    "engine_v1/validator.py",
    "engine_v1/audit.py",
    "models/audit_event.py",
    "models/calculation_run.py",
    "models/policy_revision.py",
    "core/security.py",
]


def get_staged_files():
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only"], capture_output=True, text=True
    )
    return result.stdout.strip().split("\n") if result.stdout.strip() else []


def get_commit_msg_file():
    """Check if there's an ADR reference in the commit message (for commit-msg hook)."""
    # When used as pre-commit, we check staged files only
    return None


def main():
    staged = get_staged_files()
    violations = []

    for f in staged:
        normalized = f.replace("\\", "/")
        for pattern in FROZEN_PATTERNS:
            if pattern in normalized:
                violations.append(f)
                break

    if not violations:
        sys.exit(0)

    # Check if commit message references an ADR (only works as commit-msg hook)
    # For pre-commit, we always block frozen file changes
    print("=" * 60)
    print("ARCHITECTURE FREEZE VIOLATION")
    print("=" * 60)
    print()
    print("The following frozen files are staged for commit:")
    for v in violations:
        print(f"  - {v}")
    print()
    print("These files are part of the v1 architecture freeze.")
    print("To modify them, you must:")
    print("  1. Create an ADR in docs/architecture/adr/")
    print("  2. Reference the ADR in your commit message: [ADR-NNNN]")
    print("  3. Get explicit approval")
    print()
    print("To bypass (emergency only): git commit --no-verify")
    print("=" * 60)
    sys.exit(1)


if __name__ == "__main__":
    main()

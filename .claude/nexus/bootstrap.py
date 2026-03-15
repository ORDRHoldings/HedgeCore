#!/usr/bin/env python3
"""Bootstrap NEXUS into a new project.

Usage:
    python bootstrap.py <target_project_path>

Example:
    python bootstrap.py D:/Synexiun/1-SynexFund/HedgeCalc
    python bootstrap.py D:/Synexiun/1-SynexFund/MyNewProject
    python bootstrap.py .    (current directory)
"""
import shutil
import sys
import json
from pathlib import Path

NEXUS_SOURCE = Path(__file__).resolve().parent.parent  # .claude/ directory
PROJECT_SOURCE = NEXUS_SOURCE.parent  # ORDR Chart/

# Directories/files to copy (relative to .claude/)
COPY_TREE = [
    "nexus",          # Full engine
    "agents",         # Agent definitions
    "rules",          # Rule files
    "skills",         # Skill definitions
    "settings.json",  # Hook wiring
]

# Directories to create (empty, project-specific)
CREATE_DIRS = [
    "state",
]

# Files NOT to copy (project-specific data)
SKIP_PATTERNS = [
    "__pycache__",
    "*.pyc",
    "nexus.db",
    "bootstrap.py",  # Don't copy the bootstrap script itself into target
]


def should_skip(path: Path) -> bool:
    for pattern in SKIP_PATTERNS:
        if pattern.startswith("*"):
            if path.suffix == pattern[1:]:
                return True
        elif pattern in str(path):
            return True
    return False


def bootstrap(target_root: Path):
    target_root = target_root.resolve()
    target_claude = target_root / ".claude"

    if target_claude.exists():
        print(f"  [WARN] {target_claude} already exists")
        response = input("  Overwrite? (y/N): ").strip().lower()
        if response != "y":
            print("  Aborted.")
            sys.exit(0)

    print(f"NEXUS Bootstrap")
    print(f"  Source:  {NEXUS_SOURCE}")
    print(f"  Target:  {target_claude}")
    print()

    # Copy tree items
    for item in COPY_TREE:
        src = NEXUS_SOURCE / item
        dst = target_claude / item

        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(
                src, dst,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "nexus.db"),
            )
            count = sum(1 for _ in dst.rglob("*") if _.is_file())
            print(f"  [OK] Copied {item}/ ({count} files)")
        elif src.is_file():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            print(f"  [OK] Copied {item}")
        else:
            print(f"  [SKIP] {item} not found")

    # Create empty dirs
    for d in CREATE_DIRS:
        (target_claude / d).mkdir(parents=True, exist_ok=True)
        print(f"  [OK] Created {d}/")

    # Copy CLAUDE.md to project root (customize project name)
    claude_md_src = PROJECT_SOURCE / "CLAUDE.md"
    claude_md_dst = target_root / "CLAUDE.md"
    if claude_md_src.exists():
        content = claude_md_src.read_text(encoding="utf-8")
        # Replace project-specific line
        project_name = target_root.name
        content = content.replace(
            "## Project: ORDR Chart\n\nThis is the ORDR charting engine project. Follow charting-specific patterns in `.claude/rules/charting.md`.",
            f"## Project: {project_name}\n\nCustomize this section for your project.",
        )
        claude_md_dst.write_text(content, encoding="utf-8")
        print(f"  [OK] Created CLAUDE.md (customized for {project_name})")

    # Fix constants.py to be project-relative (it already uses __file__, so it's fine)
    print()

    # Initialize the database
    print("Initializing NEXUS database...")
    import subprocess
    result = subprocess.run(
        [sys.executable, str(target_claude / "nexus" / "nexus.py"), "init"],
        cwd=str(target_root),
        capture_output=True, text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        sys.exit(1)

    print(f"Done! NEXUS is ready in {target_root}")
    print()
    print("Next steps:")
    print(f"  cd {target_root}")
    print(f"  python .claude/nexus/nexus.py status")
    print(f"  python .claude/nexus/nexus.py start")
    print()
    print("Edit these for your project:")
    print(f"  {target_root}/CLAUDE.md              — Project constitution")
    print(f"  {target_claude}/rules/*.md            — Project-specific rules")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = Path(sys.argv[1])
    if not target.exists():
        print(f"Creating {target}...")
        target.mkdir(parents=True)

    bootstrap(target)


if __name__ == "__main__":
    main()

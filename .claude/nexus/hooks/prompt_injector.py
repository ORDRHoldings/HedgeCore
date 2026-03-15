#!/usr/bin/env python3
"""NEXUS Hook: UserPromptSubmit — analyze intent, inject relevant context + recommendations."""
import io
import json
import re
import sys
from pathlib import Path

# Fix Windows encoding
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent paths for imports
_hook_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_hook_dir.parent.parent))  # .claude/

# ── Intent keyword mapping ───────────────────────────────────────────
INTENT_KEYWORDS = {
    "fix": ["fix", "bug", "broken", "error", "issue", "crash", "debug", "failing"],
    "feature": ["add", "feature", "new", "create", "implement", "build"],
    "refactor": ["refactor", "restructure", "reorganize", "clean", "simplify", "optimize"],
    "test": ["test", "testing", "coverage", "spec", "assert", "verify"],
    "review": ["review", "check", "audit", "inspect", "look at", "examine"],
    "security": ["security", "vulnerability", "exploit", "cve", "auth", "permission", "secret"],
    "deploy": ["deploy", "release", "ship", "publish", "production", "ci/cd", "pipeline"],
}

# Map intents to relevant rule file patterns
INTENT_RULE_MAP = {
    "fix": ["debug", "quality", "testing"],
    "feature": ["architecture", "coding", "design"],
    "refactor": ["architecture", "quality", "coding"],
    "test": ["testing", "quality"],
    "review": ["review", "quality", "security"],
    "security": ["security", "compliance"],
    "deploy": ["deploy", "operations", "ci"],
}


def detect_intent(prompt: str) -> list[str]:
    """Detect intents from prompt text. Returns list of matched intent categories."""
    prompt_lower = prompt.lower()
    matched = []
    for intent, keywords in INTENT_KEYWORDS.items():
        for kw in keywords:
            if kw in prompt_lower:
                if intent not in matched:
                    matched.append(intent)
                break
    return matched


def load_relevant_rules(intents: list[str], rules_dir: Path) -> list[str]:
    """Load content from rules/*.md files relevant to detected intents."""
    if not rules_dir.exists():
        return []

    relevant_patterns = set()
    for intent in intents:
        patterns = INTENT_RULE_MAP.get(intent, [])
        relevant_patterns.update(patterns)

    loaded = []
    for md_file in sorted(rules_dir.glob("*.md")):
        file_name_lower = md_file.stem.lower()
        # Check if any relevant pattern matches the rule file name
        for pattern in relevant_patterns:
            if pattern in file_name_lower:
                try:
                    content = md_file.read_text(encoding="utf-8").strip()
                    if content:
                        loaded.append(f"[Rule: {md_file.stem}]\n{content}")
                except Exception:
                    pass
                break

    return loaded


try:
    # Read the user prompt from stdin
    prompt_input_raw = sys.stdin.read()
    if not prompt_input_raw.strip():
        sys.exit(0)

    try:
        prompt_data = json.loads(prompt_input_raw)
        user_prompt = prompt_data.get("user_prompt", "") or prompt_data.get("prompt", "")
    except json.JSONDecodeError:
        user_prompt = prompt_input_raw

    if not user_prompt.strip():
        sys.exit(0)

    # ── Detect intent ─────────────────────────────────────────────────
    intents = detect_intent(user_prompt)
    if not intents:
        sys.exit(0)

    injection_parts = []

    # ── Load relevant rules ───────────────────────────────────────────
    from nexus.constants import RULES_DIR

    rules = load_relevant_rules(intents, RULES_DIR)
    if rules:
        injection_parts.append("--- NEXUS Rules ---")
        injection_parts.extend(rules)

    # ── Load active patterns relevant to intent ───────────────────────
    from nexus.db.connection import readonly_connection

    with readonly_connection() as conn:
        # Get canon and promoted patterns
        patterns = conn.execute(
            "SELECT description, status, confidence FROM patterns "
            "WHERE status IN ('canon','promoted') "
            "ORDER BY confidence DESC LIMIT 10"
        ).fetchall()

        if patterns:
            pattern_lines = []
            for p in patterns:
                badge = "[CANON]" if p["status"] == "canon" else "[PROMOTED]"
                pattern_lines.append(f"  {badge} {p['description']} (confidence: {p['confidence']:.2f})")

            if pattern_lines:
                injection_parts.append("--- NEXUS Active Patterns ---")
                injection_parts.extend(pattern_lines)

        # ── Load top recommendations (score >= 0.70) ─────────────────
        recs = conn.execute(
            "SELECT r.recommendation, r.score, r.priority "
            "FROM recommendations r "
            "WHERE r.score >= 0.70 "
            "AND (r.expires_at IS NULL OR r.expires_at > datetime('now')) "
            "ORDER BY r.score DESC LIMIT 5"
        ).fetchall()

        if recs:
            rec_lines = []
            for r in recs:
                rec_lines.append(f"  [{r['priority'].upper()}] {r['recommendation']} (score: {r['score']:.2f})")

            injection_parts.append("--- NEXUS Recommendations ---")
            injection_parts.extend(rec_lines)

    # ── Output injection ──────────────────────────────────────────────
    if injection_parts:
        print("\n".join(injection_parts))

except Exception as e:
    # Never crash
    print(f"[NEXUS PromptInjector] Error: {e}", file=sys.stderr)

"""NEXUS constants: paths, versions, thresholds."""
import os
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # ORDR Chart/
CLAUDE_DIR = PROJECT_ROOT / ".claude"
NEXUS_DIR = CLAUDE_DIR / "nexus"
STATE_DIR = CLAUDE_DIR / "state"
AGENTS_DIR = CLAUDE_DIR / "agents"
RULES_DIR = CLAUDE_DIR / "rules"
SKILLS_DIR = CLAUDE_DIR / "skills"

DB_PATH = STATE_DIR / "nexus.db"

# State files
CURRENT_STATE = STATE_DIR / "CURRENT_STATE.md"
CURRENT_SPRINT = STATE_DIR / "CURRENT_SPRINT.md"
CHANGELOG_AI = STATE_DIR / "CHANGELOG_AI.md"
OPEN_RISKS = STATE_DIR / "OPEN_RISKS.md"
OPEN_DECISIONS = STATE_DIR / "OPEN_DECISIONS.md"
GOLDEN_ROLLUPS = STATE_DIR / "golden_rollups.md"

STATE_FILES = [CURRENT_STATE, CURRENT_SPRINT, CHANGELOG_AI, OPEN_RISKS, OPEN_DECISIONS, GOLDEN_ROLLUPS]

# ── Versions ───────────────────────────────────────────────────────────
NEXUS_VERSION = "1.0.0"
SCHEMA_VERSION = 1

# ── Learning Thresholds ────────────────────────────────────────────────
# Pattern promotion: observation → candidate → promoted → canon
PROMOTION_THRESHOLDS = {
    "candidate": {"min_evidence": 3, "min_confidence": 0.65},
    "promoted": {"min_evidence": 7, "min_confidence": 0.80},
    "canon": {"min_evidence": 15, "min_confidence": 0.90},
}

# Recommendation scoring weights
RECOMMENDATION_WEIGHTS = {
    "confidence": 0.30,
    "evidence": 0.20,
    "recency": 0.10,
    "context_match": 0.25,
    "effectiveness": 0.10,
    "rejection_penalty": 0.05,
}

# Auto-inject threshold
RECOMMENDATION_AUTO_INJECT = 0.85
RECOMMENDATION_SHOW_THRESHOLD = 0.70

# ── Self-Healing ───────────────────────────────────────────────────────
ORPHAN_SESSION_HOURS = 24
STATE_FILE_STALE_DAYS = 7

# ── Security ───────────────────────────────────────────────────────────
GENESIS_HASH = "0" * 64

# ── Agents ─────────────────────────────────────────────────────────────
AGENT_NAMES = [
    "commander", "architect", "coder", "reviewer",
    "cybersec", "data-scientist", "ml-engineer", "self-healer",
]

AGENT_ROLES = {
    "commander": "Orchestrate all agents, resolve conflicts, manage workflow",
    "architect": "Design integrity, ADRs, freeze enforcement",
    "coder": "Write code, tests, docs",
    "reviewer": "Code review, quality gates",
    "cybersec": "Vulnerability scanning, compliance",
    "data-scientist": "Pattern detection, statistical analysis",
    "ml-engineer": "Learning loop tuning, weight calibration",
    "self-healer": "Integrity checks, auto-repair",
}

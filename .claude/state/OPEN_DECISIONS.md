# Open Decisions

## Decided

### D-001: Hook execution model
- Context: Claude Code hooks can be shell commands or Python scripts. Windows bash compatibility matters.
- Decision: Python scripts via `python .claude/hooks/script.py` — more portable, SQLite access built-in.
- Status: DECIDED
- Date: 2026-03-07

### D-002: Memory.db vs auto-memory overlap
- Context: Auto-memory (MEMORY.md) and SQLite memory.db serve different purposes.
- Decision: Auto-memory = hot cross-session context. memory.db = structured queryable history. Both coexist.
- Status: DECIDED
- Date: 2026-03-07

### D-003: Root CLAUDE.md location
- Decision: Keep at repo root (Claude Code auto-loads it). Slim to pure constitution.
- Status: DECIDED
- Date: 2026-03-07

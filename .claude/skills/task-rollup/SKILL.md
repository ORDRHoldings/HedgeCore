---
name: task-rollup
description: Summarize current session into a concise rollup. Writes to SQLite memory.db and CHANGELOG_AI.md. Use when user says "rollup", "save session", or "write summary".
---

Summarize the current session into a concise rollup.

## Steps
1. Identify files changed this session: `git diff --name-only` and `git diff --cached --name-only`
2. Summarize what was accomplished (max 5 bullet points).
3. Record decisions made (if any).
4. Record risks identified (if any).
5. Write session_rollup to `.claude/state/memory.db`:
   ```sql
   INSERT INTO session_rollups (session_date, summary, files_changed, decisions_made, risks_identified, next_steps)
   VALUES (?, ?, ?, ?, ?, ?);
   ```
6. Append entry to `.claude/state/CHANGELOG_AI.md`.
7. Update `.claude/state/CURRENT_STATE.md` if state changed.

## Rollup Format (from golden_rollups.md)
```
SESSION ROLLUP — [date]
Changed: [count] files ([category summary])
Summary: [2-3 sentences]
Decisions: [list or "none"]
Verified: [what was tested]
Next: [concrete next step]
```

Keep output under 20 lines.

---
name: done
description: Mark a task as complete with evidence. Enforces completion discipline — code exists, validation ran, state updated, next step recorded, changelog updated. Use when user says "done", "mark done", "task complete", or "finish task".
---

Complete a task with full evidence chain.

## Checklist (all required)

1. **Implementation exists**: Identify which files were changed and confirm they exist.
2. **Validation ran**: Run at least one verification command (test, build, lint, or manual check). If not possible, record `[NOT VERIFIED]` with reason.
3. **State updated**: Update CURRENT_STATE.md and/or CURRENT_SPRINT.md to reflect the change.
4. **Next step recorded**: State the concrete next action (or "none" if truly complete).
5. **Changelog updated**: Append a concise entry to CHANGELOG_AI.md.
6. **Memory updated**: Write a session rollup to memory.db via:
   ```bash
   python .claude/hooks/task_completed.py <<< '{"summary":"...","files_changed":["..."],"next_steps":"..."}'
   ```

## Output Format
```
TASK COMPLETE — [title]
Files: [count] changed ([list])
Validated: [what was tested] | [NOT VERIFIED: reason]
State: [which state files updated]
Next: [concrete next step]
Changelog: appended
Rollup: written to memory.db
```

## Rules
- Never claim "done" without running at least one verification command
- Never skip the changelog entry
- If validation fails, the task is NOT done — fix first or mark as blocked

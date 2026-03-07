---
name: sprint-update
description: Update CURRENT_SPRINT.md with progress on active work items. Use when user says "sprint update", "update sprint", or "sprint status".
---

Update CURRENT_SPRINT.md with progress on active work items.

## Steps
1. Read `.claude/state/CURRENT_SPRINT.md` for current sprint items.
2. Query memory.db for work_items with status in ('open', 'in_progress').
3. Ask user for status updates on each item (or infer from recent changes).
4. Update work_items table.
5. Rewrite CURRENT_SPRINT.md with updated progress.

## Output Format
```
SPRINT UPDATE — [date]
Active items: [count]
Completed since last update: [count]
Blocked: [count]
Next priority: [item title]
Updated: CURRENT_SPRINT.md + memory.db
```

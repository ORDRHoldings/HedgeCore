---
name: status
description: One-command project status dashboard. Queries memory.db and state files for sprint progress, risks, sessions, freeze status, and validation trend. Use when user says "status" or "project status".
---

Query memory.db and state files for a complete project snapshot.

## Steps
Run Python against `.claude/state/memory.db`:
- Count work_items by status (open, in_progress, done, blocked)
- Query open_risks grouped by severity
- Fetch last 3 session_rollups
- Count validation_runs by result (pass/fail)
- Count architecture_freeze entries
- Count file_facts entries

Also read first 5 lines of `.claude/state/CURRENT_SPRINT.md`.

## Output Format
```
PROJECT STATUS — [date]
Sprint: [name] ([done]/[total] items, [blocked] blocked)
Risks:  [critical]C [high]H [medium]M [low]L
Freeze: [count] components locked
Files tracked: [count] in file_facts

Last 3 Sessions:
  [date] — [summary truncated to 60 chars]
  [date] — [summary truncated to 60 chars]
  [date] — [summary truncated to 60 chars]

Validations: [pass]P [fail]F
```

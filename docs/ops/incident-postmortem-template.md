# Incident Post-Mortem Template

Copy this file to `docs/ops/incidents/YYYY-MM-DD-<summary>.md` for each incident.

---

# Incident: [One-line summary]

**Date:** YYYY-MM-DD
**Severity:** Tier 1 / Tier 2 / Tier 3
**Duration:** HH:MM (from first alert to full recovery)
**Components affected:** [Backend / Frontend / Database / Market Data / Auth]
**Author:** [name or team]
**Status:** Draft / Final

---

## Timeline

| Time (UTC) | Event |
|-----------|-------|
| HH:MM | Incident first detected |
| HH:MM | Investigation started |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Service fully recovered |
| HH:MM | Post-mortem written |

---

## Impact

**Who was affected:** [e.g. all users, specific tenant, internal only]
**What was broken:** [e.g. login, FX calculations, position desk]
**Data integrity:** [Was any data corrupted or lost? Were WORM tables affected?]
**Audit chain:** [Was chain integrity maintained? Run `GET /v1/audit/chain/verify`]

---

## Root Cause

[1-3 sentences. Be specific. "The deploy failed because..." not "there was a problem."]

---

## Contributing Factors

- [Factor 1]
- [Factor 2]

---

## Detection

**How was the incident detected?**
[ ] UptimeRobot alert
[ ] Sentry error
[ ] User report
[ ] Manual check
[ ] Other: ___

**Time to detect:** HH:MM from incident start

---

## Resolution

**What fixed it?**
[Exact steps taken, commands run, config changes made]

**Was a rollback needed?** Yes / No
If yes: [which commit was rolled back to, and via what method]

---

## What Went Well

- [e.g. Keepalive cron limited blast radius]
- [e.g. DR playbook was accurate and followed correctly]

---

## What Could Be Improved

- [e.g. No alerting — manual detection took 2 hours]
- [e.g. DR playbook missing step for this case]

---

## Action Items

| Action | Owner | Due | Issue/PR |
|--------|-------|-----|---------|
| [Fix root cause] | - | YYYY-MM-DD | - |
| [Add monitoring for X] | - | YYYY-MM-DD | - |
| [Update DR playbook] | - | YYYY-MM-DD | - |

---

## Lessons Learned

[1-2 sentences. What does the team know now that it didn't know before?]

# Incident Response Plan

**Audience:** ORDR TreasuryFX on-call, founders, and any engineer who can deploy to production
**Scope:** Operational incidents (outage, degradation, data integrity, security)
**Companion:** `business-continuity.md` for BC/DR (longer horizon, broader disruptions)
**Last reviewed:** 2026-04-25 — review every 6 months and after every Sev-1

---

## Severity definitions

| Sev | Definition | Examples | Pager |
|---|---|---|---|
| **Sev-1** | Production unavailable, customer data integrity at risk, or active security incident | API 5xx for >5 min; DB write failures; suspected breach; hash chain divergence | Page everyone, 24/7 |
| **Sev-2** | Major degradation; some customers blocked; not data-integrity-affecting | Auth slow; market data feed down; one customer's tenant unreachable | Page on-call, business hours + after-hours |
| **Sev-3** | Minor degradation; workaround exists | One non-critical endpoint slow; flaky 3rd-party integration | Slack alert, business hours |
| **Sev-4** | Cosmetic or single-user | UI glitch; one user complains | Ticket only |

> If unsure, declare one level higher than your gut says. Down-grading is cheap; under-classifying is expensive.

---

## Roles during an incident

| Role | Who | What they do |
|---|---|---|
| **Incident Commander (IC)** | First responder, can re-assign | Owns the call. Drives decisions. Does NOT debug — they coordinate. |
| **Tech Lead (TL)** | Most-relevant engineer | Drives the technical investigation and remediation |
| **Comms** | Founder or CS lead | Writes status-page updates, emails affected customers |
| **Scribe** | Anyone | Maintains the incident timeline doc |
| **Liaison** (Sev-1 only) | Founder | Talks to affected enterprise customers directly |

In a small team, one person can hold two roles, but **never IC + TL together**. The IC must stay above the technical work or decisions go unmade.

---

## Sev-1 response — first 60 minutes

```
T+0:00   Detect (alert fires, customer reports, or staff notice)
T+0:02   Declare Sev-1 in #incident channel; first responder = IC
T+0:05   IC creates incident timeline doc; assigns TL, Comms, Scribe
T+0:10   First status-page update posted (even if it's "investigating")
T+0:15   TL reports first hypothesis; IC chooses path
T+0:30   Second status-page update; first email to affected customers if Customer Data is at risk
T+0:45   Either: rollback executed, or: scope narrowed and remediation underway
T+1:00   First post-incident-comms update; IC decides whether to maintain Sev-1 or downgrade
```

If T+0:45 and there is no plan for rollback or remediation, escalate: bring in the founder if not already, contact Render/Vercel support, page additional engineers.

---

## Detection sources

| Source | What it covers | Where it fires |
|---|---|---|
| Sentry | Application errors, performance | #alerts-sentry Slack |
| UptimeRobot / status page | Endpoint up/down | #alerts-uptime |
| Render dashboard | Service health, deploy status | Render UI + email |
| Vercel dashboard | Frontend deploy + edge | Vercel UI + email |
| Database alerts | Connection saturation, slow queries | Render Postgres metrics |
| Customer report | Anything we missed | Slack Connect / email |
| Hash-chain integrity check (cron) | WORM table tamper or divergence | Cron job + email + page |

The **hash-chain integrity check** is the highest-priority alert: a divergence implies either a real tamper attempt or a serious application bug touching WORM state. It is always Sev-1 even if the rest of the system looks fine.

---

## Common incident playbooks

### Playbook 1: API 5xx spike

1. Check Render service health → is the service up?
2. Check most recent deploy → did 5xx start at deploy time?
3. **If yes:** rollback (`Render → Deploys → Redeploy previous`). Investigate root cause after rollback.
4. **If no:** check DB connections, Redis status, market data feed
5. Tail Render logs: `render logs hedgecore --tail`
6. If DB-related: see Playbook 3
7. Status page: update every 15 minutes minimum during a Sev-1

### Playbook 2: Auth flow broken (login fails for everyone)

The two most common causes:
- **Schema drift** — ORM has columns absent from prod DB. Symptom: `/auth/me` returns 500 swallowed as 401, dashboard goes black. Fix per CLAUDE.md "Production Gotchas": `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `_ensure_tables()` in `app/core/db.py`.
- **JWT_SECRET mid-rotation gap** — see secret-rotation-runbook section A. If `JWT_SECRET_NEXT` was deleted before the cut-over, all sessions break.

Fast triage:
```
1. curl /api/v1/health/live   → service up?
2. curl /api/v1/auth/me with a known-good token → 200 or 5xx?
3. If 5xx: tail Render logs for ProgrammingError → schema drift
4. If 401: check Render env vars for missing/changed JWT_SECRET
```

Recovery:
- Schema drift: deploy a hot-fix migration. ETA <15 min.
- JWT issue: restore `JWT_SECRET` from the env-var revision history.

### Playbook 3: Database unavailable / connection saturation

1. Render → Postgres dashboard → check connection count + CPU
2. If saturation: identify offending query (Render slow query log) and either kill the connection or push a hot-fix
3. If down: contact Render support immediately (Pro plan SLA applies)
4. Customer comms: post status-page update; backend will return 5xx with a generic message — that's expected and safe (no data leak)
5. **Do not run `pg_dump` during the incident** — it adds load. Wait until recovery.

### Playbook 4: Hash chain divergence

The WORM hash chain (audit_events, calculation_runs, policy_revisions, ledger_entries) is per-tenant SHA-256 from GENESIS_HASH. Divergence means the chain doesn't recompute to the stored head.

1. **Stop all writes to the affected tenant immediately.** Toggle the tenant to read-only via the admin endpoint.
2. Snapshot the current state of all WORM tables for the affected tenant (pg_dump filtered by tenant_id)
3. Recompute the chain from GENESIS_HASH locally (use `app/engine_v1/audit.py` recompute helper)
4. Identify the first divergent row — that's where the integrity event occurred
5. Determine: real tamper or application bug?
   - Application bug → fix the code, replay from before the bug, rebuild the chain forward
   - Real tamper → security incident, follow the security playbook below
6. **Notify the affected Customer within 24 hours** per DPA breach-notification terms — even if the cause turns out to be benign, integrity-event disclosure is contractual

This is the single most consequential incident type for a governance platform. Rehearse it. Annually.

### Playbook 5: Market data feed down (TwelveData)

1. The cache is fail-open by design — recent quotes still served from Redis until TTL expires
2. Once TTL expires, market endpoints return stale-data warnings
3. Status: Sev-2 (degradation, not outage)
4. Switch to backup feed if configured (manual env-var swap; see backup-feed runbook)
5. Notify customers — pricing decisions made during the gap should be flagged in their audit log

### Playbook 6: Suspected security incident

1. **Do not investigate in production.** Snapshot, then investigate from the snapshot.
2. Page founder + IC + TL + (if available) external counsel
3. Preserve evidence — Render log retention, audit_events table, application logs
4. Determine scope: who/what/when. Pull from audit_events and rate-limit logs.
5. Assess Personal Data Breach criteria per GDPR Art. 33:
   - If yes → DPO notification + 72-hour clock starts on ICO/lead supervisory authority
6. Customer notification — per DPA, "without undue delay" after becoming aware
7. Rotate every secret in scope (see secret-rotation-runbook section G)
8. Engage incident-response counsel before any external statement

---

## Status-page communication

Use this template structure. Update every 15 min during Sev-1.

```
[Investigating] We are aware of an issue affecting [scope]. Customers may experience [impact]. We are investigating. Posted [HH:MM UTC].

[Identified] We have identified the cause as [neutral description]. We are deploying a fix. ETA [time].

[Monitoring] A fix has been deployed. We are monitoring. Affected window was [HH:MM] – [HH:MM] UTC.

[Resolved] The incident is resolved. Total impact window: [HH:MM] – [HH:MM] UTC. A post-mortem will be published within 5 business days.
```

Rules:
- Never blame a third party publicly during the incident, even if accurate ("Render is down" — say "an upstream provider")
- Never speculate about cause until "Identified"
- Never promise a specific ETA without 80% confidence
- Always include the affected window in "Resolved"

---

## Customer comms (direct email)

For Sev-1 affecting specific customers, send a direct email within 30 minutes of declaration:

```
Subject: [ORDR Status] Service incident — [scope]

[Customer name],

We are currently working through an incident affecting [scope]. [Impact statement.]

Status page: https://status.ordrtreasuryfx.com
Started: [HH:MM UTC]
Current status: [Investigating / Identified / Monitoring]

We will send another update by [time + 1 hour] regardless of progress.

If you need immediate assistance: [phone / Slack Connect].

— ORDR On-call
```

For Sev-2 with isolated customer impact, the email is sent only to affected customers, not all-hands.

---

## Post-incident review

Every Sev-1 and Sev-2 generates a post-mortem within 5 business days.

### Post-mortem template

```markdown
# Post-mortem: [title]

**Date:** [YYYY-MM-DD]
**Severity:** Sev-[1|2]
**Affected window:** [start] – [end] UTC ([duration])
**Author:** [name]
**Contributors:** [names]

## Summary
[2–3 sentences: what happened, who was affected, how it was resolved.]

## Impact
- Customers affected: [list or "all customers"]
- Endpoints affected: [list]
- Customer Data affected: [yes/no, scope]
- Regulatory notification triggered: [yes/no, which]

## Timeline
[Verbatim timeline from the incident doc, with times in UTC]

## Root cause
[Technical root cause. Be specific. Avoid blame language.]

## What went well
- [Bullet]
- [Bullet]

## What went poorly
- [Bullet]
- [Bullet]

## Action items
| # | Item | Owner | Target | Status |
|---|---|---|---|---|
| 1 | [Specific, testable action] | [name] | [date] | [open/done] |

## Lessons learned
[1–3 paragraphs. What does the team take away from this?]
```

Action items must be:
- **Specific** — "fix flaky tests" is not specific; "remove `requires_postgres` skip from `test_audit_chain_recompute` and run on PG in CI" is
- **Owned** — one name per item
- **Bounded** — has a target date

Action items become tickets, immediately. No action item is allowed to live only in the post-mortem doc.

---

## Drills

### Quarterly

- [ ] One Sev-2 simulation (game day): take down a non-critical service, run the playbook
- [ ] Backup-restore drill: restore yesterday's DB backup to a sandbox, verify integrity
- [ ] Status-page drill: post and resolve a fake incident on a separate test page

### Annually

- [ ] Full Sev-1 simulation with everyone on call
- [ ] Hash-chain divergence drill (controlled, in sandbox tenant)
- [ ] Tabletop with founder + counsel: simulated breach, walk through customer + regulator notifications

---

## Contacts

| Role | Channel | Hours |
|---|---|---|
| ORDR On-call | PagerDuty / phone tree | 24/7 for Sev-1, business hours otherwise |
| Founder | [phone] | Sev-1 always; Sev-2 if requested |
| Render support | dashboard ticket + Pro plan phone | 24/7 |
| Vercel support | dashboard ticket | 24/7 (Pro plan) |
| External counsel (incident response) | [firm + after-hours line] | 24/7 |
| External counsel (privacy / regulatory) | [firm] | Business hours (urgent: cell) |
| Cyber-insurance carrier (claims) | [number + policy #] | 24/7 |
| Lead supervisory authority (ICO for UK customers) | [contact form] | Business hours |

# Current Sprint

Sprint: Infrastructure Hardening
Status: IN PROGRESS
Started: 2026-04-22

## Goal
Implement the 11-issue remediation plan from `docs/superpowers/plans/2026-03-24-infrastructure-hardening.md`.

## Items
| # | Item | Status |
|---|------|--------|
| I1 | CORS localhost in IaC → env group | OPEN |
| I2 | Redis fallback logging | OPEN |
| I3 | SQLite demo mode warning | OPEN |
| I4 | Seed user rehash check-before-hash | OPEN |
| I5 | OpenAI soft dependency | OPEN |
| I6 | Tenant isolation test suite | OPEN |
| I7 | Free-tier infra comment in render.yaml | OPEN |
| I8 | Alembic baseline + forward migration wiring | OPEN |
| I9 | Alembic runbook docs | OPEN |

## Pre-flight Status
| Issue | Status |
|-------|--------|
| #3 deprecated `on_event` | ✅ Already removed |
| #4 Frontend monorepo | 🔲 Out of scope |
| #7 Free-tier infra | 🔲 Documented |
| #1 DDL-as-code | ❌ Fix needed |
| #2 Seed rehash on boot | ❌ Fix needed |
| #5 SQLite demo backdoor | ❌ Fix needed |
| #6 CORS localhost in IaC | ❌ Fix needed |
| #8 OpenAI hard dependency | ❌ Fix needed |
| #9 Redis no-warning fallback | ❌ Fix needed |
| #10 No tenant isolation tests | ❌ Fix needed |
| #11 execution_proposals drift | ✅ Fixed by Alembic strategy |

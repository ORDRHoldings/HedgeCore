# ADR-0021: Alembic Metadata Completeness & Schema-Bootstrap Reconciliation

- **Status:** proposed
- **Date:** 2026-05-30
- **Deciders:** Backend / Database
- **Related:** `LAUNCH_READINESS_AUDIT_2026-05-29.md` (claims independently re-verified), CLAUDE.md §9.2 (schema drift), `backend/app/main.py::_ensure_tables`

## Context

The 2026-05-29 launch-readiness audit asserted two database "P0" defects. Both were
**independently re-verified** before this ADR was written, and the findings were
**partially overstated** — but a real, smaller kernel of technical debt remains.

### Claim 1 — "`migrations/env.py` is missing ~25 model imports" → overstated, but real partial gap

`migrations/env.py` does **not** omit ~25 modules. Its docstring states the intent —
"Import every model module found in `app/models/`" — but the implementation was a
hand-maintained `_safe_import(...)` list that had drifted. Verified state at audit time:

- `app/models/` contains **51** model modules.
- The hand-maintained list imported **34** of them (already including `debt`, `ir_risk`,
  `intelligence`, `support_ticket`, `import_batch`, `market_snapshot`, `report_schedule`,
  `saved_report` — all of which the audit incorrectly listed as "missing").
- **~15** modules were genuinely unswept: `bank_statement`, `cash`, `cash_forecast`,
  `cash_netting`, `cash_pool`, `compliance_evidence`, `counterparty`,
  `custom_report_template`, `hedge_template`, `journal_entry`, `payment`,
  `regulatory_submission`, `settlement_event`, `transaction_cost_estimate`,
  `treasury_transaction`, `webhook` (`user` is imported directly as the `Base` anchor).

Impact: `alembic revision --autogenerate` would not see those models' tables in
`Base.metadata` and could emit destructive `drop_table` ops for them. This is real,
though narrower than "25 missing."

### Claim 2 — "~40 tables exist only in raw DDL in `_ensure_tables()`" → real, self-documented bridge

`backend/app/main.py::_ensure_tables()` contains ~42 `CREATE TABLE IF NOT EXISTS`
statements plus WORM triggers and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` guards. It is
self-described in-code as the "legacy schema bootstrap bridge." It is a genuine
maintainability liability (schema authority split between raw DDL and Alembic), but it is
an intentional, idempotent safety net — not an accidental omission. `migrations/env.py`
is **not** a frozen file (the frozen set is `engine_v1/kernel.py`, `validator.py`,
`audit.py`, the three WORM models, and `core/security.py`).

## Decision

### 1. (Implemented in this change) Auto-discover all model modules in `env.py`

Replace the hand-maintained `_safe_import(...)` list with a `pkgutil.iter_modules`
walk over the `app.models` package, retaining the existing per-module `try/except`
(`_safe_import`) so one broken module never blocks the rest. This fulfils the file's
stated intent and keeps autogenerate complete for all current and future models.

**Verification (this change):**
- All **51** model modules import cleanly (0 failures, no duplicate-table registration).
- `Base.metadata` now registers **85** tables (previously fewer); all previously-unswept
  treasury tables (`cash_forecast_items`, `counterparties`, `journal_entries`,
  `payment_instructions`, `settlement_events`, `transaction_cost_estimates`,
  `treasury_transactions`, `regulatory_submissions`, `bank_statements`) are present.
- `alembic heads` loads `env.py` and reports a single head
  (`0036_force_rls_tenant_context`), exit 0.

### 2. (Deferred — follow-up work) Reconcile `_ensure_tables()` into versioned migrations

`_ensure_tables()` remains as the idempotent bootstrap bridge for now. The follow-up is
to author a squashed Alembic baseline that encodes the raw DDL (tables, WORM triggers,
column guards) so a fresh database can be built from `alembic upgrade head` alone, after
which `_ensure_tables()` can be reduced to column-drift guards only. This is a larger,
higher-risk migration change and is **explicitly out of scope for this ADR's
implementation**; it requires its own change with a Postgres-backed verification run
(the SQLite CI path cannot exercise the WORM triggers).

#### Empirical drift measurement (2026-05-30, fresh Postgres)

`alembic upgrade head` was run against a fresh Postgres database (isolated scratch DB,
dropped after) to measure the real drift — a test the source audit never performed:

- **The chain completes to head `0036_force_rls_tenant_context` (exit 0)** and builds
  **58 tables** — including every treasury table the audit claimed was "raw-DDL only"
  (`counterparties`, `cash_forecast_items`, `journal_entries`, `payment_instructions`,
  `transaction_cost_estimates`, `regulatory_submissions`, `settlement_events`, …). The
  audit's "~40 tables exist only in `_ensure_tables`" and "baseline is a no-op stamp"
  claims are **largely false**.
- **Exactly 24 tables are genuinely `_ensure_tables`-only** (absent from every migration):
  `audit_datasets`, `audit_findings`, `audit_reports`, `audit_runs`, `audit_transactions`,
  `branches`, `connector_run_errors`, `connector_runs`, `decision_proposals`,
  `decision_runs`, `departments`, `execution_packets`, `hedge_effectiveness_datasets`,
  `hedge_effectiveness_runs`, `import_batches`, `market_snapshots`, `policy_instances`,
  `policy_templates`, **`positions`**, `report_schedules`, `saved_reports`,
  `support_tickets`, `ticket_events`, `user_policy_favorites`, `user_watchlists`.
- **Critical:** the core `positions` table is in that set — it is created only by
  `_ensure_tables`. Migration `0036` force-applies RLS to `positions` behind an
  `IF EXISTS (SELECT 1 FROM pg_class WHERE relname='positions')` guard, so on a
  pure-Alembic database `positions` is never created **and its RLS forcing silently
  no-ops**. `_ensure_tables` (`RUN_SCHEMA_BOOTSTRAP_ON_STARTUP`) is therefore genuinely
  load-bearing today; it must not be removed before the baseline migration lands.
- **PG version floor:** migration `4dfe7c45fffe` calls `gen_random_uuid()`, built-in only
  on **PostgreSQL 13+** (prod is PG17 ✓). On PG ≤12 the chain needs
  `CREATE EXTENSION pgcrypto` first. The baseline migration should add an explicit
  `CREATE EXTENSION IF NOT EXISTS pgcrypto` for portability.

The follow-up reconciliation is thus a **precisely bounded** task: migrate these 25 named
tables (with their WORM triggers / RLS for `positions`) into a versioned baseline, then
reduce `_ensure_tables()` to column-drift guards.

#### Implementation status — migration `0037_baseline_residual_tables`

Implemented on branch `feat/alembic-baseline-residual-tables`. The migration extracts
**158 statements verbatim** from `_ensure_tables` (via AST, no hand-transcription):
- the **115** statements for the **25 residual tables**, plus
- the **43 `ADD COLUMN IF NOT EXISTS` patches** that `_ensure_tables` applies to
  alembic-managed tables (`users.company_id/created_at/token_version`, `companies.plan_tier`,
  `execution_proposals.*` (21 cols), `roles.hierarchy_level`, `ledger_entries.company_id`,
  `staging_artifacts.company_id`, …) — without which `/auth`-path queries `500` on a
  pure-alembic schema (`column users.company_id does not exist`),
and re-applies the canonical `positions` tenant-RLS (enable + 4 policies + FORCE).

Verified on a fresh Postgres (PG12 + `pgcrypto`):
- `alembic upgrade head` → single head `0037`, exit 0, **83 tables** (was 58); all 25
  residual tables + 43 column-patches present.
- `positions`: `relrowsecurity = t` **and** `relforcerowsecurity = t`, all 4
  `positions_tenant_isolation_*` policies.
- Reversible + idempotent; `tests/test_db_migrations.py` + route smoke pass; freeze clean.
- **37 RLS/tenant-isolation integration tests pass** (`test_rls_tenant_isolation`,
  `test_dashboard_rls_injection`, `test_pipeline_tenant_isolation`) against the
  `0037`-built schema — behavioural isolation confirmed, not just schema shape.

#### ⚠️ Security-sensitive finding surfaced by the `requires_postgres` suite

Running the full `requires_postgres` suite against schemas built two ways revealed a
**latent RLS gap in the current build order**, and a behavioural interaction `0037` must
be reviewed against:

- **prod-equivalent build** (lifespan order: `alembic upgrade` **then** `_ensure_tables`):
  `positions` ends up with `relrowsecurity=false`, `relforcerowsecurity=false`,
  **0 policies**. Both `k1a2b3c4d5e6` (creates policies) and `0036` (FORCE) are
  `IF EXISTS`-guarded and **skip** because `positions` does not exist when they run.
  → On a **fresh** DB bootstrapped in this order, `positions` tenant-RLS is **never
  applied** (RISK-AUTH-RLS-02 class). Exposure for long-lived prod DBs depends on whether
  `positions` already existed when `0036` first ran — **needs verification against prod's
  actual `RUN_ALEMBIC_ON_STARTUP` / `RUN_SCHEMA_BOOTSTRAP_ON_STARTUP` sequence.**
- **`0037` build:** `positions` RLS is deterministically forced. This is *more* secure, but
  surfaces **45 `requires_postgres` tests** that pass only when `positions` RLS is **not**
  enforced (they never set `app.current_tenant_id` / `app.bypass_tenant_rls` and connect as
  the table owner under `FORCE`). The same 45 **pass** on the prod-equivalent (unforced)
  schema. These tests — not `0037` — assume an unforced `positions`; they must be updated to
  set tenant context (or use the bypass) before `0037` can merge.

**Gating before merge (not done):** (1) decide/verify the **intended** `positions` RLS posture
and whether current prod is exposed; (2) update the 45 tenant-context-less tests; (3) **PG17**
parity run (PG12 was a local proxy); (4) keep `_ensure_tables` until all land.

## Consequences

**Positive**
- `alembic revision --autogenerate` is now safe against the full model set — no
  destructive ops for the ~15 previously-unswept treasury models.
- Future model modules are swept automatically; no hand-maintained list to drift again.

**Negative / risks**
- A model module that raises on import now logs a warning during Alembic runs instead of
  being silently absent. This is strictly more visible (acceptable).
- Schema authority remains split until Decision 2 lands; CLAUDE.md §9.2 stays the
  operating guidance (add `ADD COLUMN IF NOT EXISTS` to `_ensure_tables()` for new ORM
  columns) until the baseline reconciliation is done.

## References

- `backend/migrations/env.py` (this change)
- `backend/app/main.py::_ensure_tables` (lines 367–1792)
- CLAUDE.md §9.2 (schema drift gotcha)
- `LAUNCH_READINESS_AUDIT_2026-05-29.md` §7 (claims re-verified here)

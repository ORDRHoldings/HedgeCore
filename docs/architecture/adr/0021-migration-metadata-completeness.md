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
